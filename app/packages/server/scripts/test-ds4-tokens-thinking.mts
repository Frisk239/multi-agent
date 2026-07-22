/**
 * DS4：token 解析 + thinking_level 落库 + usage 聚合
 * Run: pnpm exec tsx scripts/test-ds4-tokens-thinking.mts  (from packages/server)
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';

const scratch = join(tmpdir(), `ma-ds4-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
process.env.DB_PATH = join(scratch, 'ds4.db');

const { db, sqlite } = await import('../src/db/client.js');
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
migrate(db, { migrationsFolder });

const { agents, agentRuns, workspaces } = await import('../src/db/schema.js');
const { parseUsageFromResultLine, extractTokenUsage } = await import(
  '../src/runtime/usage-parse.js'
);
const { rosterRoutes } = await import('../src/routes/roster.js');
const { usageRoutes } = await import('../src/routes/usage.js');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// —— parse fixtures ——
{
  const claude = parseUsageFromResultLine({
    type: 'result',
    result: 'ok',
    usage: {
      input_tokens: 100,
      output_tokens: 40,
      cache_read_input_tokens: 10,
      cache_creation_input_tokens: 2,
    },
  });
  assert(claude?.input === 100, 'claude input');
  assert(claude?.output === 40, 'claude output');
  assert(claude?.cacheRead === 10, 'claude cache read');
  assert(claude?.cacheWrite === 2, 'claude cache write');
  console.log('PASS parse claude usage');
}

{
  const multi = parseUsageFromResultLine({
    type: 'result',
    result: 'ok',
    modelUsage: {
      'claude-sonnet': { input_tokens: 50, output_tokens: 5 },
      'other': { inputTokens: 20, outputTokens: 3 },
    },
  });
  assert(multi?.input === 70, `modelUsage sum in ${multi?.input}`);
  assert(multi?.output === 8, `modelUsage sum out ${multi?.output}`);
  console.log('PASS parse modelUsage sum');
}

{
  const camel = extractTokenUsage({
    promptTokens: 11,
    completionTokens: 7,
  });
  assert(camel?.input === 11 && camel?.output === 7, 'camel aliases');
  console.log('PASS parse camel aliases');
}

// —— seed + agent thinking ——
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
    id: 'agent-ds4',
    name: 'DS4 Bot',
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

const app = Fastify({ logger: false });
await app.register(rosterRoutes);
await app.register(usageRoutes);
await app.ready();

{
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/agents/agent-ds4',
    payload: { thinkingLevel: 'high' },
  });
  assert(res.statusCode === 200, `patch ${res.statusCode} ${res.body}`);
  const body = res.json() as { thinkingLevel: string | null };
  assert(body.thinkingLevel === 'high', 'thinking saved');
  const row = db.select().from(agents).where(eq(agents.id, 'agent-ds4')).get();
  assert(row?.thinkingLevel === 'high', 'db thinking');
  console.log('PASS agent thinking_level CRUD');
}

// runs with tokens
db.insert(agentRuns)
  .values({
    id: 'run-ds4-1',
    issueId: null,
    agentId: 'agent-ds4',
    runtime: 'claude-code',
    status: 'completed',
    kind: 'chat',
    quickPrompt: 'hi',
    chatThreadId: null,
    isLeader: 0,
    squadId: null,
    error: null,
    startedAt: now,
    finishedAt: now + 1000,
    lastHeartbeatAt: now,
    rerunOfRunId: null,
    cwdPath: null,
    cwdMode: null,
    projectId: null,
    tokensInput: 100,
    tokensOutput: 40,
    tokensCacheRead: 0,
    tokensCacheWrite: 0,
    createdAt: now,
  })
  .run();
db.insert(agentRuns)
  .values({
    id: 'run-ds4-2',
    issueId: null,
    agentId: 'agent-ds4',
    runtime: 'cursor',
    status: 'completed',
    kind: 'chat',
    quickPrompt: 'hi2',
    chatThreadId: null,
    isLeader: 0,
    squadId: null,
    error: null,
    startedAt: now,
    finishedAt: now + 2000,
    lastHeartbeatAt: now,
    rerunOfRunId: null,
    cwdPath: null,
    cwdMode: null,
    projectId: null,
    tokensInput: 50,
    tokensOutput: 10,
    tokensCacheRead: null,
    tokensCacheWrite: null,
    createdAt: now + 1,
  })
  .run();

{
  const res = await app.inject({ method: 'GET', url: '/api/usage?days=30' });
  assert(res.statusCode === 200, `usage ${res.statusCode}`);
  const body = res.json() as {
    tokensInput: number | null;
    tokensOutput: number | null;
    costUsd: number | null;
  };
  assert(body.tokensInput === 150, `in ${body.tokensInput}`);
  assert(body.tokensOutput === 50, `out ${body.tokensOutput}`);
  assert(body.costUsd === null, 'cost always null');
  console.log('PASS usage aggregate tokens');
}

// clear thinking
{
  const res = await app.inject({
    method: 'PATCH',
    url: '/api/agents/agent-ds4',
    payload: { thinkingLevel: null },
  });
  assert(res.statusCode === 200, 'clear thinking');
  assert((res.json() as { thinkingLevel: null }).thinkingLevel === null, 'null thinking');
  console.log('PASS clear thinking_level');
}

await app.close();
sqlite.close();
rmSync(scratch, { recursive: true, force: true });
console.log('ALL PASS DS4 tokens+thinking');
process.exit(0);
