import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns, agents, comments, issues } from '../db/schema.js';
import { toAgentRun, toComment } from '../db/reshape.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { eventBus } from './event-bus.js';
import { abortRun } from './run-control.js';
import { wakeRunWorker } from './run-worker.js';
import { computeAgentReadiness } from './readiness.js';
import { notifyEnqueueSkipped } from './inbox-writer.js';
import type { AgentRun, EnqueueSkipReason, IssueEnqueueMeta } from '@ma/shared';

const ACTIVE = ['queued', 'running'] as const;
const RETRYABLE = ['failed', 'cancelled'] as const;

// 乒乓熔断阈值（spec §7.4 R1）：FRI-11 闭环正常路径 = 1 leader + 3 worker = 4 run。
// 15 给 3 倍余量，防住失控但不误杀正常多轮交互。
const MAX_RUNS_PER_ISSUE = 15;

/** 派发结果：ok 时必有 run；skipped 时 reason 可解释给 API/UI */
export type EnqueueResult = {
  run: AgentRun | null;
  skipped: boolean;
  reason: EnqueueSkipReason | null;
  detail: string | null;
};

export function toIssueEnqueueMeta(result: EnqueueResult | null | undefined): IssueEnqueueMeta {
  if (!result) return { status: 'not_applicable' };
  if (result.run) {
    return {
      status: 'queued',
      runId: result.run.id,
      reason: null,
      detail: null,
    };
  }
  return {
    status: 'skipped',
    runId: null,
    reason: result.reason,
    detail: result.detail,
  };
}

function allowNotReadyEnqueue(): boolean {
  const v = process.env.MA_ENQUEUE_ALLOW_NOT_READY;
  return v === '1' || v === 'true';
}

function skipped(
  reason: EnqueueSkipReason,
  detail: string,
): EnqueueResult {
  return { run: null, skipped: true, reason, detail };
}

function publishEnqueueBlockedComment(
  issueId: string,
  reason: EnqueueSkipReason,
  detail: string,
): void {
  // 硬闸 / 熔断才写 system comment；already_active 太吵跳过
  if (reason === 'already_active') return;
  const cid = crypto.randomUUID();
  const label =
    reason === 'cwd_missing'
      ? 'cwd 未就绪'
      : reason === 'runtime_missing'
        ? 'runtime 缺失'
        : reason === 'run_limit'
          ? 'run 上限'
          : reason === 'agent_missing'
            ? 'agent 不存在'
            : reason === 'readiness_error'
              ? '就绪探测失败'
              : reason;
  db.insert(comments)
    .values({
      id: cid,
      issueId,
      type: 'comment',
      authorType: 'member',
      authorId: 'system',
      body: `⚠️ 未开工（${label}）：${detail}`,
      createdAt: Date.now(),
    })
    .run();
  const cRow = db.select().from(comments).where(eq(comments.id, cid)).get();
  if (cRow) eventBus.publish({ type: 'comment:created', comment: toComment(cRow) });
}

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

/** 批量取消：逐 id 走 cancelRunById，保证 abort 与事件一致 */
export function cancelRunsMany(ids: string[]): {
  requested: number;
  cancelled: number;
  skipped: number;
  runs: AgentRun[];
} {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 100);
  let cancelled = 0;
  let skipped = 0;
  const runs: AgentRun[] = [];
  for (const id of unique) {
    const res = cancelRunById(id);
    if (res.ok && res.run) {
      cancelled += 1;
      runs.push(res.run);
    } else {
      skipped += 1;
    }
  }
  return { requested: unique.length, cancelled, skipped, runs };
}

// enqueueAgentRun —— 指派 agent 时插入 queued run（spec §6.1）。
// S04：去重改 per-(issue,agent)（spec §6.1）——同一 agent 同一 issue 不重复排，
//   不同 agent 可并存。熔断见 checkAndEnqueue（spec §7.4 R1）。
// Slice2：cwd_missing / runtime_missing 默认硬闸（学 Multica agent_ready）。
export async function enqueueAgentRun(
  issueId: string,
  agentId: string,
): Promise<EnqueueResult> {
  return checkAndEnqueue(issueId, agentId);
}

// enqueueLeaderRun —— squad 指派时，解析 leader 排 leader run（spec §5.2）。
// 复用 checkAndEnqueue 的去重 + 熔断逻辑，多设 is_leader=1 + squad_id。
export async function enqueueLeaderRun(
  issueId: string,
  leaderId: string,
  squadId: string,
): Promise<EnqueueResult> {
  return checkAndEnqueue(issueId, leaderId, { isLeader: true, squadId });
}

