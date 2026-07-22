/**
 * DS1：session prior / poison / finalize / reshape
 * Run: pnpm exec tsx scripts/test-ds1-session-resume.mts  (from packages/server)
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';

const scratch = join(tmpdir(), `ma-ds1-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
process.env.DB_PATH = join(scratch, 'ds1.db');

const { db, sqlite } = await import('../src/db/client.js');
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
migrate(db, { migrationsFolder });

const { agents, agentRuns, workspaces, issues } = await import('../src/db/schema.js');
const {
  resolvePriorSession,
  finalizeSessionFields,
  isSessionPoisonText,
} = await import('../src/runtime/session-resume.js');
const { formatChatHistoryBlock, loadPriorChatMessages } = await import(
  '../src/runtime/prompt.js'
);
const { toAgentRun } = await import('../src/db/reshape.js');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// —— poison 启发式 ——
{
  assert(isSessionPoisonText('Error: prompt is too long'), 'poison too long');
  assert(isSessionPoisonText('invalid_request_error: bad'), 'poison invalid_request');
  assert(isSessionPoisonText('No conversation found with session ID: x'), 'poison no conv');
  assert(!isSessionPoisonText('exit 1: network timeout'), 'not poison network');
  console.log('PASS poison heuristics');
}

// —— finalize ——
{
  const ok = finalizeSessionFields({
    planned: {
      resumeSessionId: 'sess-a',
      status: 'resumed',
      reason: 'test',
      sourceRunId: 'r0',
    },
    emittedSessionId: 'sess-a',
    exitReason: 'completed',
  });
  assert(ok.providerSessionId === 'sess-a', 'provider id');
  assert(ok.sessionResumeStatus === 'resumed', 'status resumed');
  assert(ok.sessionPoisoned === 0, 'not poisoned');
  console.log('PASS finalize resumed ok');

  const miss = finalizeSessionFields({
    planned: {
      resumeSessionId: 'sess-old',
      status: 'resumed',
      reason: 'test',
      sourceRunId: 'r0',
    },
    emittedSessionId: 'sess-new',
    exitReason: 'failed',
    errorText: 'boom',
  });
  assert(miss.providerSessionId == null, 'miss no provider id');
  assert(miss.sessionResumeStatus === 'resume_miss', `miss ${miss.sessionResumeStatus}`);
  console.log('PASS finalize resume_miss');

  const poison = finalizeSessionFields({
    planned: {
      resumeSessionId: 'sess-p',
      status: 'resumed',
      reason: 'test',
      sourceRunId: 'r0',
    },
    emittedSessionId: 'sess-p',
    exitReason: 'failed',
    errorText: 'context overflow in request',
  });
  assert(poison.sessionPoisoned === 1, 'poisoned');
  console.log('PASS finalize poison');
}

const now = Date.now();
const WS = 'ws-ds1';
db.insert(workspaces)
  .values({ id: WS, name: 'ds1', description: null, rootPath: null, createdAt: now })
  .run();

const agentId = 'ag-ds1-claude';
db.insert(agents)
  .values({
    id: agentId,
    name: 'Claude DS1',
    category: null,
    runtime: 'claude-code',
    model: null,
    thinkingLevel: null,
    concurrency: 1,
    mcpServers: null,
    instructions: '',
    archivedAt: null,
    createdAt: now,
  })
  .run();

const issueId = 'iss-ds1';
db.insert(issues)
  .values({
    id: issueId,
    workspaceId: WS,
    identifier: 'DS1-1',
    title: 'DS1 issue',
    description: null,
    status: 'todo',
    priority: 'none',
    assigneeType: 'agent',
    assigneeId: agentId,
    creatorType: 'member',
    creatorId: 'local',
    position: 0,
    originType: null,
    originRunId: null,
    originRuleId: null,
    parentIssueId: null,
    projectId: null,
    prUrl: null,
    createdAt: now,
    updatedAt: now,
  })
  .run();

const baseRun = {
  issueId,
  agentId,
  runtime: 'claude-code' as const,
  kind: 'issue' as const,
  quickPrompt: null,
  chatThreadId: null,
  isLeader: 0,
  squadId: null,
  error: null,
  startedAt: now,
  finishedAt: now + 1,
  lastHeartbeatAt: now,
  rerunOfRunId: null,
  cwdPath: null,
  cwdMode: null,
  projectId: null,
  tokensInput: null,
  tokensOutput: null,
  tokensCacheRead: null,
  tokensCacheWrite: null,
  providerSessionId: null as string | null,
  resumedSessionId: null as string | null,
  sessionResumeStatus: null as string | null,
  sessionPoisoned: 0,
};

db.insert(agentRuns)
  .values({
    ...baseRun,
    id: 'run-prior',
    status: 'completed',
    providerSessionId: 'sess-prior-1',
    sessionResumeStatus: 'fresh',
    createdAt: now - 1000,
  })
  .run();

db.insert(agentRuns)
  .values({
    ...baseRun,
    id: 'run-next',
    status: 'queued',
    finishedAt: null,
    startedAt: null,
    createdAt: now,
  })
  .run();

{
  const d = resolvePriorSession({
    id: 'run-next',
    runtime: 'claude-code',
    agentId,
    issueId,
    kind: 'issue',
    rerunOfRunId: null,
  });
  assert(d.resumeSessionId === 'sess-prior-1', `prior ${d.resumeSessionId}`);
  assert(d.status === 'resumed', d.status);
  console.log('PASS prior from recent issue run');
}

db.insert(agentRuns)
  .values({
    ...baseRun,
    id: 'run-poison',
    status: 'failed',
    providerSessionId: 'sess-dead',
    sessionPoisoned: 1,
    error: 'prompt is too long',
    createdAt: now - 200,
  })
  .run();

{
  const dPoison = resolvePriorSession({
    id: 'run-rerun-p',
    runtime: 'claude-code',
    agentId,
    issueId,
    kind: 'issue',
    rerunOfRunId: 'run-poison',
  });
  assert(dPoison.resumeSessionId == null, 'no resume when poisoned');
  assert(dPoison.status === 'poison_fresh', dPoison.status);
  console.log('PASS prior poison_fresh from source');
}

{
  const dUn = resolvePriorSession({
    id: 'run-cursor',
    runtime: 'cursor',
    agentId,
    issueId,
    kind: 'issue',
  });
  assert(dUn.status === 'unsupported', dUn.status);
  assert(dUn.resumeSessionId == null, 'cursor no resume');
  console.log('PASS unsupported cursor');
}

{
  const priorRow = db.select().from(agentRuns).where(eq(agentRuns.id, 'run-prior')).get()!;
  db.update(agentRuns)
    .set({ sessionResumeStatus: 'resumed', resumedSessionId: null })
    .where(eq(agentRuns.id, 'run-prior'))
    .run();
  const priorRow2 = db.select().from(agentRuns).where(eq(agentRuns.id, 'run-prior')).get()!;
  const api = toAgentRun(priorRow2);
  assert(api.providerSessionId === 'sess-prior-1', 'reshape provider');
  assert(api.sessionPoisoned === false, 'reshape poison false');
  assert(api.sessionResumeStatus === 'resumed', 'reshape status');
  // silence unused
  void priorRow;
  console.log('PASS reshape session fields');
}

{
  const block = formatChatHistoryBlock([
    { role: 'user', body: 'hi' },
    { role: 'assistant', body: 'yo' },
  ]);
  assert(block?.includes('会话历史'), 'history block');
  assert(formatChatHistoryBlock([]) == null, 'empty history');
  const empty = loadPriorChatMessages('no-thread', 'no-run', 5);
  assert(Array.isArray(empty) && empty.length === 0, 'empty prior');
  console.log('PASS chat history helpers');
}

sqlite.close();
try {
  rmSync(scratch, { recursive: true, force: true });
} catch {
  /* ignore */
}
console.log('ALL PASS DS1 session resume');
