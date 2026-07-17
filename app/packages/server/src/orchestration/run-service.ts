import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, agents, comments, issues } from '../db/schema.js';
import { toAgentRun, toComment } from '../db/reshape.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { eventBus } from './event-bus.js';
import { abortRun } from './run-control.js';
import { wakeRunWorker } from './run-worker.js';
import type { AgentRun } from '@ma/shared';

const ACTIVE = ['queued', 'running'] as const;
const RETRYABLE = ['failed', 'cancelled'] as const;

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
  opts?: { isLeader?: boolean; squadId?: string; rerunOfRunId?: string | null },
): AgentRun | null {
  const isLeader = opts?.isLeader ?? false;
  const squadId = opts?.squadId ?? null;
  const rerunOfRunId = opts?.rerunOfRunId ?? null;

  // per-(issue,agent) 去重（spec §6.1）
  // bu03：仅对 kind=issue 工作 run 去重；quick_create 回链后可能仍 active，不能挡 M1 工作 enqueue
  const activeForAgent = db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.issueId, issueId),
        eq(agentRuns.agentId, agentId),
        eq(agentRuns.kind, 'issue'),
        inArray(agentRuns.status, [...ACTIVE]),
      ),
    )
    .get();
  if (activeForAgent) return null;

  // 乒乓熔断（spec §7.4 R1）：issue 总 run 数超限 → 拒绝 + system comment
  // bu03：只计 issue 工作 run，不把 quick_create 算进乒乓上限
  const totalRow = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(agentRuns)
    .where(and(eq(agentRuns.issueId, issueId), eq(agentRuns.kind, 'issue')))
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
      kind: 'issue',
      quickPrompt: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      isLeader: isLeader ? 1 : 0,
      squadId,
      rerunOfRunId,
      createdAt,
    })
    .run();
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()!;
  const run = toAgentRun(row);
  eventBus.publish({ type: 'run:queued', run });
  wakeRunWorker();
  return run;
}

/** 仅取消同 issue + 同 agent 的 active 工作 run（学 Multica 不误杀其他 agent） */
export function cancelActiveRunsForIssueAgent(issueId: string, agentId: string): void {
  const rows = db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.issueId, issueId),
        eq(agentRuns.agentId, agentId),
        eq(agentRuns.kind, 'issue'),
        inArray(agentRuns.status, [...ACTIVE]),
      ),
    )
    .all();
  for (const row of rows) {
    cancelRunById(row.id);
  }
}

export type RerunResult =
  | { ok: true; run: AgentRun }
  | { ok: false; status: number; error: string };

/**
 * 人工再执行（学 Multica RerunIssue）：始终新行，不复活旧 run。
 * - 无 sourceRunId：当前 issue assignee → agent 或 squad leader
 * - 有 sourceRunId：该历史 run 的 agent / isLeader / squadId（须属于本 issue）
 */
export function rerunIssue(issueId: string, sourceRunId?: string | null): RerunResult {
  const issue = db.select().from(issues).where(eq(issues.id, issueId)).get();
  if (!issue) return { ok: false, status: 404, error: 'issue 不存在' };

  let agentId: string;
  let isLeader = false;
  let squadId: string | null = null;
  let rerunOf: string | null = null;

  if (sourceRunId) {
    const src = db.select().from(agentRuns).where(eq(agentRuns.id, sourceRunId)).get();
    if (!src) return { ok: false, status: 404, error: 'run 不存在' };
    if (src.issueId !== issueId) {
      return { ok: false, status: 400, error: 'run 不属于该 issue' };
    }
    if (src.kind !== 'issue') {
      return { ok: false, status: 400, error: '仅 issue 工作 run 可按历史行再执行' };
    }
    agentId = src.agentId;
    isLeader = src.isLeader === 1;
    squadId = src.squadId ?? null;
    rerunOf = src.id;
  } else {
    if (!issue.assigneeType || !issue.assigneeId) {
      return { ok: false, status: 400, error: 'issue 未指派 agent 或小队' };
    }
    if (issue.assigneeType === 'agent') {
      agentId = issue.assigneeId;
    } else if (issue.assigneeType === 'squad') {
      const squad = loadSquadDetail(issue.assigneeId);
      if (!squad) return { ok: false, status: 400, error: '小队不存在' };
      agentId = squad.leaderId;
      isLeader = true;
      squadId = squad.id;
    } else {
      return { ok: false, status: 400, error: 'issue 未指派 agent 或小队' };
    }
  }

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) return { ok: false, status: 400, error: 'agent 不存在' };

  // 人工 rerun：先清掉该 agent 在此 issue 上的 active，再 enqueue（避免 dedupe 静默 null）
  cancelActiveRunsForIssueAgent(issueId, agentId);

  const run = isLeader && squadId
    ? checkAndEnqueue(issueId, agentId, { isLeader: true, squadId, rerunOfRunId: rerunOf })
    : checkAndEnqueue(issueId, agentId, { rerunOfRunId: rerunOf });

  if (!run) {
    return {
      ok: false,
      status: 409,
      error: '无法排队新 run（可能已达 issue run 上限）',
    };
  }
  return { ok: true, run };
}

/** POST /api/runs/:id/retry —— 仅 failed|cancelled；无 issueId 的 QC 拒绝 */
export function retryRun(runId: string): RerunResult {
  const src = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!src) return { ok: false, status: 404, error: 'run 不存在' };

  if (!RETRYABLE.includes(src.status as (typeof RETRYABLE)[number])) {
    return { ok: false, status: 400, error: '仅 failed 或 cancelled 的 run 可再执行' };
  }

  if (!src.issueId) {
    return {
      ok: false,
      status: 400,
      error: '快速派活失败且无 Issue：请使用「快速派活」重新提交，无法按 RerunIssue 再执行',
    };
  }

  return rerunIssue(src.issueId, src.id);
}
