/**
 * G2-1 · Deferred-escalation 惰性升级测试（真库模式，照 run-transitions.test.ts）。
 * 覆盖：queued 超龄 → deferred + fire_at；fire 未到点不动；到点 + fallback → failed +
 * escalated 子 run（escalated_from_run_id 血缘 + 深度 1）；无 fallback → failed 不改派；
 * fire 幂等（只升一次）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, agents, activityLogs } from '../db/schema.js';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  notifyRunTerminal: vi.fn(),
  notifyDeferredUnclaimed: vi.fn(() => null),
}));

const testState = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!testState.db) throw new Error('test db not ready');
    return testState.db;
  },
}));

vi.mock('./event-bus.js', () => ({
  eventBus: {
    publish: (...args: unknown[]) => mocks.publish(...args),
  },
}));

vi.mock('./inbox-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./inbox-writer.js')>();
  return {
    ...actual,
    notifyDeferredUnclaimed: mocks.notifyDeferredUnclaimed,
    notifyRunTerminal: mocks.notifyRunTerminal,
  };
});

import { escalateDeferredUnclaimedRuns, fireDeferredRuns } from './stale-runs.js';

const NOW = 1_800_000_000_000;

async function insertQueuedRun(id: string, agentId = 'agt-test-1', createdAt = NOW - 2_000) {
  await testState.db!.insert(agentRuns).values({
    id,
    issueId: 'iss-test-1',
    agentId,
    runtime: 'opencode',
    status: 'queued',
    kind: 'issue',
    quickPrompt: null,
    isLeader: 0,
    squadId: null,
    projectId: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    lastHeartbeatAt: null,
    createdAt,
  }).run();
}

async function getRun(id: string) {
  return testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
}

async function setFallback(agentId: string, fallbackId: string | null) {
  await testState.db!.update(agents).set({ fallbackAgentId: fallbackId }).where(eq(agents.id, agentId)).run();
}

describe('G2-1 deferred-escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    // 阈值 1s 超龄即命中；fire 宽限用默认 5min（fire 未到点用例需要）
    process.env.MA_DEFERRED_UNCLAIMED_MS = '1000';
    process.env.MA_DEFERRED_AUTO_ESCALATE = '1';
    delete process.env.MA_DEFERRED_FIRE_MS;
  });

  afterEach(() => {
    delete process.env.MA_DEFERRED_UNCLAIMED_MS;
    delete process.env.MA_DEFERRED_AUTO_ESCALATE;
    delete process.env.MA_DEFERRED_FIRE_MS;
    testState.cleanup?.();
    testState.db = null;
    testState.cleanup = null;
  });

  it('queued 超龄未 claim → 转 deferred + fire_at 宽限窗；activity 只写一次', () => {
    return (async () => {
      await insertQueuedRun('run-def-1');
      const n = escalateDeferredUnclaimedRuns(NOW);
      expect(n).toBe(1);

      const row = await getRun('run-def-1');
      expect(row?.status).toBe('deferred');
      expect(row?.fireAt).toBe(NOW + 5 * 60_000);

      const acts = testState.db!
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.eventType, 'run_deferred'))
        .all();
      expect(acts).toHaveLength(1);
      expect(JSON.parse(acts[0]!.payload!).deferred).toBe(true);

      // 幂等：再次扫不重复转态/写活动
      const n2 = escalateDeferredUnclaimedRuns(NOW);
      expect(n2).toBe(0);
      expect((await getRun('run-def-1'))?.status).toBe('deferred');
      expect(
        testState.db!.select().from(activityLogs).where(eq(activityLogs.eventType, 'run_deferred')).all(),
      ).toHaveLength(1);
    })();
  });

  it('fire 未到点（fire_at > now）→ 保持 deferred 不动', () => {
    return (async () => {
      await insertQueuedRun('run-def-2');
      escalateDeferredUnclaimedRuns(NOW);
      await setFallback('agt-test-1', 'agt-test-2');

      const n = fireDeferredRuns(NOW); // fire_at = NOW + 5min > NOW
      expect(n).toBe(0);
      expect((await getRun('run-def-2'))?.status).toBe('deferred');
      expect(mocks.publish).not.toHaveBeenCalled();
    })();
  });

  it('fire 到点 + 配了 fallback → 原 run failed(deferred_escalated) + escalated 子 run（深度 1）', () => {
    return (async () => {
      await insertQueuedRun('run-def-3');
      escalateDeferredUnclaimedRuns(NOW);
      await setFallback('agt-test-1', 'agt-test-2');
      // 到点：把 fire_at 提前
      await testState.db!.update(agentRuns).set({ fireAt: NOW - 1 }).where(eq(agentRuns.id, 'run-def-3')).run();

      const n = fireDeferredRuns(NOW);
      expect(n).toBe(1);

      const source = await getRun('run-def-3');
      expect(source?.status).toBe('failed');
      expect(source?.failureReason).toBe('deferred_escalated');
      expect(source?.error).toContain('deferred');

      const child = testState.db!
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.escalatedFromRunId, 'run-def-3'))
        .get();
      expect(child).toBeTruthy();
      expect(child?.agentId).toBe('agt-test-2'); // fallback agent
      expect(child?.runtime).toBe('claude-code');
      expect(child?.status).toBe('queued');
      expect(child?.issueId).toBe('iss-test-1');

      // 深度 1：child 不再链式升级（无 fallback 也建不了：child 的 agent 无 fallback）
      expect(mocks.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'run:failed' }),
      );
    })();
  });

  it('fire 到点但未配 fallback → failed 且不自动改派（宪法边界）', () => {
    return (async () => {
      await insertQueuedRun('run-def-4');
      escalateDeferredUnclaimedRuns(NOW);
      await testState.db!.update(agentRuns).set({ fireAt: NOW - 1 }).where(eq(agentRuns.id, 'run-def-4')).run();

      const n = fireDeferredRuns(NOW);
      expect(n).toBe(1);
      const source = await getRun('run-def-4');
      expect(source?.status).toBe('failed');
      expect(source?.failureReason).toBe('deferred_escalated');
      const child = testState.db!
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.escalatedFromRunId, 'run-def-4'))
        .get();
      expect(child).toBeUndefined();
    })();
  });

  it('fire 幂等：重复调用不再处理已 failed 的 run、不建重复子 run', () => {
    return (async () => {
      await insertQueuedRun('run-def-5');
      escalateDeferredUnclaimedRuns(NOW);
      await setFallback('agt-test-1', 'agt-test-2');
      await testState.db!.update(agentRuns).set({ fireAt: NOW - 1 }).where(eq(agentRuns.id, 'run-def-5')).run();

      fireDeferredRuns(NOW);
      const n2 = fireDeferredRuns(NOW);
      expect(n2).toBe(0);
      const children = testState.db!
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.escalatedFromRunId, 'run-def-5'))
        .all();
      expect(children).toHaveLength(1);
    })();
  });
});
