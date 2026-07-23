import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, agents } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { notifyRunTerminal } from './inbox-writer.js';
import { abortRun, hasRunAbort } from './run-control.js';
import { clearToolInflight, getToolInflight } from './tool-watchdog-state.js';

/**
 * F3 + C2 超时分层（学 Multica config.go）：
 * - chat：进程心跳 2min 无 touch → fail（worker 假死）；另有 wall MA_CHAT_TIMEOUT_MS
 * - issue/QC：无 tool 时 idle（默认 30min 无 agent 事件）→ fail
 * - issue/QC：tool in-flight 时改用 tool idle（默认 2h，MA_ISSUE_TOOL_IDLE_MS）
 * - 可选 wall MA_ISSUE_TIMEOUT_MS
 * - 不再对 issue 每 5s 无脑 pulse（否则 idle 永不到）
 */
/** chat / 进程存活：2 分钟无 heartbeat → fail */
export const STALE_RUNNING_MS = 120_000;
/** issue/QC 默认 idle：30 分钟（对齐 Multica DefaultAgentIdleWatchdog） */
export const DEFAULT_ISSUE_IDLE_MS = 30 * 60_000;
/** OpenCode 默认短 idle：10 分钟 */
export const DEFAULT_OPENCODE_IDLE_MS = 10 * 60_000;
/** issue/QC tool in-flight 窗口：2 小时（对齐 Multica DefaultAgentToolWatchdog） */
export const DEFAULT_ISSUE_TOOL_IDLE_MS = 2 * 60 * 60_000;
/** queued 过久无人 claim（agent 缺失/worker 卡死）→ fail；默认 30 分钟 */
export const STALE_QUEUED_MS = 30 * 60_000;
export const STALE_SWEEP_INTERVAL_MS = 15_000;

function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === '0' || raw === 'false') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** issue/QC 无事件 idle 阈值；支持 provider 差异化（如 opencode 10m）；0=关闭 idle 收尸 */
export function getIssueIdleMs(runtime?: string): number {
  if (runtime === 'opencode') {
    return envMs('MA_OPENCODE_IDLE_MS', DEFAULT_OPENCODE_IDLE_MS);
  }
  return envMs('MA_ISSUE_IDLE_MS', DEFAULT_ISSUE_IDLE_MS);
}

/**
 * tool in-flight 时的无事件阈值（学 Multica AgentToolWatchdog）。
 * 0=关闭 tool 窗口（退回与 idle 相同或关闭：若 idle 也 0 则不收尸）。
 */
export function getIssueToolIdleMs(): number {
  return envMs('MA_ISSUE_TOOL_IDLE_MS', DEFAULT_ISSUE_TOOL_IDLE_MS);
}

/** issue/QC wall-clock；0=不硬杀（默认，学 Multica AgentTimeout=0） */
export function getIssueWallTimeoutMs(): number {
  return envMs('MA_ISSUE_TIMEOUT_MS', 0);
}

export function formatDurationMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export type RunRecoveryReport = {
  orphanRunning: number;
  staleRunning: number;
  staleQueued: number;
  missingAgentQueued: number;
  total: number;
};

/** 仅更新仍 running 的 run 的 last_heartbeat_at */
export function touchRunHeartbeat(runId: string, at = Date.now()): void {
  db.update(agentRuns)
    .set({ lastHeartbeatAt: at })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, 'running')))
    .run();
}

/**
 * running 超时收尸：
 * - chat：STALE_RUNNING_MS 无 heartbeat（进程 pulse）
 * - issue/quick_create：MA_ISSUE_IDLE_MS / MA_OPENCODE_IDLE_MS 无活动 heartbeat（事件 touch）
 */
export function failStaleRunningRuns(now = Date.now()): number {
  const issueToolIdleMs = getIssueToolIdleMs();
  const candidates = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'running'))
    .all();

  let n = 0;
  for (const row of candidates) {
    const kind = (row.kind as string) ?? 'issue';
    const hb = row.lastHeartbeatAt ?? row.startedAt ?? row.createdAt;
    let limitMs: number;
    let error: string;
    let failureReason: 'idle_watchdog' | 'tool_watchdog' | 'stale_heartbeat' | 'exec_error' | 'timeout';

    if (kind === 'chat') {
      limitMs = STALE_RUNNING_MS;
      if (hb > now - limitMs) continue;
      error = 'stale: heartbeat timeout';
      failureReason = 'stale_heartbeat';
    } else {
      // issue | quick_create | 其它：tool in-flight → tool window，否则 idle
      const inflight = getToolInflight(row.id);
      if (inflight.depth > 0) {
        limitMs = issueToolIdleMs;
        if (limitMs <= 0) continue; // tool 窗口关闭 = 不因 tool 杀
        if (hb > now - limitMs) continue;
        const tool = inflight.lastToolName?.trim() || 'unknown';
        error = `stale: tool watchdog (tool ${tool} in flight, no events for ${formatDurationMs(limitMs)})`;
        failureReason = 'tool_watchdog';
      } else {
        limitMs = getIssueIdleMs(row.runtime);
        if (limitMs <= 0) continue; // idle 关闭
        if (hb > now - limitMs) continue;
        error = `stale: idle timeout (no agent events for ${formatDurationMs(limitMs)})`;
        failureReason = 'idle_watchdog';
      }
    }

    // 仍有内存 abort 但 hb 过旧：视为假死/静默，照样 fail
    const finishedAt = now;
    db.update(agentRuns)
      .set({
        status: 'failed',
        finishedAt,
        error,
        failureReason,
      })
      .where(and(eq(agentRuns.id, row.id), eq(agentRuns.status, 'running')))
      .run();
    const next = db.select().from(agentRuns).where(eq(agentRuns.id, row.id)).get();
    if (next?.status === 'failed') {
      clearToolInflight(row.id);
      abortRun(row.id); // 尽量杀仍挂着的 CLI
      const run = toAgentRun(next);
      eventBus.publish({ type: 'run:failed', run });
      notifyRunTerminal(run);
      n++;
    }
  }
  return n;
}

