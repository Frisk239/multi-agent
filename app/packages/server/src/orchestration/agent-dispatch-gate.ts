import { and, eq, exists, isNull, type SQL } from 'drizzle-orm';
import type { EnqueueSkipReason } from '@ma/shared';
import { db } from '../db/client.js';
import { agents } from '../db/schema.js';

/**
 * The one lifecycle gate for every path that can create work for an Agent.
 *
 * Runtime/cwd readiness is intentionally a separate concern: local emergency
 * bypasses may skip environment probes, but they must never make an archived
 * Agent dispatchable again. Keep this tiny synchronous DB gate close to the
 * write paths so quick runs, automations and retry children cannot drift from
 * Issue enqueue semantics.
 */
export type AgentDispatchGate =
  | {
      ok: true;
      agent: typeof agents.$inferSelect;
    }
  | {
      ok: false;
      agent: null;
      reason: 'agent_missing';
      detail: string;
    }
  | {
      ok: false;
      agent: typeof agents.$inferSelect;
      reason: 'agent_archived';
      detail: string;
    };

export function checkAgentDispatchGate(agentId: string): AgentDispatchGate {
  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) {
    return {
      ok: false,
      agent: null,
      reason: 'agent_missing',
      detail: `agent ${agentId} 不存在`,
    };
  }
  if (agent.archivedAt != null) {
    return {
      ok: false,
      agent,
      reason: 'agent_archived',
      detail: `智能体「${agent.name}」已归档，恢复后才能派发`,
    };
  }
  return { ok: true, agent };
}

/**
 * Correlated-at-call-time guard for the worker's claim UPDATE. The agent id is
 * bound with the individual queued row, so this runs in the same SQL statement
 * as queued/waiting -> running and closes the archive-vs-claim race.
 */
export function agentDispatchableClaimGuard(agentId: string): SQL {
  return exists(
    db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), isNull(agents.archivedAt))),
  );
}

export function isAgentArchivedReason(
  reason: EnqueueSkipReason | null | undefined,
): boolean {
  return reason === 'agent_archived';
}
