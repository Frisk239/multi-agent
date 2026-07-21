/**
 * F3：issue idle 默认 30m；chat 仍 2m 进程心跳；wall env 可读
 */
import {
  DEFAULT_ISSUE_IDLE_MS,
  STALE_RUNNING_MS,
  failStaleRunningRuns,
  formatDurationMs,
  getIssueIdleMs,
  getIssueWallTimeoutMs,
} from '../src/orchestration/stale-runs.js';
import { db } from '../src/db/client.js';
import { agentRuns, agents } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { classifyRunFailure } from '@ma/shared';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const agent = db.select().from(agents).all()[0];
assert(agent, 'need agent');

// env defaults
delete process.env.MA_ISSUE_IDLE_MS;
delete process.env.MA_ISSUE_TIMEOUT_MS;
assert(getIssueIdleMs() === DEFAULT_ISSUE_IDLE_MS, `idle default ${getIssueIdleMs()}`);
assert(getIssueWallTimeoutMs() === 0, 'wall default 0');
assert(formatDurationMs(30 * 60_000) === '30m', 'format');

// insert synthetic old issue run
const issueRunId = crypto.randomUUID();
const old = Date.now() - DEFAULT_ISSUE_IDLE_MS - 60_000;
db.insert(agentRuns)
  .values({
    id: issueRunId,
    issueId: null,
    agentId: agent.id,
    runtime: agent.runtime,
    status: 'running',
    kind: 'issue',
    quickPrompt: null,
    chatThreadId: null,
    error: null,
    startedAt: old,
    finishedAt: null,
    lastHeartbeatAt: old,
    isLeader: 0,
    squadId: null,
    rerunOfRunId: null,
    createdAt: old,
  })
  .run();

const n = failStaleRunningRuns(Date.now());
assert(n >= 1, `expected >=1 stale fail, got ${n}`);
const row = db.select().from(agentRuns).where(eq(agentRuns.id, issueRunId)).get();
assert(row?.status === 'failed', `status=${row?.status}`);
assert(row?.error?.includes('idle timeout'), `error=${row?.error}`);
const cls = classifyRunFailure(row?.error);
assert(cls.title.includes('idle') || cls.title.includes('进度'), cls.title);
console.log('PASS issue idle fail:', row?.error);

// chat recent should not fail with issue idle (hb fresh)
const chatId = crypto.randomUUID();
const now = Date.now();
db.insert(agentRuns)
  .values({
    id: chatId,
    issueId: null,
    agentId: agent.id,
    runtime: agent.runtime,
    status: 'running',
    kind: 'chat',
    quickPrompt: 'hi',
    chatThreadId: null,
    error: null,
    startedAt: now - 10_000,
    finishedAt: null,
    lastHeartbeatAt: now - 10_000, // within 2min
    isLeader: 0,
    squadId: null,
    rerunOfRunId: null,
    createdAt: now - 10_000,
  })
  .run();
failStaleRunningRuns(Date.now());
const chatRow = db.select().from(agentRuns).where(eq(agentRuns.id, chatId)).get();
assert(chatRow?.status === 'running', 'fresh chat should stay running');
// cleanup chat
db.update(agentRuns)
  .set({ status: 'cancelled', finishedAt: Date.now() })
  .where(eq(agentRuns.id, chatId))
  .run();

// chat old heartbeat fails with heartbeat timeout
const chatOldId = crypto.randomUUID();
const chatOld = Date.now() - STALE_RUNNING_MS - 5_000;
db.insert(agentRuns)
  .values({
    id: chatOldId,
    issueId: null,
    agentId: agent.id,
    runtime: agent.runtime,
    status: 'running',
    kind: 'chat',
    quickPrompt: 'hi',
    chatThreadId: null,
    error: null,
    startedAt: chatOld,
    finishedAt: null,
    lastHeartbeatAt: chatOld,
    isLeader: 0,
    squadId: null,
    rerunOfRunId: null,
    createdAt: chatOld,
  })
  .run();
failStaleRunningRuns(Date.now());
const chatOldRow = db.select().from(agentRuns).where(eq(agentRuns.id, chatOldId)).get();
assert(chatOldRow?.status === 'failed', 'old chat should fail');
assert(chatOldRow?.error?.includes('heartbeat'), chatOldRow?.error ?? '');
console.log('PASS chat heartbeat fail');

// wall env
process.env.MA_ISSUE_TIMEOUT_MS = '600000';
assert(getIssueWallTimeoutMs() === 600_000, 'wall env');
delete process.env.MA_ISSUE_TIMEOUT_MS;

console.log('ALL PASS');
process.exit(0);
