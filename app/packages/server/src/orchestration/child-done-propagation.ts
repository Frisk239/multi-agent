/**
 * S2 · 子任务完成传播
 *
 * 缺口：本仓已有 parentIssueId 与 childProgress 只读投影，但子任务全部收口后
 * **父 agent / squad leader 永远不知道**，只能靠人工去催。上游 Multica 在
 * handler/issue_child_done.go:68 做了这一环。
 *
 * 刻意不做（AC2 明确约束）：不自动修改父 Issue 状态。父任务要不要推进是人的判断，
 * 自动改状态会让看板在无人干预时漂移。这里只「通知 + 唤醒」。
 *
 * 去重分两层：
 *  1. 本模块把一次请求里同一父级折叠成一次（批量改 10 个子任务 → 一条评论一个 run）；
 *  2. 真正的 run 去重交给 run-service.checkAndEnqueue（它已处理「已有进行中 run」与熔断）。
 */
import { eq, inArray } from 'drizzle-orm';
import type { IssueStatus } from '@ma/shared';
import { db } from '../db/client.js';
import { comments, issues } from '../db/schema.js';
import { toComment } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { enqueueAgentRun, enqueueLeaderRun } from './run-service.js';
import { getSquadLeaderId, loadSquadDetail } from '../db/squad-loader.js';
import { recordActivityLog } from './activity-logger.js';
import { agents } from '../db/schema.js';

/** 与 reshape.loadChildProgressByParentIds 的口径保持一致。 */
export const TERMINAL_ISSUE_STATUSES: readonly IssueStatus[] = ['done', 'cancelled'];

export function isTerminalIssueStatus(status: string | null | undefined): boolean {
  return status === 'done' || status === 'cancelled';
}

export type ChildSnapshot = {
  id: string;
  status: IssueStatus;
};

export type PropagationDecision = {
  propagate: boolean;
  /** 供日志与测试断言的原因码，不直接展示给用户 */
  reason:
    | 'no_parent'
    | 'not_a_transition'
    | 'next_not_terminal'
    | 'siblings_pending'
    | 'parent_already_terminal'
    | 'ok';
};

/**
 * 单个子 Issue 状态变更是否应触发父级收口通知。
 * 纯函数：调用方负责把兄弟快照（含刚变更的这个，且已是新状态）查出来。
 */
export function decideChildDonePropagation(input: {
  parentId: string | null | undefined;
  prevStatus: IssueStatus;
  nextStatus: IssueStatus;
  parentStatus: IssueStatus;
  siblings: readonly ChildSnapshot[];
}): PropagationDecision {
  const { parentId, prevStatus, nextStatus, parentStatus, siblings } = input;

  if (!parentId) return { propagate: false, reason: 'no_parent' };

  // 仅 non-terminal → terminal。done→cancelled 这类 terminal 间移动不该再通知一次。
  if (!isTerminalIssueStatus(nextStatus)) {
    return { propagate: false, reason: 'next_not_terminal' };
  }
  if (isTerminalIssueStatus(prevStatus)) {
    return { propagate: false, reason: 'not_a_transition' };
  }

  // 父已收口就别再打扰（父可能已被人工关掉）
  if (isTerminalIssueStatus(parentStatus)) {
    return { propagate: false, reason: 'parent_already_terminal' };
  }

  // 必须是「最后一个」：所有直接子都进 terminal 才通知
  const pending = siblings.filter((s) => !isTerminalIssueStatus(s.status));
  if (pending.length > 0) return { propagate: false, reason: 'siblings_pending' };

  return { propagate: true, reason: 'ok' };
}

/** 收口通知的 markdown。父有指派人时带 mention 链接，便于人点进去。 */
export function buildChildDoneCommentBody(input: {
  childCount: number;
  lastChildIdentifier: string | null;
  lastChildTitle: string | null;
  assigneeMention: string | null;
}): string {
  const lines = ['✅ **子任务已全部收口**'];
  lines.push(`- 共 ${input.childCount} 个直接子任务，均已进入 done / cancelled`);
  if (input.lastChildIdentifier) {
    const title = input.lastChildTitle ? `：${input.lastChildTitle}` : '';
    lines.push(`- 最后收口：${input.lastChildIdentifier}${title}`);
  }
  if (input.assigneeMention) {
    lines.push(`\n${input.assigneeMention} 父任务可以继续了（父状态未自动修改）。`);
  } else {
    lines.push('\n父任务未指派，请人工决定下一步（父状态未自动修改）。');
  }
  return lines.join('\n');
}

export type PropagationOutcome = {
  parentId: string;
  commentId: string | null;
  runId: string | null;
  /** 未派活时的说明（无指派 / 小队无 leader / 已有进行中 run 等） */
  note: string;
};

/**
 * 对**一个**父级执行收口通知 + 唤醒。调用方须保证同一父级只调一次。
 * 不修改父 Issue 状态。
 */