/** 启动时：DB 中 running 但本进程无 AbortController → 上轮崩溃残留 */
export function recoverOrphanedRunningRuns(now = Date.now()): number {
  const rows = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'running'))
    .all();
  let n = 0;
  for (const row of rows) {
    if (hasRunAbort(row.id)) continue;
    db.update(agentRuns)
      .set({
        status: 'failed',
        finishedAt: now,
        error: 'orphan: no live executor after restart',
        failureReason: 'stale_heartbeat',
      })
      .where(and(eq(agentRuns.id, row.id), eq(agentRuns.status, 'running')))
      .run();
    const next = db.select().from(agentRuns).where(eq(agentRuns.id, row.id)).get();
    if (next?.status === 'failed') {
      const run = toAgentRun(next);
      eventBus.publish({ type: 'run:failed', run });
      notifyRunTerminal(run);
      n++;
    }
  }
  if (n > 0) console.warn(`[run] recovered ${n} orphaned running run(s)`);
  return n;
}

/** queued 过久未 claim → failed（对齐 Multica stale 清扫精神，本地无 prepare_lease） */
export function failStaleQueuedRuns(now = Date.now()): number {
  const cutoff = now - STALE_QUEUED_MS;
  const candidates = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'queued'))
    .all();

  let n = 0;
  for (const row of candidates) {
    if (row.createdAt > cutoff) continue;
    db.update(agentRuns)
      .set({
        status: 'failed',
        finishedAt: now,
        error: 'stale: queued too long without claim',
        failureReason: 'idle_watchdog',
      })
      .where(and(eq(agentRuns.id, row.id), eq(agentRuns.status, 'queued')))
      .run();
    const next = db.select().from(agentRuns).where(eq(agentRuns.id, row.id)).get();
    if (next?.status === 'failed') {
      const run = toAgentRun(next);
      eventBus.publish({ type: 'run:failed', run });
      notifyRunTerminal(run);
      n++;
    }
  }
  return n;
}

/** queued 或 waiting_local_directory 但 agent 已删除 → 立即 fail（避免永久挂起） */
export function failQueuedMissingAgentRuns(now = Date.now()): number {
  const candidates = db
    .select()
    .from(agentRuns)
    .where(inArray(agentRuns.status, ['queued', 'waiting_local_directory']))
    .all();
  let n = 0;
  for (const row of candidates) {
    const agent = db.select().from(agents).where(eq(agents.id, row.agentId)).get();
    if (agent) continue;
    db.update(agentRuns)
      .set({
        status: 'failed',
        finishedAt: now,
        error: 'orphan: agent missing for queued run',
        failureReason: 'exec_error',
      })
      .where(
        and(
          eq(agentRuns.id, row.id),
          inArray(agentRuns.status, ['queued', 'waiting_local_directory']),
        ),
      )
      .run();
    const next = db.select().from(agentRuns).where(eq(agentRuns.id, row.id)).get();
    if (next?.status === 'failed') {
      const run = toAgentRun(next);
      eventBus.publish({ type: 'run:failed', run });
      notifyRunTerminal(run);
      n++;
    }
  }
  return n;
}

/** 动态续租：为 waiting_local_directory 状态的 Run 更新心跳时间，防止 30m 超时误杀 */
export function touchWaitingLocalDirectoryLeases(now = Date.now()): number {
  const candidates = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'waiting_local_directory'))
    .all();

  let n = 0;
  for (const row of candidates) {
    db.update(agentRuns)
      .set({ lastHeartbeatAt: now })
      .where(
        and(
          eq(agentRuns.id, row.id),
          eq(agentRuns.status, 'waiting_local_directory'),
        ),
      )
      .run();
    n++;
  }
  return n;
}

/** 运维/启动共用：一次扫完 orphan running + stale running/queued + missing agent + 续租目录锁 */
export function recoverStuckRuns(now = Date.now()): RunRecoveryReport {
  touchWaitingLocalDirectoryLeases(now);
  const orphanRunning = recoverOrphanedRunningRuns(now);
  const staleRunning = failStaleRunningRuns(now);
  const missingAgentQueued = failQueuedMissingAgentRuns(now);
  const staleQueued = failStaleQueuedRuns(now);
  const total = orphanRunning + staleRunning + missingAgentQueued + staleQueued;
  if (total > 0) {
    console.warn(
      `[run] recoverStuckRuns total=${total} orphanRunning=${orphanRunning} staleRunning=${staleRunning} missingAgentQueued=${missingAgentQueued} staleQueued=${staleQueued}`,
    );
  }
  return { orphanRunning, staleRunning, staleQueued, missingAgentQueued, total };
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startStaleRunSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    try {
      // 周期清扫与目录锁动态续租
      touchWaitingLocalDirectoryLeases();
      failStaleRunningRuns();
      failQueuedMissingAgentRuns();
      failStaleQueuedRuns();
    } catch (e) {
      console.error('[run] stale sweep failed', e);
    }
  }, STALE_SWEEP_INTERVAL_MS);
}
