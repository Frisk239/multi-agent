import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, agents, activityLogs } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { notifyDeferredUnclaimed, notifyRunTerminal, notifySquadEscalated } from './inbox-writer.js';
import { readInboxPrefs } from './inbox-prefs.js';
import { abortRun, hasRunAbort } from './run-control.js';
import { clearToolInflight, getToolInflight } from './tool-watchdog-state.js';
import { logger } from '../logger.js';
import { markWorkerStarted, markWorkerStopped, noteWorkerTick } from '../process-health.js';
import {
  hasActiveAutoRetryChild,
  transitionAndScheduleAutoRetry,
} from './auto-retry.js';

function publishFailedRun(
  row: typeof agentRuns.$inferSelect,
  now: number,
  scheduledChild?: ReturnType<typeof toAgentRun> | null,
): void {
  const baseRun = toAgentRun(row);
  const run = scheduledChild
    ? {
        ...baseRun,
        autoRetryStatus: 'scheduled' as const,
        autoRetryChildId: scheduledChild.id,
        autoRetryNextAttemptAt: scheduledChild.nextAttemptAt ?? null,
      }
    : baseRun;
  eventBus.publish({ type: 'run:failed', run });
  if (!scheduledChild && !hasActiveAutoRetryChild(row.id)) notifyRunTerminal(run);
}

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
/**
 * waiting_local_directory 墙钟上限：默认 2h。
 * 短路径锁等待靠 touchWaitingLocalDirectoryLeases 续租；此上限防永久挂起。
 * 环境变量 MA_WAITING_LOCAL_MAX_MS；0=关闭（不 fail）。
 */
export const DEFAULT_WAITING_LOCAL_MAX_MS = 2 * 60 * 60_000;
/**
 * Slice 68 · prepare_lease（学 Multica FailStale / prepare_lease_expires_at 精神，单进程）。
 * claim→running 后至 executor 稳定（registerRunAbort）前的半 claim 窗。
 * MA_PREPARE_LEASE_MS；0=关闭（claim 不写 lease，sweeper no-op）。
 */
export const DEFAULT_PREPARE_LEASE_MS = 120_000;
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

/** waiting_local_directory 最大等待；0=关闭墙钟 fail */
export function getWaitingLocalMaxMs(): number {
  return envMs('MA_WAITING_LOCAL_MAX_MS', DEFAULT_WAITING_LOCAL_MAX_MS);
}

/**
 * Slice 68：半 claim prepare lease 时长；0=关闭。
 * 默认 120s，覆盖 resolveCwd / resolvePrompt / session 等 prepare 路径。
 */
export function getPrepareLeaseMs(): number {
  return envMs('MA_PREPARE_LEASE_MS', DEFAULT_PREPARE_LEASE_MS);
}

/**
 * Slice 42 / D5 + Slice 70：queued 过久未 claim → deferred 升级（可观测，不 fail）。
 *
 * **默认关**（返回 0）：无自动升级 / 无静默改派。
 *
 * Opt-in（任一即可）：
 * - `MA_DEFERRED_UNCLAIMED_MS>0` → 用该阈值（Slice 42）
 * - `MA_DEFERRED_AUTO_ESCALATE=1|true` → 开启；阈值优先 env MS，否则建议值 30min
 * - Settings/prefs `deferredAutoEscalate: true` → 同上
 *
 * 开启后行为：写 inbox + activity（含「建议改派」草稿 note）；**不**改 assignee。
 */
/** 建议阈值：30min（Settings 文案 / AUTO_ESCALATE 默认） */
export const SUGGESTED_DEFERRED_UNCLAIMED_MS = 30 * 60_000;

