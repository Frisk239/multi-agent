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

export function notifyInbox(opts: {
  type: 'comment' | 'run_completed' | 'run_failed' | 'assigned';
  severity: 'action_required' | 'attention' | 'info';
  title: string;
  body?: string | null;
  issueId: string | null;
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
  const issue = db.select().from(issues).where(eq(issues.id, run.issueId)).get();
  if (!issue) return;
  ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'run_watcher');
  const failed = run.status === 'failed';
  notifyInbox({
    type: failed ? 'run_failed' : 'run_completed',
    severity: failed ? 'action_required' : 'info',
    title: failed
      ? `Run 失败 · ${issue.identifier}`
      : `Run 完成 · ${issue.identifier}`,
    body: run.error ?? null,
    issueId: issue.id,
    actorType: 'agent',
    actorId: run.agentId,
    dedupeKey: `run:${run.id}:${run.status}`,
  });
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
