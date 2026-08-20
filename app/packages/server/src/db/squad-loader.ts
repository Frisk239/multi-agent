import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { squads, squadMembers, agents } from './schema.js';
import type { SquadDetail } from '@ma/shared';

// History-detail loader. Archived squads deliberately remain readable here:
// pre-retirement leader runs need their original roster/briefing for prompt and
// run-history replay. New dispatch must use squad-dispatch-gate instead.
// B3：无 leader 仍返回详情（leaderId=null），便于 enqueue 报 no_leader 而非「不存在」
export function loadSquadDetail(squadId: string): SquadDetail | null {
  const squad = db.select().from(squads).where(eq(squads.id, squadId)).get();
  if (!squad) return null;
  const memberRows = db
    .select({ agentId: squadMembers.agentId, name: agents.name })
    .from(squadMembers)
    .innerJoin(agents, eq(squadMembers.agentId, agents.id))
    .where(eq(squadMembers.squadId, squadId))
    .all();
  return {
    id: squad.id,
    name: squad.name,
    leaderId: squad.leaderId ?? null,
    operatingProtocol: squad.operatingProtocol,
    missionDirective: squad.missionDirective,
    members: memberRows.map((m) => ({ agentId: m.agentId, name: m.name })),
    archivedAt:
      squad.archivedAt == null ? null : new Date(squad.archivedAt).toISOString(),
  };
}

/** Active-only convenience loader for normal picker / current dispatch callers. */
export function loadActiveSquadDetail(squadId: string): SquadDetail | null {
  const detail = loadSquadDetail(squadId);
  return detail?.archivedAt == null ? detail : null;
}

// History leader lookup. Mention/run-history paths may use it to preserve a
// readable label, but enqueueLeaderRun always applies the active lifecycle gate.
export function getSquadLeaderId(squadId: string): string | null {
  const squad = db.select().from(squads).where(eq(squads.id, squadId)).get();
  return squad?.leaderId ?? null;
}
