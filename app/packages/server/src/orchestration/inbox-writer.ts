import { and, eq } from 'drizzle-orm';
import type { Comment, AgentRun, Issue } from '@ma/shared';
import { db } from '../db/client.js';
import { inboxItems, issueSubscribers, issues, agents, squads } from '../db/schema.js';
import { toInboxItem } from '../db/reshape.js';
import { LOCAL_MEMBER } from '../local-member.js';
import { eventBus } from './event-bus.js';
import { shouldNotifyIssueSuccess, readInboxPrefs } from './inbox-prefs.js';
import { showSystemNotification } from './system-notify.js';

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
  return { subscribed: row.reason !== 'muted', reason: row.reason };
}

/** 取消本地 member 关注（Mute）；返回是否成功 */
export function removeIssueSubscriber(
  issueId: string,
  userType: 'member' | 'agent',
  userId: string,
): boolean {
  db.insert(issueSubscribers)
    .values({
      issueId,
      userType,
      userId,
      reason: 'muted',
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [issueSubscribers.issueId, issueSubscribers.userType, issueSubscribers.userId],
      set: { reason: 'muted' },
    })
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

  const prefs = readInboxPrefs();
  if (prefs.notifyTypes && prefs.notifyTypes[opts.type] === false) return null;
  if (prefs.notifySeverities && prefs.notifySeverities[opts.severity] === false) return null;

  if (opts.issueId) {
    const sub = getIssueSubscription(opts.issueId, recipientType, recipientId);
    if (sub.subscribed && sub.reason === 'muted') return null;
  }

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
  // G5-5：inbox 新项（含 run 终态）→ 系统桌面通知（开关默认关；失败静默）
  showSystemNotification({ title: opts.title, body: opts.body });
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

/**
 * F10 + P2-B Inbox 策略：
 * - failed：issue / QC / chat 一律进 Inbox（action_required）
 * - completed：默认不推 issue 成功；QC 成功仍推；chat 成功不推
 * - 开启：MA_INBOX_NOTIFY_SUCCESS=1 或 inbox-prefs.notifyIssueSuccess
 */
export function notifyRunTerminal(run: AgentRun): void {
  const isTerminal = run.status === 'completed' || run.status === 'failed' || run.status === 'timed_out';
  if (!isTerminal) return;
  const failed = run.status === 'failed' || run.status === 'timed_out';
  const notifySuccess = shouldNotifyIssueSuccess();

  // —— chat：仅失败进 Inbox（漏报修复）——
  if (run.kind === 'chat') {
    if (!failed) return;
    const threadHint = run.chatThreadId
      ? `会话 ${run.chatThreadId.slice(0, 8)}…`
      : '聊天';
    notifyInbox({
      type: 'run_failed',
      severity: 'action_required',
      title: `聊天失败 · ${threadHint}`,
      body: run.error ?? '执行失败，可打开会话重发',
      issueId: null,
      runId: run.id,
      actorType: 'agent',
      actorId: run.agentId,
      dedupeKey: `run:${run.id}:${run.status}`,
    });
    return;
  }

  // —— issue 成功默认跳过（降噪）——
  if (!failed && run.kind === 'issue' && !notifySuccess) {
    return;
  }

  // bu03：quick_create 可能尚无 issue（或已 Link）；有 issue 走旧文案，无 issue 走快速派活文案
  if (run.issueId) {
    const issue = db.select().from(issues).where(eq(issues.id, run.issueId)).get();
    if (!issue) return;
    ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'run_watcher');
    const isQc = run.kind === 'quick_create';
    // QC 回链后的 completed：保留（建卡成功）；issue 仅 failed 或 notifySuccess
    if (!failed && !isQc && !notifySuccess) return;
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

/**
 * P2-4：runtime 连接不上 + auto-retry 预算用尽 → 已自动改派给 fallback agent。
 * 与 notifySquadEscalated 分流（无 Squad 语义、独立 dedupeKey）。
 */
export function notifyRunEscalated(
  run: AgentRun,
  opts: { toRunId: string; toAgentId: string; toAgentName: string },
): void {
  if (!run.issueId) return;
  const issue = db.select().from(issues).where(eq(issues.id, run.issueId)).get();
  if (!issue) return;
  const fromAgent = db.select().from(agents).where(eq(agents.id, run.agentId)).get();
  ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'run_watcher');
  notifyInbox({
    type: 'run_failed',
    severity: 'attention',
    title: `运行时不可达 · 已自动转给 ${opts.toAgentName} · ${issue.identifier}`,
    body: `${fromAgent?.name ?? run.agentId} 的运行时连接不上，自动重试预算已用尽；任务已自动转给 ${opts.toAgentName}（新 run ${opts.toRunId.slice(0, 8)}…）。`,
    issueId: issue.id,
    runId: run.id,
    actorType: 'system',
    actorId: null,
    dedupeKey: `escalate_fallback:${run.id}`,
  });
}

export function notifySquadEscalated(run: AgentRun): void {
  if (!run.issueId || !run.squadId) return;
  const issue = db.select().from(issues).where(eq(issues.id, run.issueId)).get();
  const agent = db.select().from(agents).where(eq(agents.id, run.agentId)).get();
  const squad = db.select().from(squads).where(eq(squads.id, run.squadId)).get();
  if (!issue || !agent || !squad) return;

  const title = `[小队升级告警] 成员 Agent ${agent.name} 在 Issue ${issue.identifier} 执行遭遇异常，已自动升级`;

  if (squad.leaderId) {
    notifyInbox({
      type: 'run_failed',
      severity: 'action_required',
      title,
      body: `Run ID: ${run.id}\nError: ${run.error || 'Unknown'}`,
      issueId: issue.id,
      runId: run.id,
      actorType: 'agent',
      actorId: run.agentId,
      dedupeKey: `escalate:${run.id}`,
      recipientType: 'agent',
      recipientId: squad.leaderId,
    });
  }

  notifyInbox({
    type: 'run_failed',
    severity: 'action_required',
    title,
    body: `Run ID: ${run.id}\nError: ${run.error || 'Unknown'}`,
    issueId: issue.id,
    runId: run.id,
    actorType: 'agent',
    actorId: run.agentId,
    dedupeKey: `escalate:member:${run.id}`,
    recipientType: 'member',
    recipientId: LOCAL_MEMBER.id,
  });
}

/**
 * Slice 42 / D5 + Slice 70：queued 过久未 claim 的 deferred 升级通知。
 * - 与 notifySquadEscalated / [Squad Escalated] **分流**（无 Squad 文案、无 escalate: key）
 * - dedupeKey 固定 `deferred:<runId>`，可关阈值（默认不自动升级）
 * - 不改 run 状态 / 不真改派；硬 fail 仍由 failStaleQueuedRuns 负责
 * - Slice 70：body 可附「建议改派」草稿 note（applied=false）
 */
export function notifyDeferredUnclaimed(
  run: AgentRun,
  opts?: {
    thresholdMs?: number;
    reassignDraft?: { note: string; agentId?: string | null; applied: false };
  },
): ReturnType<typeof toInboxItem> | null {
  if (run.status !== 'queued' && run.status !== 'deferred') return null;

  let issueIdentifier: string | null = null;
  if (run.issueId) {
    const issue = db.select().from(issues).where(eq(issues.id, run.issueId)).get();
    if (issue) {
      issueIdentifier = issue.identifier;
      ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'run_watcher');
    }
  }

  const thresholdHint =
    opts?.thresholdMs && opts.thresholdMs > 0
      ? `（阈值 ${Math.round(opts.thresholdMs / 60_000)}m）`
      : '';
  const title = issueIdentifier
    ? `Deferred · 排队过久未 claim · ${issueIdentifier}`
    : run.kind === 'quick_create'
      ? 'Deferred · 排队过久未 claim · 快速派活'
      : run.kind === 'chat'
        ? 'Deferred · 排队过久未 claim · 聊天'
        : 'Deferred · 排队过久未 claim';

  const draftHint = opts?.reassignDraft
    ? ` 建议改派（草稿，未自动执行）：检查 agent 就绪后手动 reassign${
        opts.reassignDraft.agentId ? ` · 当前 agent=${opts.reassignDraft.agentId}` : ''
      }。`
    : '';

  return notifyInbox({
    type: 'run_failed',
    severity: 'attention',
    title,
    body: `Run ${run.id} 仍处于 queued，尚未被 worker claim${thresholdHint}。检查 agent 就绪/worker 是否卡住；与失败后 Squad Escalated 路径无关。${draftHint}`,
    issueId: run.issueId ?? null,
    runId: run.id,
    actorType: 'system',
    actorId: null,
    dedupeKey: `deferred:${run.id}`,
    recipientType: 'member',
    recipientId: LOCAL_MEMBER.id,
  });
}
