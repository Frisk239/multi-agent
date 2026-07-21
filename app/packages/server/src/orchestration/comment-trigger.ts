import type { Comment } from '@ma/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agents, comments } from '../db/schema.js';
import { toComment } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { enqueueAgentRun, enqueueLeaderRun } from './run-service.js';
import { getSquadLeaderId, loadSquadDetail } from '../db/squad-loader.js';

// comment-trigger —— comment 创建后解析 mention link 派任务（spec §7）。
// 挂接点：人工 comment（comments.ts POST）+ agent 终态 comment（run-worker.ts completed）。
// 循环 import 安全（排雷补充#2）：函数体内交叉引用，ESM live binding OK。

export type MentionDispatch = {
  kind: 'agent' | 'squad';
  targetId: string;
  targetLabel: string;
  /** 新入队 run id；null=跳过（已有 active / 无 leader / 熔断等） */
  runId: string | null;
  note: string;
};

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
  const body = ['📣 **@提及派发**', ...lines].join('\n');
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
}

// triggerFromComment —— 解析 mention 并 enqueue；返回派发结果（UI/API 可感知）
export async function triggerFromComment(
  comment: Comment,
  opts?: { announce?: boolean },
): Promise<MentionDispatch[]> {
  if (comment.type !== 'comment') return [];

  const mentions = parseMentions(comment.body);
  const dispatches: MentionDispatch[] = [];

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
      });
    }
  }

  if (opts?.announce !== false) {
    publishDispatchSummary(comment.issueId, dispatches);
  }
  return dispatches;
}
