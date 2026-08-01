import type { Comment } from '@ma/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agents, comments, issues } from '../db/schema.js';
import { toComment } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { enqueueAgentRun, enqueueLeaderRun } from './run-service.js';
import { getSquadLeaderId, loadSquadDetail } from '../db/squad-loader.js';
import { recordActivityLog } from './activity-logger.js';

// comment-trigger —— comment 创建后解析 mention link 派任务（spec §7）。
// 挂接点：人工 comment（comments.ts POST）+ agent 终态 comment（run-worker.ts completed）。
// 循环 import 安全（排雷补充#2）：函数体内交叉引用，ESM live binding OK。
//
// B1+B2：评论触发路由补齐（对照 multica computeCommentAgentTriggers）——
//   1. 有 agent/squad mention → 只按 mention 走（assignee/thread-parent fallback 不叠加，防双触发）
//   2. agent 作者评论默认不参与路由；唯一窄路径：squad-assigned issue 上 agent 写的评论
//      → 唤醒被指派 squad 的 leader（self-trigger guard：作者就是 leader 时跳过）
//   3. member + 父评论是 agent 评论 → 触发父评论作者（thread-parent）
//   4. 否则（无 parent / parent 非 agent / 父作者不存在）→ routeAssigneeFallback（issue_assignee）
// 乒乓防护：enqueue 侧已有 per-(issue,agent) 去重 + 熔断（checkAndEnqueue），此处不新增机制。

export type MentionDispatch = {
  kind: 'agent' | 'squad';
  targetId: string;
  targetLabel: string;
  /** 新入队 run id；null=跳过（已有 active / 无 leader / 熔断等） */
  runId: string | null;
  note: string;
  /** 派发来源：mention=显式 @提及；assignee=issue 指派人 fallback；thread-parent=回复唤醒父评论作者 */
  source?: 'mention' | 'assignee' | 'thread-parent';
};

type IssueRow = typeof issues.$inferSelect;

