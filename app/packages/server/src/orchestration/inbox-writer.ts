import { and, eq } from 'drizzle-orm';
import type { Comment, AgentRun, Issue } from '@ma/shared';
import { db } from '../db/client.js';
import { inboxItems, issueSubscribers, issues } from '../db/schema.js';
import { toInboxItem } from '../db/reshape.js';
import { LOCAL_MEMBER } from '../local-member.js';
import { eventBus } from './event-bus.js';

const WS = 'ws-local';

export function ensureIssueSubscriber(
  issueId: string,
  userType: 'member' | 'agent',
  userId: string,
  reason: string,
): void {
  const existing = db
    .select()
    .from(issueSubscribers)
    .where(
      and(
        eq(issueSubscribers.issueId, issueId),
        eq(issueSubscribers.userType, userType),
        eq(issueSubscribers.userId, userId),
      ),
    )
    .get();
  if (existing) return;

  db.insert(issueSubscribers)
    .values({
      issueId,
      userType,
      userId,
      reason,
      createdAt: Date.now(),
    })
    .run();
}

export function getIssueSubscription(
  issueId: string,
  userType: 'member' | 'agent',
  userId: string,
): { subscribed: boolean; reason: string | null } {
  const row = db
    .select()
    .from(issueSubscribers)
    .where(
      and(
        eq(issueSubscribers.issueId, issueId),
        eq(issueSubscribers.userType, userType),
        eq(issueSubscribers.userId, userId),
      ),
    )
    .get();
  if (!row) return { subscribed: false, reason: null };
  return { subscribed: true, reason: row.reason };
}

/** 取消本地 member 关注；返回是否曾订阅 */
export function removeIssueSubscriber(
  issueId: string,
  userType: 'member' | 'agent',
  userId: string,
): boolean {
  const existing = db
    .select()
    .from(issueSubscribers)
    .where(
      and(
        eq(issueSubscribers.issueId, issueId),
        eq(issueSubscribers.userType, userType),
        eq(issueSubscribers.userId, userId),
      ),
    )
    .get();
  if (!existing) return false;
  db.delete(issueSubscribers)
    .where(
      and(
        eq(issueSubscribers.issueId, issueId),
        eq(issueSubscribers.userType, userType),
        eq(issueSubscribers.userId, userId),
      ),
    )
    .run();
  return true;
}

export function notifyInbox(opts: {
  type: 'comment' | 'run_completed' | 'run_failed' | 'assigned';
  severity: 'action_required' | 'attention' | 'info';
  title: string;
  body?: string | null;
  issueId: string | null;
  runId?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  dedupeKey: string;
  recipientType?: 'member' | 'agent';
  recipientId?: string;
}): ReturnType<typeof toInboxItem> | null {
  const recipientType = opts.recipientType ?? 'member';
  const recipientId = opts.recipientId ?? LOCAL_MEMBER.id;

  if (opts.dedupeKey) {
    const dup = db
      .select()
      .from(inboxItems)
      .where(
        and(
          eq(inboxItems.recipientType, recipientType),
          eq(inboxItems.recipientId, recipientId),
          eq(inboxItems.dedupeKey, opts.dedupeKey),
        ),
      )
      .get();
    if (dup) return null;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  db.insert(inboxItems)
    .values({
      id,
      workspaceId: WS,
      recipientType,
      recipientId,
      type: opts.type,
      severity: opts.severity,
      issueId: opts.issueId,
      runId: opts.runId ?? null,
      title: opts.title,
      body: opts.body ?? null,
      actorType: opts.actorType ?? null,
      actorId: opts.actorId ?? null,
      dedupeKey: opts.dedupeKey,
      read: 0,
      archived: 0,
      createdAt: now,
    })
    .run();

  const row = db.select().from(inboxItems).where(eq(inboxItems.id, id)).get()!;
  let issueMeta: { identifier: string; title: string } | undefined;
  if (row.issueId) {
    const iss = db.select().from(issues).where(eq(issues.id, row.issueId)).get();
    if (iss) issueMeta = { identifier: iss.identifier, title: iss.title };
  }
  const item = toInboxItem(row, issueMeta);
  eventBus.publish({ type: 'inbox:item', item });
  return item;
}

export function notifyCommentCreated(comment: Comment, issue: Issue): void {
  // status_change 不进 inbox（补1 收敛 S12 噪音）
  if (comment.type !== 'comment') return;
  ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'creator_or_participant');
  notifyInbox({
    type: 'comment',
    severity: 'attention',
    title: `新评论 · ${issue.identifier}`,
    body: comment.body.slice(0, 500),
    issueId: issue.id,
    actorType: comment.authorType,
    actorId: comment.authorId,
    dedupeKey: `comment:${comment.id}`,
  });
}

