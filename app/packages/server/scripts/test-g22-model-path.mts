/**
 * G22 residual honesty：run model/thinking 快照 + grok print --effort
 * Run: pnpm exec tsx scripts/test-g22-model-path.mts  (from packages/server)
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';

const scratch = join(tmpdir(), `ma-g22-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
process.env.DB_PATH = join(scratch, 'g22.db');

const { db, sqlite } = await import('../src/db/client.js');
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
migrate(db, { migrationsFolder });

const { agents, agentRuns, workspaces } = await import('../src/db/schema.js');
const { toAgentRun } = await import('../src/db/reshape.js');
const { buildGrokAgentArgs } = await import('../src/runtime/grok.js');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const WS = 'ws-local';
const now = Date.now();
if (db.select().from(workspaces).all().length === 0) {
  db.insert(workspaces)
    .values({
      id: WS,
      name: 'local',
      description: null,
      rootPath: scratch,
      createdAt: now,
    })
    .run();
}

db.insert(agents)
  .values({
    id: 'agent-g22',
    name: 'G22 Bot',
    category: null,
    runtime: 'grok',
    model: 'grok-4.5',
    thinkingLevel: 'high',
    concurrency: 1,
    mcpServers: null,
    instructions: '',
    archivedAt: null,
    createdAt: now,
  })
  .run();

// 1) insert run with snapshot columns → reshape
db.insert(agentRuns)
  .values({
    id: 'run-g22-snap',
    issueId: null,
    agentId: 'agent-g22',
    runtime: 'grok',
    status: 'queued',
    kind: 'quick_create',
    quickPrompt: 'hi',
    chatThreadId: null,
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
    model: 'grok-4.5',
    thinkingLevel: 'high',
    createdAt: now,
  })
  .run();

{
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, 'run-g22-snap')).get();
  assert(row, 'run row exists');
  assert(row.model === 'grok-4.5', `row.model=${row.model}`);
  assert(row.thinkingLevel === 'high', `row.thinking=${row.thinkingLevel}`);
  const api = toAgentRun(row);
  assert(api.model === 'grok-4.5', `api.model=${api.model}`);
  assert(api.thinkingLevel === 'high', `api.thinkingLevel=${api.thinkingLevel}`);
  console.log('PASS schema reshape includes model+thinking on AgentRun');
}

// 2) update fake run → toAgentRun reflects
db.update(agentRuns)
  .set({ model: 'grok-3-mini', thinkingLevel: 'low' })
  .where(eq(agentRuns.id, 'run-g22-snap'))
  .run();
{
  const row = db.select().from(agentRuns).where(eq(agentRuns.id, 'run-g22-snap')).get()!;
  const api = toAgentRun(row);
  assert(api.model === 'grok-3-mini', `updated model ${api.model}`);
  assert(api.thinkingLevel === 'low', `updated thinking ${api.thinkingLevel}`);
  console.log('PASS toAgentRun after update');
}

// 3) null snapshot → CLI 默认语义（API null）
db.update(agentRuns)
  .set({ model: null, thinkingLevel: null })
  .where(eq(agentRuns.id, 'run-g22-snap'))
  .run();
{
  const api = toAgentRun(
    db.select().from(agentRuns).where(eq(agentRuns.id, 'run-g22-snap')).get()!,
  );
  assert(api.model === null, 'null model');
  assert(api.thinkingLevel === null, 'null thinking');
  console.log('PASS null snapshot maps to null');
}

// 4) grok print path includes --effort
{
  const printArgs = buildGrokAgentArgs(
    {
      model: 'grok-4.5',
      thinkingLevel: 'high',
      prompt: 'hello',
    },
    { print: true },
  );
  assert(printArgs.includes('-p'), 'print has -p');
  assert(printArgs.includes('--model'), 'print has --model');
  const mi = printArgs.indexOf('--model');
  assert(printArgs[mi + 1] === 'grok-4.5', 'print model value');
  assert(printArgs.includes('--effort'), `print missing --effort: ${printArgs.join(' ')}`);
  const ei = printArgs.indexOf('--effort');
  assert(printArgs[ei + 1] === 'high', 'print effort value');
  assert(printArgs[printArgs.length - 1] === 'hello', 'prompt last');

  const fallbackArgs = buildGrokAgentArgs(
    { model: null, thinkingLevel: 'medium', prompt: 'x' },
    { print: false },
  );
  assert(!fallbackArgs.includes('-p'), 'fallback no -p');
  assert(fallbackArgs.includes('--effort'), 'fallback effort');
  assert(!fallbackArgs.includes('--model'), 'no model when null');
  console.log('PASS grok print+fallback buildGrokAgentArgs');
}

// 5) columns exist after migrate (raw pragma)
{
  const cols = sqlite
    .prepare(`PRAGMA table_info(agent_run)`)
    .all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  assert(names.has('model'), 'agent_run.model column');
  assert(names.has('thinking_level'), 'agent_run.thinking_level column');
  console.log('PASS migration 0031 columns present');
}

sqlite.close();
try {
  rmSync(scratch, { recursive: true, force: true });
} catch {
  /* tmp cleanup best-effort */
}

console.log('ALL PASS');
