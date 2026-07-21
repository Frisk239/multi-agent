/**
 * Slice 1 gating tests — exercises shipped helpers (not re-implemented stubs).
 * Run: pnpm exec tsx scripts/test-chat-slice1.mts  (from packages/server)
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const scratchRoot =
  process.env.MA_TEST_SCRATCH?.trim() ||
  join(tmpdir(), `ma-chat-slice1-${Date.now()}`);
mkdirSync(scratchRoot, { recursive: true });
// unique subdir each run so re-runs don't hit UNIQUE on seed rows
const scratch = join(scratchRoot, `run-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
const dbPath = join(scratch, 'test.db');
process.env.DB_PATH = dbPath;
delete process.env.MA_CHAT_USE_WORKSPACE_CWD;
delete process.env.MA_CHAT_HISTORY_LIMIT;

const logLines: string[] = [];
function log(s: string) {
  console.log(s);
  logLines.push(s);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

// —— pure unit: formatChatHistoryBlock (shipped) ——
const { formatChatHistoryBlock, chatHistoryLimit, loadPriorChatMessages, resolveRunPrompt } =
  await import('../src/runtime/prompt.js');
const { resolveRunCwd, resolveChatExecContext, chatScratchWorkDir } = await import(
  '../src/runtime/resolve-run-cwd.js'
);
const { db, sqlite } = await import('../src/db/client.js');
const { agents, chatThreads, chatMessages, agentRuns } = await import('../src/db/schema.js');

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
migrate(db, { migrationsFolder });

const NOW = Date.now();
const agentId = 'agt-test-chat';
const threadId = 'thread-multi-1';
const run1 = 'run-turn-1';
const run2 = 'run-turn-2';

db.insert(agents)
  .values({
    id: agentId,
    name: '测试助手',
    category: 'test',
    runtime: 'opencode',
    model: null,
    concurrency: 1,
    createdAt: NOW,
  })
  .run();

db.insert(chatThreads)
  .values({
    id: threadId,
    agentId,
    title: '多轮测试',
    createdAt: NOW,
    updatedAt: NOW,
    pinnedAt: null,
    archivedAt: null,
  })
  .run();

// turn 1: user + assistant
db.insert(chatMessages)
  .values([
    {
      id: 'msg-u1',
      threadId,
      role: 'user',
      body: '第一轮用户：请记住代号 ALPHA-42',
      runId: run1,
      createdAt: NOW,
    },
    {
      id: 'msg-a1',
      threadId,
      role: 'assistant',
      body: '好的，我记住了代号 ALPHA-42。',
      runId: run1,
      createdAt: NOW + 1,
    },
  ])
  .run();

// turn 2 user (current run) — already in DB before resolveRunPrompt
db.insert(chatMessages)
  .values({
    id: 'msg-u2',
    threadId,
    role: 'user',
    body: '第二轮：我刚才说的代号是什么？',
    runId: run2,
    createdAt: NOW + 2,
  })
  .run();

db.insert(agentRuns)
  .values({
    id: run2,
    issueId: null,
    agentId,
    runtime: 'opencode',
    status: 'queued',
    kind: 'chat',
    quickPrompt: '第二轮：我刚才说的代号是什么？',
    chatThreadId: threadId,
    isLeader: 0,
    squadId: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    lastHeartbeatAt: null,
    createdAt: NOW + 2,
  })
  .run();

// 1) pure format
const formatted = formatChatHistoryBlock([
  { role: 'user', body: 'hello' },
  { role: 'assistant', body: 'hi' },
]);
assert(formatted && formatted.includes('[用户]') && formatted.includes('hello'), 'format has user');
assert(formatted!.includes('[助手]') && formatted!.includes('hi'), 'format has assistant');
assert(formatChatHistoryBlock([]) === null, 'empty history null');
log('PASS formatChatHistoryBlock');

// 2) loadPrior + resolveRunPrompt multi-turn
const prior = loadPriorChatMessages(threadId, run2, chatHistoryLimit());
assert(prior.length === 2, `prior len want 2 got ${prior.length}`);
assert(
  prior.some((m) => m.body.includes('ALPHA-42') && m.role === 'user'),
  'prior has turn1 user',
);
assert(
  prior.some((m) => m.body.includes('ALPHA-42') && m.role === 'assistant'),
  'prior has turn1 assistant',
);
assert(!prior.some((m) => m.body.includes('第二轮')), 'prior excludes current user');

const { eq } = await import('drizzle-orm');
const runRow = db.select().from(agentRuns).where(eq(agentRuns.id, run2)).get()!;
const prompt = await resolveRunPrompt(runRow);
assert(prompt, 'prompt non-null');
assert(prompt!.includes('ALPHA-42'), 'prompt contains prior user content ALPHA-42');
assert(prompt!.includes('第二轮：我刚才说的代号是什么？'), 'prompt contains latest user text');
assert(prompt!.includes('会话历史'), 'prompt has history section');
assert(prompt!.includes('当前用户消息'), 'prompt has current section');
log('PASS multi-turn resolveRunPrompt');
log(`PROMPT_SNIPPET=${prompt!.slice(0, 400).replace(/\n/g, ' | ')}`);

// 3) cwd default isolation
delete process.env.MA_CHAT_USE_WORKSPACE_CWD;
const cwdIso = resolveRunCwd({ kind: 'chat', runId: run2, chatThreadId: threadId });
assert(cwdIso.mode === 'chat_scratch', `mode want chat_scratch got ${cwdIso.mode}`);
assert(cwdIso.path && cwdIso.path.includes('chat-sessions'), `path has chat-sessions: ${cwdIso.path}`);
assert(cwdIso.exists, 'cwd exists');
const ctx = resolveChatExecContext(threadId);
assert(ctx.mode === 'chat_scratch', 'execContext isolation');
assert(ctx.modeLabel === '隔离', 'modeLabel 隔离');
assert(ctx.path && ctx.path.includes('chat-sessions'), 'exec path chat-sessions');
const expectedScratch = chatScratchWorkDir(threadId, run2);
assert(ctx.path === expectedScratch || ctx.path?.includes(threadId.replace(/[^a-zA-Z0-9._-]/g, '_')), 'path matches thread');
log('PASS chat cwd isolation mode');
log(`CWD_ISO=${cwdIso.path}`);

// 4) workspace opt-in
process.env.MA_CHAT_USE_WORKSPACE_CWD = '1';
process.env.MA_WORKSPACE_CWD = scratch; // known existing dir
const cwdWs = resolveRunCwd({ kind: 'chat', runId: run2, chatThreadId: threadId });
assert(cwdWs.mode === 'workspace', `opt-in mode workspace got ${cwdWs.mode}`);
const ctxWs = resolveChatExecContext(threadId);
assert(ctxWs.mode === 'workspace', 'execContext workspace');
assert(ctxWs.modeLabel === '工作区', 'modeLabel 工作区');
log('PASS chat cwd workspace opt-in');
log(`CWD_WS=${cwdWs.path}`);
delete process.env.MA_CHAT_USE_WORKSPACE_CWD;

// classify timeout (shared shipped)
const { classifyRunFailure } = await import('@ma/shared');
const to = classifyRunFailure('timeout: CLI exceeded 900000ms');
assert(to.title.includes('超时'), `timeout title: ${to.title}`);
log('PASS classifyRunFailure timeout');

// static UI source checks (DOM contracts)
const chatPagePath = fileURLToPath(
  new URL('../../web/components/ChatPage.tsx', import.meta.url),
);
const { readFileSync } = await import('node:fs');
const chatSrc = readFileSync(chatPagePath, 'utf8');
assert(!chatSrc.includes('了解工作区里的 issue'), 'empty copy no longer implies workspace issues');
assert(chatSrc.includes('chat-fail-resend'), 'resend control present');
assert(chatSrc.includes('chat-exec-context'), 'cwd header testid');
assert(chatSrc.includes('chat-empty-copy'), 'empty copy testid');
assert(chatSrc.includes('一对一聊天'), 'honest empty copy');
log('PASS ChatPage static DOM contracts');

sqlite.close();

const outLog =
  process.env.MA_TEST_LOG || join(scratch, 'chat-slice1-all.log');
writeFileSync(outLog, logLines.join('\n') + '\n', 'utf8');
log(`WROTE ${outLog}`);
log('ALL PASS');
process.exit(0);
