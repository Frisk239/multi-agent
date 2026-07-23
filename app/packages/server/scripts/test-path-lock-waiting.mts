/**
 * Slice B Test: 一等 DB 目录锁状态 (waiting_local_directory) 与 Lease 动态续租
 * Run: pnpm exec tsx scripts/test-path-lock-waiting.mts (from packages/server)
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const scratch = join(tmpdir(), `ma-path-lock-waiting-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
const dbPath = join(scratch, 'waiting.db');
process.env.DB_PATH = dbPath;
delete process.env.MA_ISSUE_USE_WORKSPACE_CWD;

const { db, sqlite } = await import('../src/db/client.js');
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
migrate(db, { migrationsFolder });

const { agents, agentRuns, issues, projects, workspaces } = await import(
  '../src/db/schema.js'
);
const {
  shouldDeferClaimForPath,
  enrichRunRowWithPathLock,
} = await import('../src/orchestration/path-lock.js');
const {
  touchWaitingLocalDirectoryLeases,
  failQueuedMissingAgentRuns,
} = await import('../src/orchestration/stale-runs.js');
const { toAgentRun } = await import('../src/db/reshape.js');
const { eq } = await import('drizzle-orm');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const projDir = join(scratch, 'my-repo');
mkdirSync(projDir, { recursive: true });
const now = Date.now();
const wsId = 'ws-waiting';
const agentId = 'agent-waiting';
const projectId = 'proj-waiting';
const issueA = 'issue-waiting-a';
const issueB = 'issue-waiting-b';
const runA = 'run-waiting-a';
const runB = 'run-waiting-b';

db.insert(workspaces)
  .values({ id: wsId, name: 'Waiting WS', description: null, rootPath: null, createdAt: now })
  .run();

db.insert(agents)
  .values({
    id: agentId,
    name: 'Waiting Agent',
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
    title: 'Waiting Project',
    description: null,
    status: 'active',
    localPath: projDir,
    createdAt: now,
    updatedAt: now,
  })
  .run();

for (const [id, ident] of [
  [issueA, 'WAIT-1'],
  [issueB, 'WAIT-2'],
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

// 1. 插入 Run A，状态为 running 且占用 project_local
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

// 2. 插入 Run B，状态为 queued
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
    projectId,
    createdAt: now + 100,
  })
  .run();

// 3. 验证 shouldDeferClaimForPath
const rowB = db.select().from(agentRuns).where(eq(agentRuns.id, runB)).get()!;
const gate = shouldDeferClaimForPath(rowB);
assert(gate.defer === true, 'Run B should defer due to path lock held by Run A');
assert(gate.holder?.id === runA, 'Path holder should be Run A');
console.log('PASS: path lock defer check passed');

// 模拟 worker tick 中的状态转换 logic：queued -> waiting_local_directory
const now2 = Date.now();
db.update(agentRuns)
  .set({
    status: 'waiting_local_directory',
    lastHeartbeatAt: now2,
    cwdPath: gate.path,
    cwdMode: 'project_local',
  })
  .where(eq(agentRuns.id, runB))
  .run();

const rowBWaiting = db.select().from(agentRuns).where(eq(agentRuns.id, runB)).get()!;
assert(
  rowBWaiting.status === 'waiting_local_directory',
  `Expected status waiting_local_directory, got ${rowBWaiting.status}`,
);
assert(
  rowBWaiting.cwdMode === 'project_local',
  `Expected cwdMode project_local, got ${rowBWaiting.cwdMode}`,
);

const enrichedB = enrichRunRowWithPathLock(rowBWaiting, toAgentRun(rowBWaiting));
assert(
  enrichedB.pathWaitReason === 'path_busy',
  `Expected pathWaitReason path_busy, got ${enrichedB.pathWaitReason}`,
);
assert(
  enrichedB.pathBlockedByRunId === runA,
  `Expected pathBlockedByRunId ${runA}, got ${enrichedB.pathBlockedByRunId}`,
);
console.log('PASS: DB status updated to waiting_local_directory & enriched correctly');

// 4. 测试 Lease Extender 动态续租
const futureTime = Date.now() + 5000;
const touchedCount = touchWaitingLocalDirectoryLeases(futureTime);
assert(touchedCount === 1, `Expected touchedCount 1, got ${touchedCount}`);
const rowBLease = db.select().from(agentRuns).where(eq(agentRuns.id, runB)).get()!;
assert(
  rowBLease.lastHeartbeatAt === futureTime,
  `Expected lastHeartbeatAt ${futureTime}, got ${rowBLease.lastHeartbeatAt}`,
);
console.log('PASS: touchWaitingLocalDirectoryLeases dynamic lease extension passed');

// 5. 释放锁：Run A 完成 -> Run B 被唤醒拿到锁 transition 为 running
db.update(agentRuns)
  .set({ status: 'completed', finishedAt: Date.now() })
  .where(eq(agentRuns.id, runA))
  .run();

const rowBCheck = db.select().from(agentRuns).where(eq(agentRuns.id, runB)).get()!;
const gateFree = shouldDeferClaimForPath(rowBCheck);
assert(gateFree.defer === false, 'Run B should no longer defer after Run A completes');

// 模拟 claim：waiting_local_directory -> running
const now3 = Date.now();
db.update(agentRuns)
  .set({ status: 'running', startedAt: now3, lastHeartbeatAt: now3 })
  .where(eq(agentRuns.id, runB))
  .run();

const rowBRunning = db.select().from(agentRuns).where(eq(agentRuns.id, runB)).get()!;
assert(
  rowBRunning.status === 'running',
  `Expected status running, got ${rowBRunning.status}`,
);
console.log('PASS: Run B successfully transitioned from waiting_local_directory to running');

// 6. 测试 missing agent 清理
const runC = 'run-waiting-c';
db.insert(agentRuns)
  .values({
    id: runC,
    issueId: issueB,
    agentId: 'non-existent-agent',
    runtime: 'claude-code',
    status: 'waiting_local_directory',
    kind: 'issue',
    quickPrompt: null,
    chatThreadId: null,
    isLeader: 0,
    squadId: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    lastHeartbeatAt: null,
    projectId,
    createdAt: now + 200,
  })
  .run();

const missingCleaned = failQueuedMissingAgentRuns(Date.now());
assert(missingCleaned === 1, `Expected missingCleaned 1, got ${missingCleaned}`);
const rowCClean = db.select().from(agentRuns).where(eq(agentRuns.id, runC)).get()!;
assert(rowCClean.status === 'failed', `Expected runC to fail, got ${rowCClean.status}`);
console.log('PASS: missing agent on waiting_local_directory failed correctly');

sqlite.close();
try {
  rmSync(scratch, { recursive: true, force: true });
} catch {
  /* ignore */
}

console.log('ALL PASS: test-path-lock-waiting.mts completed successfully');
process.exit(0);