// checkAndEnqueue —— enqueueAgentRun / enqueueLeaderRun 的共用实现（排雷补充#3 DRY）。
// readiness 硬闸 + 去重（per-(issue,agent)）+ 熔断（issue 总 run 数）+ insert + publish + wake。
async function checkAndEnqueue(
  issueId: string,
  agentId: string,
  opts?: { isLeader?: boolean; squadId?: string; rerunOfRunId?: string | null },
): Promise<EnqueueResult> {
  const isLeader = opts?.isLeader ?? false;
  const squadId = opts?.squadId ?? null;
  const rerunOfRunId = opts?.rerunOfRunId ?? null;

  const agent = db.select().from(agents).where(eq(agents.id, agentId)).get();
  if (!agent) {
    const res = skipped('agent_missing', `agent ${agentId} 不存在`);
    publishEnqueueBlockedComment(issueId, res.reason!, res.detail!);
    notifyEnqueueSkipped(issueId, agentId, res.reason!, res.detail!);
    return res;
  }

  // 硬闸：cwd_missing / runtime_missing / detect error（busy 仍可排队）
  // 紧急旁路：MA_ENQUEUE_ALLOW_NOT_READY=1（仅本地排障）
  if (!allowNotReadyEnqueue()) {
    const rd = await computeAgentReadiness(agentId);
    if (!rd) {
      const res = skipped('agent_missing', `agent ${agentId} 不存在`);
      publishEnqueueBlockedComment(issueId, res.reason!, res.detail!);
      notifyEnqueueSkipped(issueId, agentId, res.reason!, res.detail!);
      return res;
    }
    if (rd.status === 'cwd_missing') {
      const res = skipped(
        'cwd_missing',
        rd.detail ?? '工作区未就绪，无法派发（设置 MA_ISSUE_USE_WORKSPACE_CWD 时强制）',
      );
      publishEnqueueBlockedComment(issueId, res.reason!, res.detail!);
      notifyEnqueueSkipped(issueId, agentId, res.reason!, res.detail!);
      return res;
    }
    if (rd.status === 'runtime_missing') {
      const res = skipped(
        'runtime_missing',
        rd.detail ?? `runtime ${rd.runtime} 未安装或不在 PATH`,
      );
      publishEnqueueBlockedComment(issueId, res.reason!, res.detail!);
      notifyEnqueueSkipped(issueId, agentId, res.reason!, res.detail!);
      return res;
    }
    if (rd.status === 'error') {
      const res = skipped(
        'readiness_error',
        rd.detail ?? 'agent 就绪探测失败',
      );
      publishEnqueueBlockedComment(issueId, res.reason!, res.detail!);
      notifyEnqueueSkipped(issueId, agentId, res.reason!, res.detail!);
      return res;
    }
  }

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
  if (activeForAgent) {
    return skipped(
      'already_active',
      `该 agent 在此 issue 上已有进行中的 run（${activeForAgent.id.slice(0, 8)}…）`,
    );
  }

  // 乒乓熔断（spec §7.4 R1）：issue 总 run 数超限 → 拒绝 + system comment
  // bu03：只计 issue 工作 run，不把 quick_create 算进乒乓上限
  const totalRow = db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(agentRuns)
    .where(and(eq(agentRuns.issueId, issueId), eq(agentRuns.kind, 'issue')))
    .get();
  if ((totalRow?.cnt ?? 0) >= MAX_RUNS_PER_ISSUE) {
    const res = skipped(
      'run_limit',
      `已达 issue run 上限（${MAX_RUNS_PER_ISSUE}），停止派发`,
    );
    publishEnqueueBlockedComment(issueId, res.reason!, res.detail!);
    notifyEnqueueSkipped(issueId, agentId, res.reason!, res.detail!);
    return res;
  }

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
  return { run, skipped: false, reason: null, detail: null };
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
export async function rerunIssue(
  issueId: string,
  sourceRunId?: string | null,
): Promise<RerunResult> {
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
      if (!squad.leaderId) {
        return { ok: false, status: 400, error: `小队「${squad.name}」无 leader，无法再执行` };
      }
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

  const enq =
    isLeader && squadId
      ? await checkAndEnqueue(issueId, agentId, {
          isLeader: true,
          squadId,
          rerunOfRunId: rerunOf,
        })
      : await checkAndEnqueue(issueId, agentId, { rerunOfRunId: rerunOf });

  if (!enq.run) {
    const detail = enq.detail ?? '无法排队新 run';
    const hard =
      enq.reason === 'cwd_missing' ||
      enq.reason === 'runtime_missing' ||
      enq.reason === 'readiness_error';
    return {
      ok: false,
      status: hard ? 409 : 409,
      error: detail,
    };
  }
  return { ok: true, run: enq.run };
}

/** POST /api/runs/:id/retry —— 仅 failed|cancelled 的 issue 工作 run；chat/QC 拒绝并给可行动文案 */
export async function retryRun(runId: string): Promise<RerunResult> {
  const src = db.select().from(agentRuns).where(eq(agentRuns.id, runId)).get();
  if (!src) return { ok: false, status: 404, error: 'run 不存在' };

  if (!RETRYABLE.includes(src.status as (typeof RETRYABLE)[number])) {
    return { ok: false, status: 400, error: '仅 failed 或 cancelled 的 run 可再执行' };
  }

  // Slice3 / F5：chat 与 issue Rerun 分离；勿用「快速派活」文案盖住 chat
  if (src.kind === 'chat') {
    return {
      ok: false,
      status: 400,
      error: src.chatThreadId
        ? '聊天 run 请回到会话「重发上一条」，无法按 Issue 再执行'
        : '聊天 run 无法再执行：缺少会话 id，请从聊天页重新发送',
    };
  }

  if (!src.issueId) {
    return {
      ok: false,
      status: 400,
      error:
        src.kind === 'quick_create'
          ? '快速派活失败且无 Issue：请使用「快速派活」重新提交，无法按 RerunIssue 再执行'
          : '该 run 无关联 Issue，无法再执行',
    };
  }

  return rerunIssue(src.issueId, src.id);
}
