import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, agents, comments } from '../db/schema.js';
import { toAgentRun, toComment } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { abortRun } from './run-control.js';
import { wakeRunWorker } from './run-worker.js';
import type { AgentRun } from '@ma/shared';

const ACTIVE = ['queued', 'running'] as const;

// 乒乓熔断阈值（spec §7.4 R1）：FRI-11 闭环正常路径 = 1 leader + 3 worker = 4 run。
// 15 给 3 倍余量，防住失控但不误杀正常多轮交互。
const MAX_RUNS_PER_ISSUE = 15;

// cancelActiveRunsForIssue —— 清空/改指派时取消该 issue 所有 active run（spec §6.1）。
export function cancelActiveRunsForIssue(issueId: string): void {
  const rows = db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.issueId, issueId), inArray(agentRuns.status, [...ACTIVE])),
    )
    .all();
  for (const row of rows) {
    cancelRunById(row.id);
  }
}

// cancelRunById —— 唯一取消入口的底层实现（spec §6.3 R1：POST /api/runs/:runId/cancel）。
// 条件 UPDATE（status IN active）→ abort 信号 → run:cancelled 事件。
export function cancelRunById(runId: string): { ok: boolean; run?: AgentRun } {
  const prev = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!prev || !ACTIVE.includes(prev.status as (typeof ACTIVE)[number])) {
    return { ok: false };
  }
  const finishedAt = Date.now();
  db.update(agentRuns)
    .set({ status: 'cancelled', finishedAt })
    .where(
      and(eq(agentRuns.id, runId), inArray(agentRuns.status, [...ACTIVE])),
    )
    .run();
  abortRun(runId); // 触发 AbortController → spawn-line kill 子进程
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get()!;
  const run = toAgentRun(row);
  eventBus.publish({ type: 'run:cancelled', run });
  return { ok: true, run };
}

// enqueueAgentRun —— 指派 agent 时插入 queued run（spec §6.1）。
// S04：去重改 per-(issue,agent)（spec §6.1）——同一 agent 同一 issue 不重复排，
//   不同 agent 可并存。熔断见 checkAndEnqueue（spec §7.4 R1）。
export function enqueueAgentRun(issueId: string, agentId: string): AgentRun | null {
  return checkAndEnqueue(issueId, agentId);
}

// enqueueLeaderRun —— squad 指派时，解析 leader 排 leader run（spec §5.2）。
// 复用 checkAndEnqueue 的去重 + 熔断逻辑，多设 is_leader=1 + squad_id。
export function enqueueLeaderRun(
  issueId: string,
  leaderId: string,
  squadId: string,
): AgentRun | null {
  return checkAndEnqueue(issueId, leaderId, { isLeader: true, squadId });
}

// checkAndEnqueue —— enqueueAgentRun / enqueueLeaderRun 的共用实现（排雷补充#3 DRY）。
// 去重（per-(issue,agent)）+ 熔断（issue 总 run 数）+ insert + publish + wake。
function checkAndEnqueue(
  issueId: string,
  agentId: string,
  opts?: { isLeader?: boolean; squadId?: string },
): AgentRun | null {
  const isLeader = opts?.isLeader ?? false;
  const squadId = opts?.squadId ?? null;

  // per-(issue,agent) 去重（spec §6.1）
  const activeForAgent = db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.issueId, issueId),
        eq(agentRuns.agentId, agentId),
        inArray(agentRuns.status, [...ACTIVE]),
      ),
    )
    .get();
  if (activeForAgent) return null;

  // 乒乓熔断（spec §7.4 R1）：issue 总 run 数超限 → 拒绝 + system comment
  const totalRow = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(agentRuns)
    .where(eq(agentRuns.issueId, issueId))
    .get();
  if ((totalRow?.cnt ?? 0) >= MAX_RUNS_PER_ISSUE) {
    const cid = crypto.randomUUID();
    db.insert(comments)
      .values({
        id: cid,
        issueId,
        type: 'comment',
        authorType: 'member',
        authorId: 'system',
        body: `⚠️ 已达 issue run 上限（${MAX_RUNS_PER_ISSUE}），停止派发。`,
        createdAt: Date.now(),
      })
      .run();
    const cRow = db.select().from(comments).where(eq(comments.id, cid)).get();
    if (cRow) eventBus.publish({ type: 'comment:created', comment: toComment(cRow) });
    return null;
  }

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return null;
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  db.insert(agentRuns)
    .values({
      id,
      issueId,
      agentId,
      runtime: agent.runtime,
      status: 'queued',
      error: null,
      startedAt: null,
      finishedAt: null,
      isLeader: isLeader ? 1 : 0,
      squadId,
      createdAt,
    })
    .run();
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()!;
  const run = toAgentRun(row);
  eventBus.publish({ type: 'run:queued', run });
  wakeRunWorker();
  return run;
}
