import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { squads, squadMembers, agents } from './schema.js';
import type { SquadDetail } from '@ma/shared';

// 加载 squad 详情（含成员），briefing 组装 + trigger 用
export function loadSquadDetail(squadId: string): SquadDetail | null {
  const squad = db.select().from(squads).where(eq(squads.id, squadId)).get();
  if (!squad || !squad.leaderId) return null;
  const memberRows = db
    .select({ agentId: squadMembers.agentId, name: agents.name })
    .from(squadMembers)
    .innerJoin(agents, eq(squadMembers.agentId, agents.id))
    .where(eq(squadMembers.squadId, squadId))
    .all();
  return {
    id: squad.id,
    name: squad.name,
    leaderId: squad.leaderId,
    operatingProtocol: squad.operatingProtocol,
    missionDirective: squad.missionDirective,
    members: memberRows.map((m) => ({ agentId: m.agentId, name: m.name })),
  };
}

// 查 squad leaderId（trigger 路由用，轻量查询）
export function getSquadLeaderId(squadId: string): string | null {
  const squad = db.select().from(squads).where(eq(squads.id, squadId)).get();
  return squad?.leaderId ?? null;
}
