/**
 * W5 · run-worker 故障注入测试（原 run-worker.ts 807+ 行零测试 import）。
 *
 * 覆盖：claim 竞争 / prepare-lease 过期协作 / cancel 竞争（spawn 前终态复核）/
 * 心跳 touch / wall timeout / 完成路径。
 *
 * 模式：真实迁移 DB（createTestDb + seedTestFixtures），getBackend 换可控 fake
 * backend，tick() 直接驱动（W5 已导出）。生产入口 startRunWorker 不动。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, runMessages } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { cancelRunById } from './run-service.js';
import { failStalePrepareLeaseRuns } from './stale-runs.js';
import type { ExecutionResult } from '../runtime/types.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
  // fake backend：每次测试可配置 execute 行为
  executeImpl: null as ((input: unknown, onEvent: (e: unknown) => void) => Promise<ExecutionResult>) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
  sqlite: {
    prepare: () => ({ get: () => ({ '1': 1 }) }),
  },
  getSqliteHardeningInfo: () => ({
    path: ':memory:',
    busyTimeoutMs: 5000,
    journalMode: 'memory',
    foreignKeys: true,
  }),
  resolveAssigneeLabel: () => 'Test Agent',
  resolveAuthorLabel: () => 'Test User',
}));

vi.mock('../orchestration/event-bus.js', () => ({
  eventBus: { publish: vi.fn(), on: vi.fn() },
}));

// fake backend：claim 后 execute 由测试注入行为
vi.mock('../runtime/registry.js', () => ({
  getBackend: () => ({
    id: 'opencode',
    async execute(input: unknown, onEvent: (e: unknown) => void) {
      if (!state.executeImpl) {
        return { finalText: '', exitReason: 'failed', error: 'no executeImpl' };
      }
      return state.executeImpl(input, onEvent);
    },
  }),
}));

vi.mock('../runtime/prompt.js', () => ({
  resolveRunPrompt: () => 'test prompt',
}));

vi.mock('../runtime/resolve-run-cwd.js', () => ({
  resolveRunCwd: () => ({ path: process.cwd(), mode: 'env' as const, exists: true, error: null }),
}));

vi.mock('../runtime/session-resume.js', () => ({
  runtimeSupportsSessionResume: () => false,
  sessionResumeCapabilityMatrix: () => [],
  isSessionPoisonText: () => false,
  resolvePriorSession: () => ({
    resumeSessionId: null,
    status: 'fresh',
    reason: 'test',
    sourceRunId: null,
  }),
  finalizeSessionFields: (opts: { exitReason?: string | null }) => ({
    resumedSessionId: null,
    sessionResumeStatus: null,
    exitReason: opts.exitReason ?? null,
    errorText: null,
  }),
}));

vi.mock('../memory/manager.js', () => ({
  memoryManager: {
    syncRunCompleted: vi.fn(),
    ambientCapture: vi.fn(),
    getStatus: vi.fn(),
  },
}));

vi.mock('../orchestration/inbox-writer.js', () => ({
  notifyCommentCreated: vi.fn(),
  notifyRunTerminal: vi.fn(),
  notifyEnqueueSkipped: vi.fn(),
}));

vi.mock('../orchestration/comment-trigger.js', () => ({
  triggerFromComment: () => [],
}));

vi.mock('../orchestration/subagent-dispatch.js', () => ({
  parseAndDispatchSubagents: () => Promise.resolve(),
}));

vi.mock('../process-health.js', () => ({
  markWorkerStarted: vi.fn(),
  markWorkerStopped: vi.fn(),
  noteWorkerTick: vi.fn(),
}));

import { tick } from './run-worker.js';

function insertQueuedRun(id: string, agentId = 'agt-test-1'): void {
  const now = Date.now();
  state.db!.insert(agentRuns)
    .values({
      id,
      issueId: 'iss-test-1',
      agentId,
      runtime: 'opencode',
      status: 'queued',
      kind: 'issue',
      createdAt: now,
    })
    .run();
}

function runRow(id: string): { status: string; lastHeartbeatAt: number | null; finishedAt: number | null; error: string | null } {
  return state.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get() as any;
}

const flush = () => new Promise((r) => setTimeout(r, 20));

describe('W5 run-worker fault injection', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    state.executeImpl = null;
    process.env.MA_ISSUE_TIMEOUT_MS = '0';
  });

  afterEach(async () => {
    // executeRun 是 fire-and-forget：等其异步尾巴（activity/评论/memory 写入）飞完，
    // 否则清理 DB 时会触发 unhandled rejection（db down）
    await new Promise((r) => setTimeout(r, 300));
    delete process.env.MA_ISSUE_TIMEOUT_MS;
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('claim race: two concurrent ticks claim a queued run exactly once', async () => {
    insertQueuedRun('run-race');
    let executeCalls = 0;
    state.executeImpl = async () => {
      executeCalls += 1;
      return { finalText: 'ok', exitReason: 'completed' };
    };
    await Promise.all([tick(), tick()]);
    await flush();
    expect(executeCalls).toBe(1);
    expect(runRow('run-race').status).toBe('completed');
  });

  it('prepare-lease expiry: half-claimed run is swept to failed and tick does not touch it', async () => {
    // 半 claim 态：running + 过期 prepare lease（claim 后 execute 前被 sweeper 抢终态的场景）
    const now = Date.now();
    state.db!.insert(agentRuns)
      .values({
        id: 'run-half',
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'running',
        kind: 'issue',
        prepareLeaseExpiresAt: now - 5_000,
        lastHeartbeatAt: now,
        createdAt: now,
      })
      .run();
    let executeCalls = 0;
    state.executeImpl = async () => {
      executeCalls += 1;
      return { finalText: 'x', exitReason: 'completed' };
    };
    const failed = failStalePrepareLeaseRuns();
    expect(failed).toBe(1);
    expect(runRow('run-half').status).toBe('failed');
    await tick();
    await flush();
    expect(executeCalls).toBe(0); // 终态复核：failed 不再被 spawn
  });

  it('cancel race: run cancelled while executing does not fake-success', async () => {
    insertQueuedRun('run-cancel');
    let release: (r: ExecutionResult) => void = () => {};
    state.executeImpl = () => new Promise((resolve) => { release = resolve; });
    void tick();
    await flush();
    // 已 claim 且 execute 挂起 → cancel
    const cancel = cancelRunById('run-cancel');
    expect(cancel.ok).toBe(true);
    release({ finalText: 'late result', exitReason: 'completed' });
    // 等 executeRun 的异步尾巴（activity/评论写入）飞完，避免 afterEach 清库时 unhandled
    await new Promise((r) => setTimeout(r, 200));
    const row = runRow('run-cancel');
    expect(row.status).toBe('cancelled'); // 不伪成功
    const msgs = state.db!.select().from(runMessages).where(eq(runMessages.runId, 'run-cancel')).all();
    expect(msgs.length).toBe(0); // 取消后不落消息副作用
  });

  it('heartbeat: events during execution touch lastHeartbeatAt', async () => {
    insertQueuedRun('run-hb');
    const before = Date.now();
    let release: (r: ExecutionResult) => void = () => {};
    state.executeImpl = (_, onEvent) => {
      // 模拟执行中产生事件（触发 onEvent → touchRunHeartbeat）
      setTimeout(() => {
        (onEvent as (e: { type: string; text: string }) => void)({ type: 'log', text: 'working...' });
        release({ finalText: 'done', exitReason: 'completed' });
      }, 30);
      return new Promise((resolve) => { release = resolve; });
    };
    await tick();
    await new Promise((r) => setTimeout(r, 80)); // 等 fake 的 30ms 事件 + 完成
    expect(runRow('run-hb').status).toBe('completed');
    expect(runRow('run-hb').lastHeartbeatAt).not.toBeNull();
    expect(runRow('run-hb').lastHeartbeatAt!).toBeGreaterThanOrEqual(before);
  });

  it('wall timeout: issue run exceeding MA_ISSUE_TIMEOUT_MS fails instead of hanging', async () => {
    process.env.MA_ISSUE_TIMEOUT_MS = '120';
    insertQueuedRun('run-timeout');
    state.executeImpl = async (input) => {
      const timeoutMs = (input as { timeoutMs: number | null }).timeoutMs;
      expect(timeoutMs).toBe(120); // 预算正确传入 backend
      await new Promise((r) => setTimeout(r, 200)); // 模拟 CLI 超时不返回
      return { finalText: '', exitReason: 'failed', error: 'wall timeout exceeded' };
    };
    await tick();
    await new Promise((r) => setTimeout(r, 300)); // 等 fake 的 200ms 超时返回
    const row = runRow('run-timeout');
    expect(row.status).toBe('failed');
    expect(row.error).toContain('wall timeout');
  });

  it('completion path: message events land in run_message and run completes', async () => {
    insertQueuedRun('run-ok');
    state.executeImpl = async (_, onEvent) => {
      (onEvent as (e: { type: string; role?: string; text: string }) => void)({
        type: 'message',
        role: 'assistant',
        text: 'hello from fake',
      });
      return { finalText: 'hello from fake', exitReason: 'completed' };
    };
    await tick();
    await flush();
    expect(runRow('run-ok').status).toBe('completed');
    const msgs = state.db!.select().from(runMessages).where(eq(runMessages.runId, 'run-ok')).all();
    // 至少含 fake 发的 assistant 消息；完成路径还会追加 system 消息（如自动沉淀记忆），条数不锁死
    expect(msgs.some((m) => m.kind === 'assistant' && m.body.includes('hello from fake'))).toBe(true);
  });
});
