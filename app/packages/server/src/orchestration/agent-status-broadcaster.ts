import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AgentPulseStatus } from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import { eventBus } from './event-bus.js';

export interface AgentLiveStatusInfo {
  status: AgentPulseStatus;
  activeRunCount: number;
  latestRunId: string | null;
}

/** 与 /api/runs?status=active 及 roster 脉冲保持同一在途集合。 */
export const ACTIVE_AGENT_RUN_STATUSES = [
  'queued',
  'waiting_local_directory',
  'running',
] as const;

const IDLE_AGENT_LIVE_STATUS: AgentLiveStatusInfo = {
  status: 'idle',
  activeRunCount: 0,
  latestRunId: null,
};

type StatusRun = { id: string; status: string };

function deriveAgentLiveStatus(
  activeRuns: readonly StatusRun[],
  latestRun: Pick<StatusRun, 'status'> | undefined,
): AgentLiveStatusInfo {
  const activeRunCount = activeRuns.length;
  const runningCount = activeRuns.filter((run) => run.status === 'running').length;
  const blockedCount = activeRuns.filter(
    (run) => run.status === 'waiting_local_directory',
  ).length;

  let status: AgentPulseStatus = 'idle';
  if (runningCount > 0) {
    status = 'working';
  } else if (blockedCount > 0) {
    status = 'blocked';
  } else if (activeRunCount > 0) {
    status = 'working'; // queued counts as starting/working
  } else if (latestRun?.status === 'failed') {
    status = 'failed';
  }

  return {
    status,
    activeRunCount,
    latestRunId: activeRuns[0]?.id ?? null,
  };
}

/**
 * 批量计算 Agent 当前的 Live 脉冲状态。
 *
 * Roster 列表必须避免 `N agents × (active + terminal)` 查询：一次读取目标 Agent
 * 的必要 run 列并按 agent 分组。`createdAt DESC, id DESC` 让最新 run 的选取稳定。
 */
export function computeAgentLiveStatuses(
  agentIds: readonly string[],
): Map<string, AgentLiveStatusInfo> {
  const ids = [...new Set(agentIds.filter(Boolean))];
  const result = new Map<string, AgentLiveStatusInfo>(
    ids.map((id) => [id, { ...IDLE_AGENT_LIVE_STATUS }]),
  );
  if (ids.length === 0) return result;

  const rows = db
    .select({
      id: agentRuns.id,
      agentId: agentRuns.agentId,
      status: agentRuns.status,
      createdAt: agentRuns.createdAt,
    })
    .from(agentRuns)
    .where(inArray(agentRuns.agentId, ids))
    .orderBy(desc(agentRuns.createdAt), desc(agentRuns.id))
    .all();

  const byAgentId = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = byAgentId.get(row.agentId) ?? [];
    group.push(row);
    byAgentId.set(row.agentId, group);
  }

  for (const agentId of ids) {
    const runs = byAgentId.get(agentId) ?? [];
    const activeRuns = runs.filter((run) =>
      ACTIVE_AGENT_RUN_STATUSES.includes(
        run.status as (typeof ACTIVE_AGENT_RUN_STATUSES)[number],
      ),
    );
    // activeRuns preserves the deterministic query order above.
    result.set(agentId, deriveAgentLiveStatus(activeRuns, runs[0]));
  }

  return result;
}

/**
 * 高频 lifecycle 广播不能扫完整历史。保留原来的两段窄查询（active + 必要时
 * 一条最新终态），仅复用纯状态归类函数以避免与批量 roster 语义漂移。
 */
export function computeAgentLiveStatus(agentId: string): AgentLiveStatusInfo {
  const activeRuns = db
    .select({ id: agentRuns.id, status: agentRuns.status })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.agentId, agentId),
        inArray(agentRuns.status, [...ACTIVE_AGENT_RUN_STATUSES]),
      ),
    )
    .orderBy(desc(agentRuns.createdAt), desc(agentRuns.id))
    .all();
  if (activeRuns.length > 0) {
    return deriveAgentLiveStatus(activeRuns, activeRuns[0]);
  }

  const latestRun = db
    .select({ id: agentRuns.id, status: agentRuns.status })
    .from(agentRuns)
    .where(eq(agentRuns.agentId, agentId))
    .orderBy(desc(agentRuns.createdAt), desc(agentRuns.id))
    .limit(1)
    .get();
  return deriveAgentLiveStatus([], latestRun);
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