function envTruthy(name: string): boolean {
  const raw = process.env[name];
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/** prefs / env 是否显式 opt-in deferred 升级（阈值可能仍来自建议值） */
export function isDeferredAutoEscalateOptIn(): boolean {
  if (envTruthy('MA_DEFERRED_AUTO_ESCALATE')) return true;
  try {
    return Boolean(readInboxPrefs().deferredAutoEscalate);
  } catch {
    return false;
  }
}

export function getDeferredUnclaimedMs(): number {
  const explicit = envMs('MA_DEFERRED_UNCLAIMED_MS', 0);
  if (explicit > 0) return explicit;
  if (isDeferredAutoEscalateOptIn()) return SUGGESTED_DEFERRED_UNCLAIMED_MS;
  return 0;
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
  staleWaitingLocal: number;
  /** Slice 68：过期 prepare lease 半 claim */
  stalePrepareLease: number;
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
    let failureReason: 'idle_timeout' | 'tool_watchdog' | 'stale_heartbeat' | 'exec_error' | 'timeout';

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
        failureReason = 'idle_timeout';
      }
    }

    // 仍有内存 abort 但 hb 过旧：视为假死/静默，照样 fail/timed_out
    const finishedAt = now;
    const finalStatus =
      failureReason === 'idle_timeout' || failureReason === 'tool_watchdog'
        ? 'timed_out'
        : 'failed';
    const tr = transitionAndScheduleAutoRetry({
      id: row.id,
      fromStatuses: ['running'],
      patch: {
        status: finalStatus,
        finishedAt,
        error,
        failureReason,
        prepareLeaseExpiresAt: null,
      },
    });
    if (tr.applied && tr.row) {
      clearToolInflight(row.id);
      abortRun(row.id); // 尽量杀仍挂着的 CLI
      publishFailedRun(tr.row, now, tr.autoRetryChild);
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
    const tr = transitionAndScheduleAutoRetry({
      id: row.id,
      fromStatuses: ['running'],
      patch: {
        status: 'failed',
        finishedAt: now,
        error: 'orphan: no live executor after restart',
        failureReason: 'stale_heartbeat',
        prepareLeaseExpiresAt: null,
      },
    });
    if (tr.applied && tr.row) {
      publishFailedRun(tr.row, now, tr.autoRetryChild);
      n++;
    }
  }
  if (n > 0) console.warn(`[run] recovered ${n} orphaned running run(s)`);
  return n;
}

/**
 * Slice 68 · FailStale prepare_lease（本地单进程版）。
 *
 * **半 claim 判定：**
 * - `status === 'running'`
 * - `prepareLeaseExpiresAt != null`（claim 写；稳定 running 后清 null）
 * - `prepareLeaseExpiresAt < now`
 *
 * 本仓无 `dispatched` 态：claim 直接 queued/waiting → running 并写 lease；
 * `registerRunAbort` 后清 lease = 进入稳定 executor。
 *
 * **过期行为（钉死）：fail** → `status=failed`，`failureReason=exec_error`，
 * error 含 `prepare_lease`；**不** requeue。
 */
export function failStalePrepareLeaseRuns(now = Date.now()): number {
  const candidates = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'running'))
    .all();

  let n = 0;
  for (const row of candidates) {
    const lease =
      (row as { prepareLeaseExpiresAt?: number | null }).prepareLeaseExpiresAt ??
      null;
    if (lease == null) continue;
    if (lease >= now) continue;

    const error =
      'stale: prepare_lease expired (claim never reached stable running)';
    const tr = transitionAndScheduleAutoRetry({
      id: row.id,
      fromStatuses: ['running'],
      patch: {
        status: 'failed',
        finishedAt: now,
        error,
        failureReason: 'exec_error',
        prepareLeaseExpiresAt: null,
        waitingLocalEnteredAt: null,
      },
    });
    if (tr.applied && tr.row) {
      clearToolInflight(row.id);
      abortRun(row.id);
      publishFailedRun(tr.row, now, tr.autoRetryChild);
      n++;
    }
  }
  if (n > 0) {
    console.warn(`[run] failStalePrepareLeaseRuns n=${n}`);
  }
  return n;
}

