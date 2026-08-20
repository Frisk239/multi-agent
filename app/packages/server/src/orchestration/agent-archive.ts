import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agents } from '../db/schema.js';
import { cancelRunById, listCancellableRunsForAgent } from './run-cancellation.js';

/**
 * One Agent archive lifecycle shared by PATCH { archived: true } and soft
 * DELETE. Archive is intentionally a stop-work operation, not merely a roster
 * filter: first close the future-dispatch gate, then use the normal run
 * cancellation transition/abort/event path for every unfinished historical
 * run. Repeating it also closes any legacy rows left by an earlier version.
 */
export function archiveAgentLifecycle(agentId: string): {
  found: boolean;
  archivedNow: boolean;
  cancelled: number;
} {
  const now = Date.now();
  const mark = db
    .update(agents)
    .set({ archivedAt: now })
    .where(and(eq(agents.id, agentId), isNull(agents.archivedAt)))
    .run();

  const agent = db.select({ id: agents.id }).from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return { found: false, archivedNow: false, cancelled: 0 };

  // `deferred` is not claimable by the normal worker, but it can later fire an
  // escalation/fallback path. `listCancellableRunsForAgent` uses the same
  // status set as the normal cancellation primitive, so it cannot drift.
  const pending = listCancellableRunsForAgent(agentId);

  let cancelled = 0;
  for (const runId of pending) {
    if (cancelRunById(runId).ok) cancelled += 1;
  }
  return {
    found: true,
    archivedNow: (mark.changes ?? 0) > 0,
    cancelled,
  };
}
