import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, agents } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { notifyRunTerminal } from './inbox-writer.js';
import { hasRunAbort } from './run-control.js';

// bu01 常量（plan 锁定）：2 分钟无 heartbeat → fail；15s 扫一次
export const STALE_RUNNING_MS = 120_000;
/** queued 过久无人 claim（agent 缺失/worker 卡死）→ fail；默认 30 分钟 */
export const STALE_QUEUED_MS = 30 * 60_000;
export const STALE_SWEEP_INTERVAL_MS = 15_000;

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

/** running 且 (heartbeat 过旧 或 null 且 startedAt/createdAt 过旧) → failed */
export function failStaleRunningRuns(now = Date.now()): number {
  const cutoff = now - STALE_RUNNING_MS;
  const candidates = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'running'))
    .all();

  let n = 0;
  for (const row of candidates) {
    const hb = row.lastHeartbeatAt ?? row.startedAt ?? row.createdAt;
    if (hb > cutoff) continue;
    // 仍有内存 abort 但 hb 过旧：视为进程假死，照样 fail
    const finishedAt = now;
    db.update(agentRuns)
      .set({
        status: 'failed',
        finishedAt,
        error: 'stale: heartbeat timeout',
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

/** queued 但 agent 已删除 → 立即 fail（避免永久挂起） */
export function failQueuedMissingAgentRuns(now = Date.now()): number {
  const candidates = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'queued'))
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

/** 运维/启动共用：一次扫完 orphan running + stale running/queued + missing agent */
export function recoverStuckRuns(now = Date.now()): RunRecoveryReport {
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
      // 周期清扫：running heartbeat + missing agent + 超龄 queued
      failStaleRunningRuns();
      failQueuedMissingAgentRuns();
      failStaleQueuedRuns();
    } catch (e) {
      console.error('[run] stale sweep failed', e);
    }
  }, STALE_SWEEP_INTERVAL_MS);
}
