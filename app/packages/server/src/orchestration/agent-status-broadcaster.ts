import { eq, and, inArray, sql } from 'drizzle-orm';
import type { AgentPulseStatus } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import { eventBus } from './event-bus.js';

export interface AgentLiveStatusInfo {
  status: AgentPulseStatus;
  activeRunCount: number;
  latestRunId: string | null;
}

/**
 * 计算单个 Agent 当前的 Live 脉冲状态 (idle | working | blocked | failed | offline)
 */
export function computeAgentLiveStatus(agentId: string): AgentLiveStatusInfo {
  const activeRows = db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.agentId, agentId),
        inArray(agentRuns.status, ['queued', 'waiting_local_directory', 'running'])
      )
    )
    .all();

  const activeRunCount = activeRows.length;
  const runningCount = activeRows.filter((r) => r.status === 'running').length;
  const blockedCount = activeRows.filter((r) => r.status === 'waiting_local_directory').length;

  let status: AgentPulseStatus = 'idle';
  if (runningCount > 0) {
    status = 'working';
  } else if (blockedCount > 0) {
    status = 'blocked';
  } else if (activeRunCount > 0) {
    status = 'working'; // queued counts as starting/working
  } else {
    // Check if latest terminal run was failed
    const latest = db
      .select({ id: agentRuns.id, status: agentRuns.status })
      .from(agentRuns)
      .where(eq(agentRuns.agentId, agentId))
      .orderBy(sql`${agentRuns.createdAt} DESC`)
      .limit(1)
      .get();
      
    if (latest?.status === 'failed') {
      status = 'failed';
    }
  }

  const latestRunId = activeRows[0]?.id ?? null;

  return {
    status,
    activeRunCount,
    latestRunId,
  };
}

/**
 * 广播指定 Agent 的最新状态变动事件到 EventBus
 */
export function broadcastAgentStatus(agentId: string, latestRunId?: string | null): void {
  const info = computeAgentLiveStatus(agentId);
  eventBus.publish({
    type: 'agent:status_changed',
    agentId,
    status: info.status,
    activeRunCount: info.activeRunCount,
    latestRunId: latestRunId ?? info.latestRunId,
  });
}
