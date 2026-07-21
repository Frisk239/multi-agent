/**
 * 强制 MA_ISSUE_USE_WORKSPACE_CWD + 无效路径 → cwd_missing 硬闸
 */
process.env.MA_ISSUE_USE_WORKSPACE_CWD = '1';
process.env.MA_WORKSPACE_CWD = 'D:/path/that/does/not/exist-slice2-gate';
delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;

// workspace-cwd 可能缓存 env — 必须在 import 前设 env（本文件顶部已设）
const { createIssueCore } = await import('../src/orchestration/issue-create.js');
const { db } = await import('../src/db/client.js');
const { agents, agentRuns } = await import('../src/db/schema.js');
const { eq } = await import('drizzle-orm');

const agent = db.select().from(agents).all()[0];
if (!agent) throw new Error('no agent');

const r = await createIssueCore({
  title: `[slice2-cwd-gate] ${Date.now()}`,
  assignee: { type: 'agent', id: agent.id },
  enqueue: true,
});
if (!r.ok) throw new Error(r.error);
console.log('enqueue', r.enqueue);

if (r.enqueue.status !== 'skipped' || r.enqueue.reason !== 'cwd_missing') {
  throw new Error(`expected cwd_missing skipped, got ${JSON.stringify(r.enqueue)}`);
}
const runs = db.select().from(agentRuns).where(eq(agentRuns.issueId, r.issue.id)).all();
if (runs.length !== 0) throw new Error(`expected 0 runs, got ${runs.length}`);
console.log('PASS cwd_missing hard gate');
process.exit(0);
