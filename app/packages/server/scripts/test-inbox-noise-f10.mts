/**
 * F10：issue 成功不进 Inbox；chat 失败进 Inbox；QC 成功仍进
 */
import { eq } from 'drizzle-orm';
import type { AgentRun } from '@ma/shared';
import { db } from '../src/db/client.js';
import { agents, agentRuns, inboxItems, issues } from '../src/db/schema.js';
import { notifyRunTerminal } from '../src/orchestration/inbox-writer.js';
import { LOCAL_MEMBER } from '../src/local-member.js';
import { toAgentRun } from '../src/db/reshape.js';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function countInbox(): number {
  return db
    .select()
    .from(inboxItems)
    .where(eq(inboxItems.recipientId, LOCAL_MEMBER.id))
    .all().length;
}

function baseRun(partial: Partial<AgentRun> & Pick<AgentRun, 'id' | 'kind' | 'status'>): AgentRun {
  const agent = db.select().from(agents).all()[0]!;
  return {
    id: partial.id,
    issueId: partial.issueId ?? null,
    agentId: agent.id,
    runtime: agent.runtime as AgentRun['runtime'],
    status: partial.status,
    kind: partial.kind,
    quickPrompt: partial.quickPrompt ?? null,
    chatThreadId: partial.chatThreadId ?? null,
    error: partial.error ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    lastHeartbeatAt: null,
    isLeader: false,
    squadId: null,
    rerunOfRunId: null,
    createdAt: new Date().toISOString(),
  };
}

delete process.env.MA_INBOX_NOTIFY_SUCCESS;

const before = countInbox();

// 1) issue completed → no new
const issueOkId = crypto.randomUUID();
notifyRunTerminal(
  baseRun({
    id: issueOkId,
    kind: 'issue',
    status: 'completed',
    issueId: null, // no issueId path for pure kind - wait need issue for issue path
  }),
);
// without issueId and kind issue - falls through without notify (no qc). OK
assert(countInbox() === before, 'bare issue completed no issueId should not notify');

// 2) chat failed → yes（落库 run 行，供 Inbox 恢复 CTA GET /runs/:id）
const chatFailId = crypto.randomUUID();
const threadId = crypto.randomUUID();
const agent = db.select().from(agents).all()[0]!;
const now = Date.now();
db.insert(agentRuns)
  .values({
    id: chatFailId,
    issueId: null,
    agentId: agent.id,
    runtime: agent.runtime,
    status: 'failed',
    kind: 'chat',
    quickPrompt: 'f10',
    chatThreadId: threadId,
    error: 'F10 chat fail test',
    startedAt: now,
    finishedAt: now,
    lastHeartbeatAt: now,
    isLeader: 0,
    squadId: null,
    rerunOfRunId: null,
    createdAt: now,
  })
  .run();
const chatRunRow = db.select().from(agentRuns).where(eq(agentRuns.id, chatFailId)).get()!;
notifyRunTerminal(toAgentRun(chatRunRow));
const afterChat = countInbox();
assert(afterChat === before + 1, `chat fail should +1 got ${afterChat - before}`);
const chatItem = db
  .select()
  .from(inboxItems)
  .where(eq(inboxItems.dedupeKey, `run:${chatFailId}:failed`))
  .get();
assert(chatItem, 'chat inbox row');
assert(chatItem.title.includes('聊天失败'), chatItem.title);
assert(chatItem.severity === 'action_required', chatItem.severity);
console.log('PASS chat failed → inbox', chatItem.title);

// 3) chat completed → no
const chatOkId = crypto.randomUUID();
const mid = countInbox();
notifyRunTerminal(
  baseRun({
    id: chatOkId,
    kind: 'chat',
    status: 'completed',
    chatThreadId: threadId,
  }),
);
assert(countInbox() === mid, 'chat completed should not notify');
console.log('PASS chat completed silent');

// 4) QC completed no issue → yes
const qcId = crypto.randomUUID();
notifyRunTerminal(
  baseRun({
    id: qcId,
    kind: 'quick_create',
    status: 'completed',
    issueId: null,
  }),
);
const afterQc = countInbox();
assert(afterQc === mid + 1, 'qc completed should notify');
console.log('PASS QC completed → inbox');

// 5) issue completed with issueId — need real issue in DB or skip
const issue = db.select().from(issues).all()[0];
if (issue) {
  const mid2 = countInbox();
  const runId = crypto.randomUUID();
  notifyRunTerminal(
    baseRun({
      id: runId,
      kind: 'issue',
      status: 'completed',
      issueId: issue.id,
    }),
  );
  assert(countInbox() === mid2, 'issue completed should be silent by default');
  console.log('PASS issue completed silent');

  const failId = crypto.randomUUID();
  notifyRunTerminal(
    baseRun({
      id: failId,
      kind: 'issue',
      status: 'failed',
      issueId: issue.id,
      error: 'F10 issue fail',
    }),
  );
  assert(countInbox() === mid2 + 1, 'issue failed should notify');
  console.log('PASS issue failed → inbox');
}

console.log('ALL PASS');
process.exit(0);
