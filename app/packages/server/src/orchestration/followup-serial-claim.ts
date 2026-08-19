// Same-agent issue follow-ups must not overtake the run they are following.
//
// The durable invariant lives in the claim UPDATE (sameIssueClaimGuard), not
// in this read helper. The helper only gives the Runs read model an honest
// explanation while the follow-up remains queued.

import { and, asc, eq, ne, sql, type SQL } from 'drizzle-orm';
import type { AgentRun } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';

/**
 * Keep Multica's dispatched value in the SQL guard even though this local
 * state machine represents the prepare window as running + prepare lease.
 * That makes the guard safe if a historical/future row carries dispatched,
 * without widening this product's public status enum.
 */
const SAME_ISSUE_ACTIVE_STATUS_SQL = sql`('dispatched', 'running', 'waiting_local_directory')`;

export type SameIssueClaimHolder = {
  id: string;
  issueId: string;
  agentId: string;
  status: string;
};

function isIssueScope(row: typeof agentRuns.$inferSelect): row is typeof agentRuns.$inferSelect & {
  issueId: string;
  kind: 'issue';
} {
  return row.issueId != null && row.kind === 'issue';
}

/**
 * Read-model lookup for the run that currently serializes this follow-up.
 * It deliberately excludes queued rows: queued is the work waiting for this
 * claim, while dispatched/running/waiting_local_directory own the scope.
 */
export function findSameIssueClaimHolder(
  row: typeof agentRuns.$inferSelect,
): SameIssueClaimHolder | null {
  if (!isIssueScope(row)) return null;

  const holder = db
    .select({
      id: agentRuns.id,
      issueId: agentRuns.issueId,
      agentId: agentRuns.agentId,
      status: agentRuns.status,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.issueId, row.issueId),
        eq(agentRuns.agentId, row.agentId),
        eq(agentRuns.kind, 'issue'),
        ne(agentRuns.id, row.id),
        sql`${agentRuns.status} IN ${SAME_ISSUE_ACTIVE_STATUS_SQL}`,
      ),
    )
    .orderBy(asc(agentRuns.createdAt))
    .get();

  if (!holder || holder.issueId == null) return null;
  return {
    id: holder.id,
    issueId: holder.issueId,
    agentId: holder.agentId,
    status: holder.status,
  };
}

/**
 * Extra predicate for the claim UPDATE. This is intentionally one SQL
 * condition so two worker ticks cannot both observe an idle scope and claim
 * it. Different agents and different issues are outside this predicate.
 */
export function sameIssueClaimGuard(
  row: typeof agentRuns.$inferSelect,
): SQL | null {
  if (!isIssueScope(row)) return null;

  return sql`NOT EXISTS (
    SELECT 1
    FROM agent_run AS same_issue_active
    WHERE same_issue_active.issue_id = ${row.issueId}
      AND same_issue_active.agent_id = ${row.agentId}
      AND same_issue_active.kind = 'issue'
      AND same_issue_active.id <> ${row.id}
      AND same_issue_active.status IN ${SAME_ISSUE_ACTIVE_STATUS_SQL}
  )`;
}

/**
 * Preserve the existing path-lock-shaped API while making the non-path
 * serialization cause visible. This remains a read projection, never a new
 * persisted run state.
 */
export function attachSameIssueClaimWait(
  row: typeof agentRuns.$inferSelect,
  run: AgentRun,
): AgentRun {
  if (run.status !== 'queued' && run.status !== 'waiting_local_directory') return run;
  const holder = findSameIssueClaimHolder(row);
  if (!holder) return run;
  return {
    ...run,
    pathWaitReason: 'same_issue_busy',
    pathBlockedByRunId: holder.id,
  };
}