/** queued 过久未 claim → failed（对齐 Multica FailStale 精神；半 claim 见 prepare_lease） */
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
    const tr = transitionAndScheduleAutoRetry({
      id: row.id,
      fromStatuses: ['queued'],
      patch: {
        status: 'failed',
        finishedAt: now,
        error: 'stale: queued too long without claim',
        failureReason: 'idle_timeout',
        prepareLeaseExpiresAt: null,
      },
    });
    if (tr.applied && tr.row) {
      publishFailedRun(tr.row, now, tr.autoRetryChild);
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
    const tr = transitionAndScheduleAutoRetry({
      id: row.id,
      fromStatuses: ['queued', 'waiting_local_directory'],
      patch: {
        status: 'failed',
        finishedAt: now,
        error: 'orphan: agent missing for queued run',
        failureReason: 'exec_error',
        waitingLocalEnteredAt: null,
        prepareLeaseExpiresAt: null,
      },
    });
    if (tr.applied && tr.row) {
      publishFailedRun(tr.row, now, tr.autoRetryChild);
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

/**
 * waiting_local_directory 墙钟超时 → timed_out。
 * Slice 66：优先 waitingLocalEnteredAt；旧行 null 时回退 createdAt。
 * 短 path-lock 等待远低于默认 2h，不会误杀。
 */
export function failStaleWaitingLocalDirectoryRuns(now = Date.now()): number {
  const maxMs = getWaitingLocalMaxMs();
  if (maxMs <= 0) return 0;

  const cutoff = now - maxMs;
  const candidates = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'waiting_local_directory'))
    .all();

  let n = 0;
  for (const row of candidates) {
    const enteredAt =
      (row as { waitingLocalEnteredAt?: number | null }).waitingLocalEnteredAt ??
      row.createdAt;
    if (enteredAt > cutoff) continue;
    const error = `stale: waiting_local_directory exceeded wall clock (${formatDurationMs(maxMs)})`;
    const tr = transitionAndScheduleAutoRetry({
      id: row.id,
      fromStatuses: ['waiting_local_directory'],
      patch: {
        status: 'timed_out',
        finishedAt: now,
        error,
        failureReason: 'waiting_local_directory_timeout',
        waitingLocalEnteredAt: null,
        prepareLeaseExpiresAt: null,
      },
    });
    if (tr.applied && tr.row) {
      publishFailedRun(tr.row, now, tr.autoRetryChild);
      n++;
    }
  }
  return n;
}