export function notifyRunTerminal(run: AgentRun): void {
  if (run.status !== 'completed' && run.status !== 'failed') return;
  const failed = run.status === 'failed';
  // bu03：quick_create 可能尚无 issue（或已 Link）；有 issue 走旧文案，无 issue 走快速派活文案
  if (run.issueId) {
    const issue = db.select().from(issues).where(eq(issues.id, run.issueId)).get();
    if (!issue) return;
    ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'run_watcher');
    const isQc = run.kind === 'quick_create';
    notifyInbox({
      type: failed ? 'run_failed' : 'run_completed',
      severity: failed ? 'action_required' : 'info',
      title: failed
        ? isQc
          ? `Run 失败 · 快速派活 · ${issue.identifier}`
          : `Run 失败 · ${issue.identifier}`
        : isQc
          ? `Run 完成 · 快速派活 · ${issue.identifier}`
          : `Run 完成 · ${issue.identifier}`,
      body: run.error ?? null,
      issueId: issue.id,
      runId: run.id,
      actorType: 'agent',
      actorId: run.agentId,
      dedupeKey: `run:${run.id}:${run.status}`,
    });
    return;
  }
  if (run.kind === 'quick_create') {
    notifyInbox({
      type: failed ? 'run_failed' : 'run_completed',
      severity: failed ? 'action_required' : 'info',
      title: failed ? 'Run 失败 · 快速派活' : 'Run 完成 · 快速派活',
      body: run.error ?? null,
      issueId: null,
      runId: run.id,
      actorType: 'agent',
      actorId: run.agentId,
      dedupeKey: `run:${run.id}:${run.status}`,
    });
  }
}

export function notifyAssigned(issue: Issue): void {
  ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'assignee_watch');
  notifyInbox({
    type: 'assigned',
    severity: 'attention',
    title: `已指派 · ${issue.identifier}`,
    body: issue.title,
    issueId: issue.id,
    actorType: 'member',
    actorId: LOCAL_MEMBER.id,
    dedupeKey: `assign:${issue.id}:${issue.assignee?.type ?? ''}:${issue.assignee?.id ?? ''}:${issue.updatedAt}`,
  });
}

/**
 * Slice2：enqueue 被硬闸/熔断跳过 → action_required Inbox。
 * already_active 不写（噪声）；dedupe 按 issue+reason 短窗（同 key 覆盖式跳过重复）。
 */
export function notifyEnqueueSkipped(
  issueId: string,
  agentId: string,
  reason: string,
  detail: string,
): void {
  if (reason === 'already_active') return;
  const issue = db.select().from(issues).where(eq(issues.id, issueId)).get();
  if (!issue) return;
  ensureIssueSubscriber(issueId, 'member', LOCAL_MEMBER.id, 'run_watcher');
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
  // 按 issue+reason 去重，避免同一阻塞连点指派刷屏
  notifyInbox({
    type: 'run_failed',
    severity: 'action_required',
    title: `未开工 · ${issue.identifier} · ${label}`,
    body: detail,
    issueId,
    actorType: 'agent',
    actorId: agentId,
    dedupeKey: `enqueue_skip:${issueId}:${reason}`,
  });
}
