/**
 * Watchdog & FailureReason Test Script
 * 测试多 Provider 差异化 Watchdog (opencode 10m / claude 30m / tool_watchdog 2h)
 * 与 AgentRun failureReason 结构化落库
 */
import {
  DEFAULT_ISSUE_IDLE_MS,
  DEFAULT_OPENCODE_IDLE_MS,
  DEFAULT_ISSUE_TOOL_IDLE_MS,
  STALE_RUNNING_MS,
  failStaleRunningRuns,
  getIssueIdleMs,
  getIssueToolIdleMs,
} from '../src/orchestration/stale-runs.js';
import { failRun } from '../src/orchestration/run-worker.js';
import { noteToolStart, clearToolInflight } from '../src/orchestration/tool-watchdog-state.js';
import { db } from '../src/db/client.js';
import { agentRuns, agents } from '../src/db/schema.js';
import { toAgentRun } from '../src/db/reshape.js';
import { eq } from 'drizzle-orm';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function runTest() {
  console.log('[test-watchdog-inbox] Starting test...');

  const agent = db.select().from(agents).all()[0];
  assert(agent, 'need at least one agent in DB for testing');

  // 1. Verify provider-specific thresholds
  delete process.env.MA_OPENCODE_IDLE_MS;
  delete process.env.MA_ISSUE_IDLE_MS;

  const defaultIdle = getIssueIdleMs('claude-code');
  assert(defaultIdle === DEFAULT_ISSUE_IDLE_MS, `claude-code idle default should be 30m, got ${defaultIdle}`);

  const opencodeIdle = getIssueIdleMs('opencode');
  assert(opencodeIdle === DEFAULT_OPENCODE_IDLE_MS, `opencode idle default should be 10m, got ${opencodeIdle}`);

  process.env.MA_OPENCODE_IDLE_MS = '600000'; // 10 min
  assert(getIssueIdleMs('opencode') === 600_000, 'env MA_OPENCODE_IDLE_MS override');
  delete process.env.MA_OPENCODE_IDLE_MS;

  console.log('✓ PASS provider threshold checks');

  // 2. Test OpenCode 10m idle watchdog
  const opencodeRunId = crypto.randomUUID();
  const elevenMinutesAgo = Date.now() - (11 * 60_000);
  db.insert(agentRuns)
    .values({
      id: opencodeRunId,
      issueId: null,
      agentId: agent.id,
      runtime: 'opencode',
      status: 'running',
      kind: 'issue',
      quickPrompt: null,
      chatThreadId: null,
      error: null,
      failureReason: null,
      startedAt: elevenMinutesAgo,
      finishedAt: null,
      lastHeartbeatAt: elevenMinutesAgo,
      isLeader: 0,
      squadId: null,
      rerunOfRunId: null,
      createdAt: elevenMinutesAgo,
    })
    .run();

  const count1 = failStaleRunningRuns(Date.now());
  assert(count1 >= 1, `expected opencode idle run to be swept, swept count=${count1}`);
  const opencodeRow = db.select().from(agentRuns).where(eq(agentRuns.id, opencodeRunId)).get()!;
  assert(opencodeRow.status === 'failed', `opencode row status=${opencodeRow.status}`);
  assert(opencodeRow.failureReason === 'idle_watchdog', `expected failureReason 'idle_watchdog', got ${opencodeRow.failureReason}`);
  const opencodeRun = toAgentRun(opencodeRow);
  assert(opencodeRun.failureReason === 'idle_watchdog', `toAgentRun failureReason=${opencodeRun.failureReason}`);
  console.log('✓ PASS opencode 10m idle_watchdog sweeper');

  // 3. Test Tool In-flight watchdog (2h) vs 30m idle
  const toolRunId = crypto.randomUUID();
  const fortyMinutesAgo = Date.now() - (40 * 60_000); // > 30m but < 2h
  db.insert(agentRuns)
    .values({
      id: toolRunId,
      issueId: null,
      agentId: agent.id,
      runtime: 'claude-code',
      status: 'running',
      kind: 'issue',
      quickPrompt: null,
      chatThreadId: null,
      error: null,
      failureReason: null,
      startedAt: fortyMinutesAgo,
      finishedAt: null,
      lastHeartbeatAt: fortyMinutesAgo,
      isLeader: 0,
      squadId: null,
      rerunOfRunId: null,
      createdAt: fortyMinutesAgo,
    })
    .run();

  // Mark tool in-flight
  noteToolStart(toolRunId, 'bash');

  // Sweep now -> should NOT fail because tool is in flight and < 2h
  failStaleRunningRuns(Date.now());
  const toolRowMid = db.select().from(agentRuns).where(eq(agentRuns.id, toolRunId)).get()!;
  assert(toolRowMid.status === 'running', 'run with tool in-flight within 2h should stay running');

  // Now simulate 2h 5m ago
  const twoHoursFiveMinAgo = Date.now() - (125 * 60_000);
  db.update(agentRuns)
    .set({ lastHeartbeatAt: twoHoursFiveMinAgo })
    .where(eq(agentRuns.id, toolRunId))
    .run();

  failStaleRunningRuns(Date.now());
  const toolRowEnd = db.select().from(agentRuns).where(eq(agentRuns.id, toolRunId)).get()!;
  assert(toolRowEnd.status === 'failed', 'tool in-flight run after 2h should fail');
  assert(toolRowEnd.failureReason === 'tool_watchdog', `expected tool_watchdog, got ${toolRowEnd.failureReason}`);
  assert(toolRowEnd.error?.includes('tool watchdog'), `expected tool watchdog in error msg, got ${toolRowEnd.error}`);
  clearToolInflight(toolRunId);
  console.log('✓ PASS tool_watchdog sweeper');

  // 4. Test Chat stale heartbeat (2m)
  const chatRunId = crypto.randomUUID();
  const threeMinutesAgo = Date.now() - (3 * 60_000);
  db.insert(agentRuns)
    .values({
      id: chatRunId,
      issueId: null,
      agentId: agent.id,
      runtime: 'claude-code',
      status: 'running',
      kind: 'chat',
      quickPrompt: 'hello',
      chatThreadId: null,
      error: null,
      failureReason: null,
      startedAt: threeMinutesAgo,
      finishedAt: null,
      lastHeartbeatAt: threeMinutesAgo,
      isLeader: 0,
      squadId: null,
      rerunOfRunId: null,
      createdAt: threeMinutesAgo,
    })
    .run();

  failStaleRunningRuns(Date.now());
  const chatRow = db.select().from(agentRuns).where(eq(agentRuns.id, chatRunId)).get()!;
  assert(chatRow.status === 'failed', 'chat run idle > 2m should fail');
  assert(chatRow.failureReason === 'stale_heartbeat', `expected stale_heartbeat, got ${chatRow.failureReason}`);
  console.log('✓ PASS chat stale_heartbeat sweeper');

  // 5. Test explicit failRun with failureReason
  const manualFailRunId = crypto.randomUUID();
  db.insert(agentRuns)
    .values({
      id: manualFailRunId,
      issueId: null,
      agentId: agent.id,
      runtime: 'claude-code',
      status: 'running',
      kind: 'issue',
      quickPrompt: null,
      chatThreadId: null,
      error: null,
      failureReason: null,
      startedAt: Date.now(),
      finishedAt: null,
      lastHeartbeatAt: Date.now(),
      isLeader: 0,
      squadId: null,
      rerunOfRunId: null,
      createdAt: Date.now(),
    })
    .run();

  await failRun(manualFailRunId, 'Execution error during step 3', 'exec_error');
  const manualRow = db.select().from(agentRuns).where(eq(agentRuns.id, manualFailRunId)).get()!;
  assert(manualRow.status === 'failed', 'manual failRun should mark status failed');
  assert(manualRow.failureReason === 'exec_error', `expected exec_error, got ${manualRow.failureReason}`);
  console.log('✓ PASS failRun explicit failureReason persistence');

  // Clean up synthetic test rows
  db.delete(agentRuns).where(eq(agentRuns.id, opencodeRunId)).run();
  db.delete(agentRuns).where(eq(agentRuns.id, toolRunId)).run();
  db.delete(agentRuns).where(eq(agentRuns.id, chatRunId)).run();
  db.delete(agentRuns).where(eq(agentRuns.id, manualFailRunId)).run();

  console.log('\nALL PASS');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('FAIL test-watchdog-inbox:', err);
  process.exit(1);
});