/** 运维/启动共用：一次扫完 orphan running + prepare lease + stale running/queued/waiting + missing agent + 续租目录锁 */
export function recoverStuckRuns(now = Date.now()): RunRecoveryReport {
  touchWaitingLocalDirectoryLeases(now);
  // prepare_lease 半 claim 优先于 orphan：两者都是 running 无 abort，但 lease 文案更准
  const stalePrepareLease = failStalePrepareLeaseRuns(now);
  const orphanRunning = recoverOrphanedRunningRuns(now);
  const staleRunning = failStaleRunningRuns(now);
  const missingAgentQueued = failQueuedMissingAgentRuns(now);
  const staleQueued = failStaleQueuedRuns(now);
  const staleWaitingLocal = failStaleWaitingLocalDirectoryRuns(now);
  const total =
    orphanRunning +
    staleRunning +
    missingAgentQueued +
    staleQueued +
    staleWaitingLocal +
    stalePrepareLease;
  if (total > 0) {
    console.warn(
      `[run] recoverStuckRuns total=${total} orphanRunning=${orphanRunning} staleRunning=${staleRunning} missingAgentQueued=${missingAgentQueued} staleQueued=${staleQueued} staleWaitingLocal=${staleWaitingLocal} stalePrepareLease=${stalePrepareLease}`,
    );
  }
  return {
    orphanRunning,
    staleRunning,
    staleQueued,
    missingAgentQueued,
    staleWaitingLocal,
    stalePrepareLease,
    total,
  };
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startStaleRunSweeper(): void {
  if (sweepTimer) return;
  markWorkerStarted('staleRunSweeper');
  sweepTimer = setInterval(() => {
    try {
      noteWorkerTick('staleRunSweeper');
      // 周期清扫与目录锁动态续租
      touchWaitingLocalDirectoryLeases();
      // Slice 68：半 claim prepare_lease 过期 → fail（先于 heartbeat/orphan 语义）
      failStalePrepareLeaseRuns();
      failStaleRunningRuns();
      failQueuedMissingAgentRuns();
      // deferred 在 hard-fail 之前：仍为 queued 时可观测升级
      escalateDeferredUnclaimedRuns();
      failStaleQueuedRuns();
      failStaleWaitingLocalDirectoryRuns();
      escalateFailedSquadRuns();
    } catch (e) {
      logger.error({ err: e instanceof Error ? e.message : String(e) }, '[run] stale sweep failed');
    }
  }, STALE_SWEEP_INTERVAL_MS);
}

/** Slice 23：优雅退出时停周期收尸，避免与 cancel 竞态 */
export function stopStaleRunSweeper(): void {
  markWorkerStopped('staleRunSweeper');
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

export function escalateFailedSquadRuns(now = Date.now()): number {
  const candidates = db
    .select()
    .from(agentRuns)
    .where(
      and(
        isNotNull(agentRuns.squadId),
        eq(agentRuns.isLeader, 0),
        inArray(agentRuns.status, ['failed', 'timed_out'])
      )
    )
    .all();

  let n = 0;
  for (const row of candidates) {
    if (row.error?.startsWith('[Squad Escalated]')) continue;
    
    const newError = `[Squad Escalated] original_reason: ${row.failureReason || 'unknown'}${row.error ? '; ' + row.error : ''}`;
    
    db.update(agentRuns)
      .set({ 
        error: newError,
        failureReason: row.failureReason || 'squad_member_escalated' 
      })
      .where(eq(agentRuns.id, row.id))
      .run();

    const next = db.select().from(agentRuns).where(eq(agentRuns.id, row.id)).get()!;
    const run = toAgentRun(next);
    
    if (row.issueId) {
      db.insert(activityLogs).values({
        id: crypto.randomUUID(),
        issueId: row.issueId,
        actorType: 'system',
        actorName: '系统',
        eventType: 'squad_escalated',
        payload: JSON.stringify({ runId: row.id, agentId: row.agentId }),
        createdAt: now,
      }).run();
    }
    
    notifySquadEscalated(run);
    n++;
  }
  return n;
}

/**
 * Slice 42 / D5 + Slice 70：Deferred 升级（pre-claim，非失败路径）。
 *
 * 状态谓词（仅未进入有效执行）：
 * - 纳入：`status === 'queued'` 且 `createdAt` age ≥ 阈值，且 `startedAt` 为空
 * - 跳过：`running` / `completed` / `failed` / `timed_out`（已执行或终态）
 * - 跳过：`waiting_local_directory`（path-lock 显式排队，已进入 claim 闸门语义，非「无人 claim」）
 *
 * 行为：
 * - **不**改 run status / error（区别 failStaleQueuedRuns 硬 fail）
 * - **不**改 assignee（Slice 70：仅 `reassignDraft` 建议 note，可演示 opt-in）
 * - **不**走 escalateFailedSquadRuns / `[Squad Escalated]` 文案
 * - activity `run_deferred` + inbox `dedupeKey: deferred:<runId>`
 * - 阈值 0（默认）→ no-op
 */
export function escalateDeferredUnclaimedRuns(now = Date.now()): number {
  const thresholdMs = getDeferredUnclaimedMs();
  if (thresholdMs <= 0) return 0;

  const cutoff = now - thresholdMs;
  const candidates = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'queued'))
    .all();

  let n = 0;
  for (const row of candidates) {
    if (row.createdAt > cutoff) continue;
    // 已 claim 过（有 startedAt）则不算 unclaimed；正常 invariant 下 queued 应为空
    if (row.startedAt != null) continue;

    // activity 去重：同 run 只升一次
    if (row.issueId) {
      const existingActs = db
        .select()
        .from(activityLogs)
        .where(
          and(
            eq(activityLogs.issueId, row.issueId),
            eq(activityLogs.eventType, 'run_deferred'),
          ),
        )
        .all();
      const already = existingActs.some((act) => {
        if (!act.payload) return false;
        try {
          const p = JSON.parse(act.payload) as { runId?: string };
          return p.runId === row.id;
        } catch {
          return false;
        }
      });
      if (already) continue;
    }

    const run = toAgentRun(row);
    // Slice 70：草稿 reassign — 只写 note，不真改派
    const reassignDraft = {
      note: '建议改派',
      agentId: row.agentId ?? null,
      applied: false as const,
    };
    const inboxItem = notifyDeferredUnclaimed(run, { thresholdMs, reassignDraft });

    if (row.issueId) {
      db.insert(activityLogs)
        .values({
          id: crypto.randomUUID(),
          issueId: row.issueId,
          actorType: 'system',
          actorName: '系统',
          eventType: 'run_deferred',
          payload: JSON.stringify({
            runId: row.id,
            agentId: row.agentId,
            thresholdMs,
            ageMs: now - row.createdAt,
            reason: 'queued_unclaimed',
            reassignDraft,
          }),
          createdAt: now,
        })
        .run();
    }

    // 无 issue 时仅 inbox 可观测；inbox 被 prefs/mute 挡掉仍计一次扫过（靠 dedupe 下次 skip）
    if (inboxItem || row.issueId) {
      n++;
    }
  }
  return n;
}
