/**
 * Slice3：retryRun 对 chat 拒绝且文案不含「快速派活」
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { agentRuns, agents, chatThreads } from '../src/db/schema.js';
import { retryRun, cancelRunById } from '../src/orchestration/run-service.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const agent = db.select().from(agents).all()[0];
  assert(agent, 'need agent');

  let thread = db.select().from(chatThreads).all()[0];
  if (!thread) {
    const id = crypto.randomUUID();
    const now = Date.now();
    db.insert(chatThreads)
      .values({
        id,
        agentId: agent.id,
        title: 'slice3-test',
        pinned: 0,
        archived: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    thread = db.select().from(chatThreads).where(eq(chatThreads.id, id)).get()!;
  }

  const runId = crypto.randomUUID();
  const now = Date.now();
  db.insert(agentRuns)
    .values({
      id: runId,
      issueId: null,
      agentId: agent.id,
      runtime: agent.runtime,
      status: 'failed',
      kind: 'chat',
      quickPrompt: 'hello slice3',
      chatThreadId: thread.id,
      error: 'test fail',
      startedAt: now,
      finishedAt: now,
      isLeader: 0,
      squadId: null,
      rerunOfRunId: null,
      createdAt: now,
    })
    .run();

  const res = await retryRun(runId);
  assert(!res.ok, 'chat retry should fail');
  assert(res.status === 400, `status ${res.status}`);
  assert(!res.ok && res.error.includes('会话'), `error: ${!res.ok ? res.error : ''}`);
  assert(!res.ok && !res.error.includes('快速派活'), 'must not say 快速派活 for chat');
  console.log('PASS chat retry rejected:', !res.ok ? res.error : '');

  // cleanup
  db.delete(agentRuns).where(eq(agentRuns.id, runId)).run();
  console.log('ALL PASS');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
