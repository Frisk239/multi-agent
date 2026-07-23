/**
 * Slice A test script — CLI Session Resume & Burst Merging validation
 * Run: pnpm exec tsx scripts/test-burst-resume.mts (from packages/server)
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { and, eq } from 'drizzle-orm';
import Fastify from 'fastify';

const scratchRoot =
  process.env.MA_TEST_SCRATCH?.trim() ||
  join(tmpdir(), `ma-chat-burst-${Date.now()}`);
mkdirSync(scratchRoot, { recursive: true });
const scratch = join(scratchRoot, `run-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
const dbPath = join(scratch, 'test.db');
process.env.DB_PATH = dbPath;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

const {
  getTrailingUserMessages,
  formatTrailingUserText,
  resolveRunPrompt,
} = await import('../src/runtime/prompt.js');
const { resolvePriorSession } = await import('../src/runtime/session-resume.ts');
const { chatRoutes } = await import('../src/routes/chat.js');
const { db, sqlite } = await import('../src/db/client.js');
const { agents, chatThreads, chatMessages, agentRuns } = await import('../src/db/schema.js');

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
migrate(db, { migrationsFolder });

console.log('--- 1. Testing getTrailingUserMessages & formatTrailingUserText ---');

const NOW = Date.now();
const agentId = 'agt-burst-test';
const threadId = 'thread-burst-1';

db.insert(agents)
  .values({
    id: agentId,
    name: 'Burst Agent',
    category: 'test',
    runtime: 'claude-code',
    model: null,
    concurrency: 1,
    createdAt: NOW,
  })
  .run();

db.insert(chatThreads)
  .values({
    id: threadId,
    agentId,
    title: 'Burst Thread',
    createdAt: NOW,
    updatedAt: NOW,
    pinnedAt: null,
    archivedAt: null,
    lastSessionId: null,
  })
  .run();

// Seed previous turn
db.insert(chatMessages)
  .values([
    {
      id: 'msg-u0',
      threadId,
      role: 'user',
      body: 'turn 0 user',
      runId: 'run-0',
      createdAt: NOW,
    },
    {
      id: 'msg-a0',
      threadId,
      role: 'assistant',
      body: 'turn 0 assistant response',
      runId: 'run-0',
      createdAt: NOW + 1,
    },
    {
      id: 'msg-u1',
      threadId,
      role: 'user',
      body: 'First burst message',
      runId: null,
      createdAt: NOW + 2,
    },
    {
      id: 'msg-u2',
      threadId,
      role: 'user',
      body: 'Second burst message',
      runId: null,
      createdAt: NOW + 3,
    },
  ])
  .run();

const trailingMsgs = getTrailingUserMessages(threadId);
assert(trailingMsgs.length === 2, `expected 2 trailing msgs, got ${trailingMsgs.length}`);
assert(trailingMsgs[0].body === 'First burst message', 'trailing msg 0 matches');
assert(trailingMsgs[1].body === 'Second burst message', 'trailing msg 1 matches');

const formattedText = formatTrailingUserText(threadId);
assert(
  formattedText === 'First burst message\n\nSecond burst message',
  `formatted text mismatch: "${formattedText}"`,
);
console.log('PASS getTrailingUserMessages & formatTrailingUserText');

console.log('--- 2. Testing resolveRunPrompt with trailing messages ---');

const dummyRun = {
  id: 'run-test-burst',
  issueId: null,
  agentId,
  runtime: 'claude-code' as const,
  status: 'queued' as const,
  kind: 'chat' as const,
  quickPrompt: 'Quick prompt placeholder',
  chatThreadId: threadId,
  isLeader: 0,
  squadId: null,
  error: null,
  startedAt: null,
  finishedAt: null,
  lastHeartbeatAt: null,
  rerunOfRunId: null,
  cwdPath: null,
  cwdMode: null,
  projectId: null,
  tokensInput: null,
  tokensOutput: null,
  tokensCacheRead: null,
  tokensCacheWrite: null,
  providerSessionId: null,
  resumedSessionId: null,
  sessionResumeStatus: null,
  sessionPoisoned: 0,
  model: null,
  thinkingLevel: null,
  createdAt: NOW + 4,
};

const resolvedPrompt = await resolveRunPrompt(dummyRun);
assert(resolvedPrompt !== null, 'prompt resolved');
assert(resolvedPrompt.includes('First burst message\n\nSecond burst message'), 'prompt includes burst trailing text');
console.log('PASS resolveRunPrompt with burst text');

console.log('--- 3. Testing POST /api/chat/threads/:id/messages Enqueue 防重与 Burst 打包 ---');

const app = Fastify();
await app.register(chatRoutes);

const burstThreadId = 'thread-burst-2';
db.insert(chatThreads)
  .values({
    id: burstThreadId,
    agentId,
    title: 'Burst Route Thread',
    createdAt: NOW,
    updatedAt: NOW,
    pinnedAt: null,
    archivedAt: null,
    lastSessionId: null,
  })
  .run();

// Set agent concurrency to 1 and occupy the slot with a running run so new runs stay queued
db.insert(agentRuns)
  .values({
    id: 'run-occupying-slot',
    issueId: null,
    agentId,
    runtime: 'claude-code',
    status: 'running',
    kind: 'chat',
    quickPrompt: 'running prompt',
    chatThreadId: burstThreadId,
    isLeader: 0,
    squadId: null,
    error: null,
    startedAt: NOW,
    finishedAt: null,
    lastHeartbeatAt: NOW,
    createdAt: NOW,
  })
  .run();

// Send msg 1 -> creates queued run (cannot start because slot is occupied)
const res1 = await app.inject({
  method: 'POST',
  url: `/api/chat/threads/${burstThreadId}/messages`,
  payload: { body: 'Message 1' },
});
assert(res1.statusCode === 201, `res1 status ${res1.statusCode}`);
const body1 = res1.json();
const run1Id = body1.run.id;
assert(body1.run.quickPrompt === 'Message 1', `run1 prompt: ${body1.run.quickPrompt}`);
assert(body1.run.status === 'queued', `run1 status should be queued, got ${body1.run.status}`);

// Send msg 2 immediately (burst while run1 is queued)
const res2 = await app.inject({
  method: 'POST',
  url: `/api/chat/threads/${burstThreadId}/messages`,
  payload: { body: 'Message 2' },
});
assert(res2.statusCode === 201, `res2 status ${res2.statusCode}`);
const body2 = res2.json();
assert(body2.run.id === run1Id, `res2 should re-use queued run ${run1Id}, got ${body2.run.id}`);
assert(
  body2.run.quickPrompt === 'Message 1\n\nMessage 2',
  `run prompt updated: ${body2.run.quickPrompt}`,
);

// Send msg 3 (burst while run1 is queued)
const res3 = await app.inject({
  method: 'POST',
  url: `/api/chat/threads/${burstThreadId}/messages`,
  payload: { body: 'Message 3' },
});
const body3 = res3.json();
assert(body3.run.id === run1Id, 'res3 re-uses run1Id');
assert(
  body3.run.quickPrompt === 'Message 1\n\nMessage 2\n\nMessage 3',
  `run prompt updated 3: ${body3.run.quickPrompt}`,
);

// Verify total queued runs created in DB for burstThreadId is only 1
const queuedRunsForThread = db
  .select()
  .from(agentRuns)
  .where(and(eq(agentRuns.chatThreadId, burstThreadId), eq(agentRuns.status, 'queued')))
  .all();
assert(queuedRunsForThread.length === 1, `expected 1 queued run in DB, found ${queuedRunsForThread.length}`);
console.log('PASS POST /api/chat/threads/:id/messages Enqueue防重 & Burst打包');

console.log('--- 4. Testing Session ID 记锁与 Session Resume 备用查询 ---');

// Set lastSessionId on thread
const testSessionId = 'claude-session-999';
db.update(chatThreads)
  .set({ lastSessionId: testSessionId })
  .where(eq(chatThreads.id, burstThreadId))
  .run();

const threadRow = db
  .select()
  .from(chatThreads)
  .where(eq(chatThreads.id, burstThreadId))
  .get();
assert(threadRow?.lastSessionId === testSessionId, 'lastSessionId stored on thread');

// Test resolvePriorSession fallback
const newRunForResume = {
  id: 'run-resume-test',
  runtime: 'claude-code',
  agentId,
  chatThreadId: burstThreadId,
  kind: 'chat',
};

const priorDecision = resolvePriorSession(newRunForResume);
assert(priorDecision.resumeSessionId === testSessionId, `resumeSessionId expected ${testSessionId}, got ${priorDecision.resumeSessionId}`);
assert(priorDecision.status === 'resumed', `status expected resumed, got ${priorDecision.status}`);
console.log('PASS Session ID 记锁与 Session Resume 备用查询');

sqlite.close();
console.log('ALL TESTS PASSED SUCCESSFULLY!');
process.exit(0);