function parseMentions(
  body: string,
): Array<{ kind: 'agent' | 'squad'; id: string }> {
  const re = /mention:\/\/(agent|squad)\/([\w-]+)/g;
  const results: Array<{ kind: 'agent' | 'squad'; id: string }> = [];
  let match;
  while ((match = re.exec(body)) !== null) {
    results.push({ kind: match[1] as 'agent' | 'squad', id: match[2] });
  }
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function agentLabel(id: string): string {
  const row = db.select().from(agents).where(eq(agents.id, id)).get();
  return row?.name ?? id;
}

function squadLabel(id: string): string {
  const d = loadSquadDetail(id);
  return d?.name ?? id;
}

/** 时间线可见：系统一条总结，操作者立刻知道 mention 有没有派上 */
function publishDispatchSummary(issueId: string, dispatches: MentionDispatch[]): void {
  if (dispatches.length === 0) return;
  const lines = dispatches.map((d) => {
    const link =
      d.kind === 'agent'
        ? `[@${d.targetLabel}](mention://agent/${d.targetId})`
        : `[@${d.targetLabel}](mention://squad/${d.targetId})`;
    if (d.runId) {
      // 可点进工作区 runs 并带 run 高亮（URL mirror 消费 ?run=）
      return `- ${link} → 已排队（[run ${d.runId.slice(0, 8)}…](/runs?run=${d.runId})）`;
    }
    return `- ${link} → ${d.note}`;
  });
  // B1+B2：按 source 区分总结标题，读者立刻知道是 @提及 / 指派派发 / 回复唤醒
  const header =
    dispatches[0]?.source === 'assignee'
      ? '📣 **评论路由：将任务派给指派人**'
      : dispatches[0]?.source === 'thread-parent'
        ? '📣 **评论路由：回复将唤醒**'
        : '📣 **@提及派发**';
  const body = [header, ...lines].join('\n');
  const cid = crypto.randomUUID();
  db.insert(comments)
    .values({
      id: cid,
      issueId,
      type: 'comment',
      authorType: 'member',
      authorId: 'system',
      body,
      createdAt: Date.now(),
    })
    .run();
  const cRow = db.select().from(comments).where(eq(comments.id, cid)).get();
  if (cRow) eventBus.publish({ type: 'comment:created', comment: toComment(cRow) });

  // R4: mention_delegated activity for full WS/activity/mention pill closure
  dispatches.forEach((d) => {
    if (d.runId) {
      recordActivityLog({
        issueId,
        actorType: 'system',
        actorId: null,
        eventType: 'mention_delegated',
        payload: {
          targetId: d.targetId,
          targetKind: d.kind,
          runId: d.runId,
          ...(d.source ? { source: d.source } : {}),
        },
      });
    }
  });
}

/**
 * B1 routeAssigneeFallback —— member 普通评论（无 mention / 父评论不可路由）落到 issue 指派人。
 * assignee=agent → enqueueAgentRun；assignee=squad → 解析 leader 后 enqueueLeaderRun
 * （复用 squad mention 分支语义：无 leader 出 note、leader 自指跳过由调用方守卫）。
 * assignee=member 或未指派 → 不触发。
 */
async function routeToAssignee(
  issueId: string,
  issue: IssueRow,
): Promise<MentionDispatch[]> {
  if (issue.assigneeType === 'agent' && issue.assigneeId) {
    const enq = await enqueueAgentRun(issueId, issue.assigneeId);
    return [
      {
        kind: 'agent',
        targetId: issue.assigneeId,
        targetLabel: agentLabel(issue.assigneeId),
        runId: enq.run?.id ?? null,
        note: enq.run
          ? '已排队（指派派发）'
          : enq.detail ?? '未新建 run（可能已有进行中的 run，或达到 issue 上限）',
        source: 'assignee',
      },
    ];
  }
  if (issue.assigneeType === 'squad' && issue.assigneeId) {
    const leaderId = getSquadLeaderId(issue.assigneeId);
    const label = squadLabel(issue.assigneeId);
    if (!leaderId) {
      return [
        {
          kind: 'squad',
          targetId: issue.assigneeId,
          targetLabel: label,
          runId: null,
          note: '小队无 leader，无法派发（请在小队详情指定队长）',
          source: 'assignee',
        },
      ];
    }
    const enq = await enqueueLeaderRun(issueId, leaderId, issue.assigneeId);
    return [
      {
        kind: 'squad',
        targetId: issue.assigneeId,
        targetLabel: label,
        runId: enq.run?.id ?? null,
        note: enq.run
          ? '已排队 leader run（指派派发）'
          : enq.detail ?? '未新建 run（可能已有进行中的 run，或达到 issue 上限）',
        source: 'assignee',
      },
    ];
  }
  return []; // member / 未指派
}

/**
 * agent 作者评论的唯一窄路径：squad-assigned issue 上 agent 写评论 → 唤醒被指派 squad 的 leader
 * （保 leader→worker→leader 闭环）。self-trigger guard：作者就是 leader 时跳过。
 * 无 leader / 去重或熔断跳过 → 静默返回（agent 评论不产生噪音 note，防乒乓）。
 */
async function routeSquadAssignedLeaderWake(
  issueId: string,
  issue: IssueRow,
  comment: Comment,
): Promise<MentionDispatch[]> {
  if (issue.assigneeType !== 'squad' || !issue.assigneeId) return [];
  const leaderId = getSquadLeaderId(issue.assigneeId);
  if (!leaderId) return []; // 无 leader：无处可唤醒
  if (comment.authorId === leaderId) return []; // leader 自指，跳过防循环
  const enq = await enqueueLeaderRun(issueId, leaderId, issue.assigneeId);
  if (!enq.run) return []; // already_active / 熔断等：leader 已在跑或 issue 已满，无需再唤醒
  return [
    {
      kind: 'squad',
      targetId: issue.assigneeId,
      targetLabel: squadLabel(issue.assigneeId),
      runId: enq.run.id,
      note: '已排队 leader run（squad 指派唤醒）',
      source: 'assignee',
    },
  ];
}

/**
 * B2 thread_parent —— member 回复 agent 评论 → 触发父评论作者。
 * 父评论不是 agent 写的 / 父作者不存在或已归档（无 runtime）→ 落到 assignee fallback
 * （escalation fallback = B3，本刀不做；无 parent / parent 非 agent 走 assignee）。
 * issue 行懒加载：只在需要 assignee fallback 时才读，thread-parent 正常路径不依赖。
 */
async function routeThreadParent(comment: Comment): Promise<MentionDispatch[]> {
  const fallback = async (): Promise<MentionDispatch[]> => {
    const issue = db.select().from(issues).where(eq(issues.id, comment.issueId)).get();
    if (!issue) return [];
    return routeToAssignee(comment.issueId, issue);
  };

  if (!comment.parentCommentId) return fallback();
  const parent = db
    .select()
    .from(comments)
    .where(eq(comments.id, comment.parentCommentId))
    .get();
  if (!parent || parent.authorType !== 'agent') return fallback();

  // 父作者无 runtime：agent 已不存在 / 已归档（archivedAt）→ 不触发父作者，落到 assignee
  const author = db.select().from(agents).where(eq(agents.id, parent.authorId)).get();
  if (!author || author.archivedAt != null) return fallback();

  const enq = await enqueueAgentRun(comment.issueId, parent.authorId);
  return [
    {
      kind: 'agent',
      targetId: parent.authorId,
      targetLabel: author.name ?? parent.authorId,
      runId: enq.run?.id ?? null,
      note: enq.run
        ? '已排队（回复唤醒）'
        : enq.detail ?? '未新建 run（可能已有进行中的 run，或达到 issue 上限）',
      source: 'thread-parent',
    },
  ];
}

// triggerFromComment —— 解析 mention 并 enqueue；返回派发结果（UI/API 可感知）
// B1+B2 fallback 链（对照 multica computeCommentAgentTriggers 优先级）：
//   有 mention → 只按 mention；agent 作者 → 仅 squad-assigned 窄路径；
//   member + 父 agent 评论 → thread-parent；否则 → routeAssigneeFallback。
export async function triggerFromComment(
  comment: Comment,
  opts?: { announce?: boolean },
): Promise<MentionDispatch[]> {
  if (comment.type !== 'comment') return [];

  const mentions = parseMentions(comment.body);
  const dispatches: MentionDispatch[] = [];

  if (mentions.length > 0) {
    // 有 mention：只按 mention 走，assignee / thread-parent fallback 不叠加（防双触发）
    for (const m of mentions) {
      if (m.kind === 'agent') {
        const label = agentLabel(m.id);
        const enq = await enqueueAgentRun(comment.issueId, m.id);
        dispatches.push({
          kind: 'agent',
          targetId: m.id,
          targetLabel: label,
          runId: enq.run?.id ?? null,
          note: enq.run
            ? '已排队'
            : enq.detail ?? '未新建 run（可能已有进行中的 run，或达到 issue 上限）',
          source: 'mention',
        });
      } else if (m.kind === 'squad') {
        const leaderId = getSquadLeaderId(m.id);
        const label = squadLabel(m.id);
        if (!leaderId) {
          dispatches.push({
            kind: 'squad',
            targetId: m.id,
            targetLabel: label,
            runId: null,
            note: '小队无 leader，无法派发（请在小队详情指定队长）',
            source: 'mention',
          });
          continue;
        }
        if (comment.authorType === 'agent' && comment.authorId === leaderId) {
          dispatches.push({
            kind: 'squad',
            targetId: m.id,
            targetLabel: label,
            runId: null,
            note: 'leader 自指 @小队，跳过防循环',
            source: 'mention',
          });
          continue;
        }
        const enq = await enqueueLeaderRun(comment.issueId, leaderId, m.id);
        dispatches.push({
          kind: 'squad',
          targetId: m.id,
          targetLabel: label,
          runId: enq.run?.id ?? null,
          note: enq.run
            ? '已排队 leader run'
            : enq.detail ?? '未新建 run（可能已有进行中的 run，或达到 issue 上限）',
          source: 'mention',
        });
      }
    }
  } else {
    if (comment.authorType === 'agent') {
      // agent 作者评论默认不参与路由；唯一窄路径：squad-assigned 唤醒 leader
      const issue = db.select().from(issues).where(eq(issues.id, comment.issueId)).get();
      if (!issue) return [];
      dispatches.push(
        ...(await routeSquadAssignedLeaderWake(comment.issueId, issue, comment)),
      );
    } else {
      // member：回复 agent 评论 → 父作者；否则 → issue 指派人（issue 懒加载）
      dispatches.push(...(await routeThreadParent(comment)));
    }
  }

  if (opts?.announce !== false) {
    publishDispatchSummary(comment.issueId, dispatches);
  }
  return dispatches;
}
