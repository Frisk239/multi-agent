/**
 * C2：tool in-flight 用 tool idle 窗口；无 tool 仍用 issue idle
 * Run: pnpm exec tsx scripts/test-tool-watchdog-c2.mts  (from packages/server)
 */
import {
  DEFAULT_ISSUE_IDLE_MS,
  DEFAULT_ISSUE_TOOL_IDLE_MS,
  failStaleRunningRuns,
  getIssueIdleMs,
  getIssueToolIdleMs,
} from '../src/orchestration/stale-runs.js';
import {
  clearToolInflight,
  getToolInflight,
  noteToolEnd,
  noteToolStart,
} from '../src/orchestration/tool-watchdog-state.js';
import { db } from '../src/db/client.js';
import { agentRuns, agents } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { classifyRunFailure } from '@ma/shared';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

delete process.env.MA_ISSUE_IDLE_MS;
delete process.env.MA_ISSUE_TOOL_IDLE_MS;
assert(getIssueIdleMs() === DEFAULT_ISSUE_IDLE_MS, 'idle default');
assert(getIssueToolIdleMs() === DEFAULT_ISSUE_TOOL_IDLE_MS, 'tool default');

const agent = db.select().from(agents).all()[0];
assert(agent, 'need agent in dev.db');

// unit: depth
const rid = 'tool-depth-unit';
clearToolInflight(rid);
noteToolStart(rid, 'Bash');
assert(getToolInflight(rid).depth === 1, 'depth 1');
noteToolStart(rid, 'Read');
assert(getToolInflight(rid).depth === 2, 'depth 2');
noteToolEnd(rid, 'Read');
assert(getToolInflight(rid).depth === 1, 'depth 1 after end');
noteToolEnd(rid, 'Bash');
assert(getToolInflight(rid).depth === 0, 'depth 0');
console.log('PASS tool depth map');

// synthetic run: tool in-flight, hb older than idle but younger than tool → stay
const runTool = crypto.randomUUID();
const now = Date.now();
const hbOldIdle = now - DEFAULT_ISSUE_IDLE_MS - 60_000; // past 30m idle
// but within 2h tool window
assert(now - hbOldIdle < DEFAULT_ISSUE_TOOL_IDLE_MS, 'fixture within tool window');

db.insert(agentRuns)
  .values({
    id: runTool,
    issueId: null,
    agentId: agent.id,
    runtime: agent.runtime,
    status: 'running',
    kind: 'issue',
    quickPrompt: null,
    chatThreadId: null,
    error: null,
    startedAt: hbOldIdle,
    finishedAt: null,
    lastHeartbeatAt: hbOldIdle,
    isLeader: 0,
    squadId: null,
    rerunOfRunId: null,
    createdAt: hbOldIdle,
  })
  .run();

noteToolStart(runTool, 'Bash');
const n1 = failStaleRunningRuns(now);
const row1 = db.select().from(agentRuns).where(eq(agentRuns.id, runTool)).get();
assert(row1?.status === 'running', `tool inflight should survive idle, status=${row1?.status} n=${n1}`);
console.log('PASS tool inflight survives issue idle window');

// past tool window → fail tool watchdog
const pastTool = now - DEFAULT_ISSUE_TOOL_IDLE_MS - 5_000;
db.update(agentRuns)
  .set({ lastHeartbeatAt: pastTool, startedAt: pastTool })
  .where(eq(agentRuns.id, runTool))
  .run();
// depth still > 0
assert(getToolInflight(runTool).depth > 0, 'still inflight');
const n2 = failStaleRunningRuns(now);
assert(n2 >= 1, `expected tool fail, n=${n2}`);
const row2 = db.select().from(agentRuns).where(eq(agentRuns.id, runTool)).get();
assert(row2?.status === 'failed', `status=${row2?.status}`);
assert(row2?.error?.includes('tool watchdog'), `error=${row2?.error}`);
const cls = classifyRunFailure(row2?.error);
assert(cls.title.includes('工具'), cls.title);
console.log('PASS tool watchdog fail:', row2?.error);

// no tool: idle still works with short env
process.env.MA_ISSUE_IDLE_MS = '1000';
process.env.MA_ISSUE_TOOL_IDLE_MS = '3600000';
const runIdle = crypto.randomUUID();
const t0 = Date.now() - 5_000;
db.insert(agentRuns)
  .values({
    id: runIdle,
    issueId: null,
    agentId: agent.id,
    runtime: agent.runtime,
    status: 'running',
    kind: 'quick_create',
    quickPrompt: 'x',
    chatThreadId: null,
    error: null,
    startedAt: t0,
    finishedAt: null,
    lastHeartbeatAt: t0,
    isLeader: 0,
    squadId: null,
    rerunOfRunId: null,
    createdAt: t0,
  })
  .run();
// ensure no inflight
clearToolInflight(runIdle);
failStaleRunningRuns(Date.now());
const rowIdle = db.select().from(agentRuns).where(eq(agentRuns.id, runIdle)).get();
assert(rowIdle?.status === 'failed', `idle status=${rowIdle?.status}`);
assert(rowIdle?.error?.includes('idle timeout'), rowIdle?.error ?? '');
console.log('PASS no-tool idle still fails');

delete process.env.MA_ISSUE_IDLE_MS;
delete process.env.MA_ISSUE_TOOL_IDLE_MS;
clearToolInflight(runTool);
console.log('ALL PASS C2 tool watchdog');
process.exit(0);
