import { and, eq, inArray } from 'drizzle-orm';
import type { AgentRun } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import { toObservedAgentRun } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { abortRun } from './run-control.js';
import { ACTIVE_RUN_STATUSES, transitionRun } from './run-transitions.js';

const CANCELLABLE = ACTIVE_RUN_STATUSES;

/**
 * The single cancellation primitive. Keep the conditional transition, abort
 * signal and observable event together so lifecycle operations (including
 * Agent archive) cannot accidentally turn a run terminal with a bare SQL
 * update.
 */
export function cancelRunById(runId: string): { ok: boolean; run?: AgentRun } {
  const finishedAt = Date.now();
  const tr = transitionRun({
    id: runId,
    fromStatuses: CANCELLABLE,
    patch: {
      status: 'cancelled',
      finishedAt,
      waitingLocalEnteredAt: null,
      prepareLeaseExpiresAt: null,
    },
  });
  if (!tr.applied || !tr.row) return { ok: false };

  // The database terminal state commits before abort. If the process exits in
  // this tiny gap, restart recovery will never re-execute the cancelled run.
  abortRun(runId);
  const run = toObservedAgentRun(tr.row, finishedAt);
  eventBus.publish({ type: 'run:cancelled', run });
  return { ok: true, run };
}

/** Batch cancellation deliberately delegates to the same per-run primitive. */
export function cancelRunsMany(ids: string[]): {
  requested: number;
  cancelled: number;
  skipped: number;
  runs: AgentRun[];
} {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
  let cancelled = 0;
  let skipped = 0;
  const runs: AgentRun[] = [];
  for (const id of unique) {
    const res = cancelRunById(id);
    if (res.ok && res.run) {
      cancelled += 1;
      runs.push(res.run);
    } else {
      skipped += 1;
    }
  }
  return { requested: unique.length, cancelled, skipped, runs };
}

/** Query helper for bounded lifecycle callers; no deletion or mutation here. */
export function listCancellableRunsForAgent(agentId: string): string[] {
  return db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.agentId, agentId), inArray(agentRuns.status, [...CANCELLABLE])))
    .all()
    .map((row) => row.id);
}