export async function propagateOneParent(
  parentId: string,
  ctx: { lastChildId?: string | null },
): Promise<PropagationOutcome | null> {
  const parent = db.select().from(issues).where(eq(issues.id, parentId)).get();
  if (!parent) return null;

  const children = db
    .select({ id: issues.id, status: issues.status, identifier: issues.identifier, title: issues.title })
    .from(issues)
    .where(eq(issues.parentIssueId, parentId))
    .all();

  const lastChild = ctx.lastChildId
    ? children.find((c) => c.id === ctx.lastChildId) ?? null
    : null;

  // mention 链接：agent 指派直接 @agent；squad 指派 @squad（真正派活只给 leader）
  let assigneeMention: string | null = null;
  if (parent.assigneeType === 'agent' && parent.assigneeId) {
    const row = db.select().from(agents).where(eq(agents.id, parent.assigneeId)).get();
    assigneeMention = `[@${row?.name ?? parent.assigneeId}](mention://agent/${parent.assigneeId})`;
  } else if (parent.assigneeType === 'squad' && parent.assigneeId) {
    const detail = loadSquadDetail(parent.assigneeId);
    assigneeMention = `[@${detail?.name ?? parent.assigneeId}](mention://squad/${parent.assigneeId})`;
  }

  const body = buildChildDoneCommentBody({
    childCount: children.length,
    lastChildIdentifier: lastChild?.identifier ?? null,
    lastChildTitle: lastChild?.title ?? null,
    assigneeMention,
  });

  // 直接写表，不走 comments.ts POST —— 否则会被 triggerFromComment 再解析一次 mention，
  // 造成重复派活。
  const commentId = crypto.randomUUID();
  db.insert(comments)
    .values({
      id: commentId,
      issueId: parentId,
      type: 'comment',
      authorType: 'member',
      authorId: 'system',
      body,
      createdAt: Date.now(),
    })
    .run();
  const cRow = db.select().from(comments).where(eq(comments.id, commentId)).get();
  if (cRow) eventBus.publish({ type: 'comment:created', comment: toComment(cRow) });

  // 唤醒：agent 直接派；squad 只派 leader
  let runId: string | null = null;
  let note = '';
  if (parent.assigneeType === 'agent' && parent.assigneeId) {
    const enq = await enqueueAgentRun(parentId, parent.assigneeId);
    runId = enq.run?.id ?? null;
    note = enq.run ? '已排队父任务 run' : enq.detail ?? '未新建 run';
  } else if (parent.assigneeType === 'squad' && parent.assigneeId) {
    const leaderId = getSquadLeaderId(parent.assigneeId);
    if (!leaderId) {
      note = '小队无 leader，未派活';
    } else {
      const enq = await enqueueLeaderRun(parentId, leaderId, parent.assigneeId);
      runId = enq.run?.id ?? null;
      note = enq.run ? '已排队 leader run' : enq.detail ?? '未新建 run';
    }
  } else {
    note = '父任务未指派，仅通知';
  }

  recordActivityLog({
    issueId: parentId,
    actorType: 'system',
    actorId: null,
    eventType: 'child_done_rollup',
    payload: { childCount: children.length, runId, lastChildId: ctx.lastChildId ?? null },
  });

  return { parentId, commentId, runId, note };
}

export type ChildStatusChange = {
  issueId: string;
  parentIssueId: string | null | undefined;
  prevStatus: IssueStatus;
  nextStatus: IssueStatus;
};

/**
 * 批量入口：一次请求里的多个子状态变更，折叠成「每个符合条件的父级各一次」。
 * 这是 AC2「批量更新同一父级最多一条评论一个 run」的实现处。
 */
export async function propagateChildDoneBatch(
  changes: readonly ChildStatusChange[],
): Promise<PropagationOutcome[]> {
  if (changes.length === 0) return [];

  const parentIds = Array.from(
    new Set(changes.map((c) => c.parentIssueId).filter((p): p is string => Boolean(p))),
  );
  if (parentIds.length === 0) return [];

  const parents = db
    .select({ id: issues.id, status: issues.status })
    .from(issues)
    .where(inArray(issues.id, parentIds))
    .all();
  const parentStatusById = new Map(parents.map((p) => [p.id, p.status]));

  const siblingRows = db
    .select({ id: issues.id, status: issues.status, parentIssueId: issues.parentIssueId })
    .from(issues)
    .where(inArray(issues.parentIssueId, parentIds))
    .all();
  const siblingsByParent = new Map<string, ChildSnapshot[]>();
  for (const r of siblingRows) {
    if (!r.parentIssueId) continue;
    const arr = siblingsByParent.get(r.parentIssueId) ?? [];
    arr.push({ id: r.id, status: r.status });
    siblingsByParent.set(r.parentIssueId, arr);
  }

  // 同一父级只保留一个触发者（最后一个 terminal 变更），实现折叠
  const winners = new Map<string, ChildStatusChange>();
  for (const c of changes) {
    if (!c.parentIssueId) continue;
    const decision = decideChildDonePropagation({
      parentId: c.parentIssueId,
      prevStatus: c.prevStatus,
      nextStatus: c.nextStatus,
      parentStatus: parentStatusById.get(c.parentIssueId) ?? 'backlog',
      siblings: siblingsByParent.get(c.parentIssueId) ?? [],
    });
    if (decision.propagate) winners.set(c.parentIssueId, c);
  }

  const outcomes: PropagationOutcome[] = [];
  for (const [parentId, change] of winners) {
    const out = await propagateOneParent(parentId, { lastChildId: change.issueId });
    if (out) outcomes.push(out);
  }
  return outcomes;
}
