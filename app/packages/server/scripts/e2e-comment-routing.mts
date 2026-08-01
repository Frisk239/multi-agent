/**
 * B1+B2 · 评论触发路由 e2e —— 评论即续工闭环（对照 multica computeCommentAgentTriggers）
 *
 * 前置：独立 DB 起的 server（DB_PATH=./e2e-b1b2.db pnpm exec tsx src/index.ts）
 *
 * 覆盖：
 * 1. B1 agent assignee：member 普通评论（无 mention）→ 派给 issue 指派人 agent
 * 2. B1 squad assignee：member 普通评论 → 派给被指派 squad 的 leader
 * 3. B1 未指派：dispatches 为空
 * 4. 防叠加：有 mention 时 assignee 不叠加
 * 5. B2 thread-parent：member 回复 agent 评论 → 唤醒父评论作者
 * 6. 时间线可见：系统总结 comment 按 source 区分标题
 *
 * 运行：
 *   cd app/packages/server && pnpm exec tsx scripts/e2e-comment-routing.mts
 */

import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SERVER = process.env.SERVER ?? 'http://127.0.0.1:3001';
const DB_PATH = process.env.E2E_DB ?? './e2e-b1b2.db';

type Status = 'PASS' | 'FAIL' | 'SKIP' | 'WARN';
interface CheckRow { id: string; status: Status; note: string }
const results: CheckRow[] = [];
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '../../../.progress/logs');

function record(id: string, ok: boolean, note: string): void {
  const status: Status = ok ? 'PASS' : 'FAIL';
  results.push({ id, status, note });
  console.log(`  [${status}] ${id} — ${note}`);
}

async function postComment(
  issueId: string,
  body: string,
  parentCommentId?: string,
): Promise<{ comment: any; dispatches: any[] }> {
  const res = await fetch(`${SERVER}/api/issues/${issueId}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body, ...(parentCommentId ? { parentCommentId } : {}) }),
  });
  if (res.status !== 201) throw new Error(`POST comment ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return { comment: json, dispatches: json.dispatches ?? [] };
}

async function getComments(issueId: string): Promise<any[]> {
  const res = await fetch(`${SERVER}/api/issues/${issueId}/comments`);
  return (await res.json()) as any[];
}

async function main(): Promise<void> {
  const db = new Database(DB_PATH, { readonly: false });
  const issueOf = (identifier: string) =>
    (db.prepare("select id from issue where identifier = ?").get(identifier) as any).id;
  const sqd = db.prepare("select leader_id from squad where id = 'sqd-product'").get() as any;

  const fri10 = issueOf('FRI-10'); // assignee = agent agt-research
  const fri11 = issueOf('FRI-11'); // assignee = squad sqd-product（leader = agt-lead）
  const fri08 = issueOf('FRI-08'); // assignee = null
  const fri09 = issueOf('FRI-09'); // assignee = agent agt-prd

  // 1. B1 agent assignee：普通评论 → 派给 agt-research
  {
    const { dispatches } = await postComment(fri10, `e2e B1 agent assignee ${Date.now()}`);
    const d = dispatches?.[0];
    record(
      'B1-assignee-agent',
      d?.source === 'assignee' && d?.kind === 'agent' && d?.targetId === 'agt-research' && !!d?.runId,
      `source=${d?.source} kind=${d?.kind} target=${d?.targetId} runId=${d?.runId ?? 'null'}`,
    );
    // 6. 系统总结 comment 可见
    const comments = await getComments(fri10);
    const summary = comments.find((c) => c.body.includes('评论路由'));
    record(
      'summary-comment-visible',
      !!summary && summary.body.includes('将任务派给指派人') && summary.body.includes('agt-research'),
      summary ? `header=${summary.body.split('\n')[0]}` : '未找到系统总结',
    );
  }

  // 2. B1 squad assignee：普通评论 → leader（agt-lead）
  {
    const { dispatches } = await postComment(fri11, `e2e B1 squad assignee ${Date.now()}`);
    const d = dispatches?.[0];
    record(
      'B1-assignee-squad-leader',
      d?.source === 'assignee' && d?.kind === 'squad' && d?.targetId === 'sqd-product' && !!d?.runId,
      `source=${d?.source} kind=${d?.kind} squad=${d?.targetId} runId=${d?.runId ?? 'null'} (leader=${sqd.leader_id})`,
    );
  }

  // 3. B1 未指派：dispatches 空
  {
    const { dispatches } = await postComment(fri08, `e2e B1 unassigned ${Date.now()}`);
    record('B1-unassigned-empty', Array.isArray(dispatches) && dispatches.length === 0, `dispatches=${JSON.stringify(dispatches)}`);
  }

  // 4. 防叠加：mention 存在时 assignee 不叠加
  {
    const { dispatches } = await postComment(fri10, `e2e mention-only @prd mention://agent/agt-prd ${Date.now()}`);
    record(
      'mention-no-assignee-overlap',
      dispatches?.length === 1 && dispatches[0]?.source === 'mention' && dispatches[0]?.targetId === 'agt-prd',
      `dispatches=${JSON.stringify(dispatches?.map((x: any) => ({ source: x.source, targetId: x.targetId })))}`,
    );
  }

  // 5. B2 thread-parent：直插 agent 评论 → member 回复 → 唤醒父作者
  {
    const agentCommentId = randomUUID();
    db.prepare(
      `insert into comment (id, issue_id, type, author_type, author_id, body, created_at)
       values (?, ?, 'comment', 'agent', 'agt-research', ?, ?)`,
    ).run(agentCommentId, fri09, `e2e agent parent ${Date.now()}`, Date.now());
    const { dispatches } = await postComment(fri09, `e2e B2 reply ${Date.now()}`, agentCommentId);
    const d = dispatches?.[0];
    record(
      'B2-thread-parent',
      d?.source === 'thread-parent' && d?.kind === 'agent' && d?.targetId === 'agt-research' && !!d?.runId,
      `source=${d?.source} target=${d?.targetId} runId=${d?.runId ?? 'null'}（parent 作者=agt-research；issue assignee=agt-prd，未叠加）`,
    );
  }

  // 汇总
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n==== e2e-comment-routing: ${pass} PASS / ${fail} FAIL / ${results.length} total ====`);
  const logPath = join(LOG_DIR, 'e2e-comment-routing.log');
  try {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(logPath, `${new Date().toISOString()}\n${results.map((r) => `[${r.status}] ${r.id} — ${r.note}`).join('\n')}\n`);
    console.log(`log → ${logPath}`);
  } catch {
    // 日志目录不可写不阻塞结论
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('e2e crash:', e);
  process.exit(1);
});
