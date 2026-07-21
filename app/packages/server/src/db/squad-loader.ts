import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { squads, squadMembers, agents } from './schema.js';
import type { SquadDetail } from '@ma/shared';

// 加载 squad 详情（含成员），briefing 组装 + trigger 用
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
  };
}

// 查 squad leaderId（trigger 路由用，轻量查询）
export function getSquadLeaderId(squadId: string): string | null {
  const squad = db.select().from(squads).where(eq(squads.id, squadId)).get();
  return squad?.leaderId ?? null;
}
