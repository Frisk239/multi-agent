/**
 * C1：同 project_local path 串行；隔离可并行
 * Run: pnpm exec tsx scripts/test-path-serial-c1.mts  (from packages/server)
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const scratch = join(tmpdir(), `ma-c1-path-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
const dbPath = join(scratch, 'c1.db');
process.env.DB_PATH = dbPath;
delete process.env.MA_ISSUE_USE_WORKSPACE_CWD;

const { db, sqlite } = await import('../src/db/client.js');
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
migrate(db, { migrationsFolder });

const { agents, agentRuns, issues, projects, workspaces } = await import(
  '../src/db/schema.js'
);
const {
  normalizePathLockKey,
  findRunningProjectLocalHolder,
  shouldDeferClaimForPath,
  resolveIntendedProjectLocalPath,
  enrichRunRowWithPathLock,
  stampProjectLocalCwdPreview,
} = await import('../src/orchestration/path-lock.js');
const { toAgentRun } = await import('../src/db/reshape.js');
const { eq } = await import('drizzle-orm');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const projDir = join(scratch, 'repo');
mkdirSync(projDir, { recursive: true });
const now = Date.now();
const wsId = 'ws-local';
const agentId = 'agent-c1';
const projectId = 'proj-c1';
const issueA = 'issue-c1-a';
const issueB = 'issue-c1-b';
const runA = 'run-c1-a';
const runB = 'run-c1-b';

db.insert(workspaces)
  .values({ id: wsId, name: 'C1 WS', description: null, rootPath: null, createdAt: now })
  .run();

db.insert(agents)
  .values({
    id: agentId,
    name: 'C1 Agent',
    category: 'test',
    runtime: 'claude-code',
    model: null,
    concurrency: 4,
    createdAt: now,
  })
  .run();

db.insert(projects)
  .values({
    id: projectId,
    workspaceId: wsId,
    title: 'C1 Project',
    description: null,
    status: 'active',
    localPath: projDir,
    createdAt: now,
    updatedAt: now,
  })
  .run();

for (const [id, ident] of [
  [issueA, 'C1-1'],
  [issueB, 'C1-2'],
] as const) {
  db.insert(issues)
    .values({
      id,
      workspaceId: wsId,
      identifier: ident,
      title: id,
      description: null,
      status: 'todo',
      priority: 'none',
      assigneeType: 'agent',
      assigneeId: agentId,
      creatorType: 'member',
      creatorId: 'user-local',
      position: 0,
      projectId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

const k1 = normalizePathLockKey(projDir);
const k2 = normalizePathLockKey(projDir.replace(/\//g, '\\'));
assert(k1.length > 0, 'key empty');
assert(k1 === k2, `slash normalize ${k1} vs ${k2}`);
console.log('PASS normalizePathLockKey', k1);

db.insert(agentRuns)
  .values({
    id: runA,
    issueId: issueA,
    agentId,
    runtime: 'claude-code',
    status: 'running',
    kind: 'issue',
    quickPrompt: null,
    chatThreadId: null,
    isLeader: 0,
    squadId: null,
    error: null,
    startedAt: now,
    finishedAt: null,
    lastHeartbeatAt: now,
    cwdPath: projDir,
    cwdMode: 'project_local',
    projectId,
    createdAt: now,
  })
  .run();

const holder = findRunningProjectLocalHolder(projDir);
assert(holder?.id === runA, `holder=${holder?.id}`);
console.log('PASS holder is runA');

db.insert(agentRuns)
  .values({
    id: runB,
    issueId: issueB,
    agentId,
    runtime: 'claude-code',
    status: 'queued',
    kind: 'issue',
    quickPrompt: null,
    chatThreadId: null,
    isLeader: 0,
    squadId: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    lastHeartbeatAt: null,
    createdAt: now + 1,
  })
  .run();

const rowB = db.select().from(agentRuns).where(eq(agentRuns.id, runB)).get()!;
const intended = resolveIntendedProjectLocalPath(rowB);
assert(intended && normalizePathLockKey(intended) === k1, `intended=${intended}`);
const gate = shouldDeferClaimForPath(rowB);
assert(gate.defer === true, 'B should defer');
assert(gate.defer && gate.holder?.id === runA, 'blocked by A');
console.log('PASS B defers for path');

stampProjectLocalCwdPreview(runB, intended!);
const rowB2 = db.select().from(agentRuns).where(eq(agentRuns.id, runB)).get()!;
const apiB = enrichRunRowWithPathLock(rowB2, toAgentRun(rowB2));
assert(apiB.pathWaitReason === 'path_busy', `wait=${apiB.pathWaitReason}`);
assert(apiB.pathBlockedByRunId === runA, `blockedBy=${apiB.pathBlockedByRunId}`);
console.log('PASS API path_busy on B');

const rowA = db.select().from(agentRuns).where(eq(agentRuns.id, runA)).get()!;
const apiA = enrichRunRowWithPathLock(rowA, toAgentRun(rowA));
assert(apiA.pathHolding === true, 'A holding');
console.log('PASS A pathHolding');

// isolated: no project → no path defer
const runIso2 = 'run-c1-iso2';
db.insert(agentRuns)
  .values({
    id: runIso2,
    issueId: null,
    agentId,
    runtime: 'claude-code',
    status: 'queued',
    kind: 'quick_create',
    quickPrompt: 'y',
    chatThreadId: null,
    isLeader: 0,
    squadId: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    lastHeartbeatAt: null,
    cwdMode: 'isolated_run',
    createdAt: now + 3,
  })
  .run();
const rowIso2 = db.select().from(agentRuns).where(eq(agentRuns.id, runIso2)).get()!;
const gateIso = shouldDeferClaimForPath(rowIso2);
assert(gateIso.defer === false, 'isolated should not defer');
console.log('PASS isolated not path-locked');

const claimed = new Set<string>([k1]);
const gateTick = shouldDeferClaimForPath(rowB, claimed);
assert(gateTick.defer === true, 'same-tick key blocks');
console.log('PASS same-tick claimedKeys');

db.update(agentRuns)
  .set({ status: 'completed', finishedAt: Date.now() })
  .where(eq(agentRuns.id, runA))
  .run();
const gateFree = shouldDeferClaimForPath(
  db.select().from(agentRuns).where(eq(agentRuns.id, runB)).get()!,
);
assert(gateFree.defer === false, 'after A done, B free');
console.log('PASS B free after A completes');

sqlite.close();
try {
  rmSync(scratch, { recursive: true, force: true });
} catch {
  /* ignore */
}
console.log('ALL PASS C1 path serial');
process.exit(0);
