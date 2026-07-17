import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { notifyRunTerminal } from './inbox-writer.js';
import { hasRunAbort } from './run-control.js';

// bu01 常量（plan 锁定）：2 分钟无 heartbeat → fail；15s 扫一次
export const STALE_RUNNING_MS = 120_000;
export const STALE_SWEEP_INTERVAL_MS = 15_000;

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

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startStaleRunSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    try {
      failStaleRunningRuns();
    } catch (e) {
      console.error('[run] stale sweep failed', e);
    }
  }, STALE_SWEEP_INTERVAL_MS);
}
