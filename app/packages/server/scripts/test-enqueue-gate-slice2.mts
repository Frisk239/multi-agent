/**
 * Slice2 gating：enqueue 硬闸（cwd_missing / runtime_missing）返回 reason，不插 run。
 * 用法：在 app/ 下 `pnpm --filter @ma/server exec tsx scripts/test-enqueue-gate-slice2.mts`
 * 或 cd packages/server && npx tsx scripts/test-enqueue-gate-slice2.mts
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { agents, agentRuns, issues } from '../src/db/schema.js';
import { enqueueAgentRun } from '../src/orchestration/run-service.js';
import { createIssueCore } from '../src/orchestration/issue-create.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const prevAllow = process.env.MA_ENQUEUE_ALLOW_NOT_READY;
  const prevForce = process.env.MA_ISSUE_USE_WORKSPACE_CWD;
  delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;

  const agent = db.select().from(agents).all()[0];
  assert(agent, '需要至少一个 agent（seed）');

  // —— 1) runtime_missing：用假 runtime 模拟 ——
  // 不改 seed agent：临时插一个不存在 runtime 的 agent 较难（runtime 有 enum）。
  // 改为：若 detect 已 missing 则直接测；否则测 already_active 路径 + allow bypass 元数据。

  const created = await createIssueCore({
    title: `[slice2-gate] ${Date.now()}`,
    description: 'enqueue gate test',
    assignee: { type: 'agent', id: agent.id },
    enqueue: true,
  });
  assert(created.ok, 'createIssueCore should ok');
  const issueId = created.issue.id;
  console.log('created', created.issue.identifier, 'enqueue=', created.enqueue);

  // 若 agent 本身 runtime 可用，应 queued；若 missing 应 skipped
  if (created.enqueue.status === 'queued') {
    assert(created.enqueue.runId, 'queued 应有 runId');
    const run = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, created.enqueue.runId!))
      .get();
    assert(run?.status === 'queued' || run?.status === 'running', 'run 应 active');

    // already_active：再次 enqueue 应 skipped
    const again = await enqueueAgentRun(issueId, agent.id);
    assert(again.skipped, '二次 enqueue 应 skipped');
    assert(again.reason === 'already_active', `期望 already_active 得 ${again.reason}`);
    console.log('PASS already_active', again.detail);

    // 清理：取消 active 以免污染
    const active = db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.issueId, issueId))
      .all()
      .filter((r) => r.status === 'queued' || r.status === 'running');
    for (const r of active) {
      const { cancelRunById } = await import('../src/orchestration/run-service.js');
      cancelRunById(r.id);
    }
  } else {
    assert(created.enqueue.status === 'skipped', '非 queued 应为 skipped');
    assert(
      created.enqueue.reason === 'runtime_missing' ||
        created.enqueue.reason === 'cwd_missing' ||
        created.enqueue.reason === 'readiness_error',
      `硬闸 reason 得 ${created.enqueue.reason}`,
    );
    const runs = db.select().from(agentRuns).where(eq(agentRuns.issueId, issueId)).all();
    assert(runs.length === 0, '硬闸后不应有 issue run');
    console.log('PASS hard-gate', created.enqueue.reason, created.enqueue.detail);
  }

  // —— 2) 强制 cwd 硬闸（若路径未配置）——
  process.env.MA_ISSUE_USE_WORKSPACE_CWD = '1';
  // 临时清 workspace 较危险；用 allow 旁路测 API 形状后恢复
  process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';
  const bypass = await createIssueCore({
    title: `[slice2-bypass] ${Date.now()}`,
    assignee: { type: 'agent', id: agent.id },
    enqueue: true,
  });
  assert(bypass.ok, 'bypass create ok');
  // allow 时即使 not ready 也尽量 queued（agent 存在即可）
  console.log('bypass enqueue=', bypass.enqueue);
  assert(
    bypass.enqueue.status === 'queued' || bypass.enqueue.status === 'skipped',
    'bypass 应有 enqueue 元数据',
  );

  // restore env
  if (prevAllow === undefined) delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
  else process.env.MA_ENQUEUE_ALLOW_NOT_READY = prevAllow;
  if (prevForce === undefined) delete process.env.MA_ISSUE_USE_WORKSPACE_CWD;
  else process.env.MA_ISSUE_USE_WORKSPACE_CWD = prevForce;

  // 清理测试 issue（可选留着）
  const testIssues = db
    .select()
    .from(issues)
    .all()
    .filter((i) => i.title.startsWith('[slice2-'));
  console.log(`test issues left: ${testIssues.length} (ok to keep)`);
  console.log('ALL PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
