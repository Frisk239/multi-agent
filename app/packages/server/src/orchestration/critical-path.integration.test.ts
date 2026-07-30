import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import {
  agentRuns,
  automationRules,
  automationRuns,
} from '../db/schema.js';

/**
 * Slice 41 · 关键路径集成测（createTestDb + 真函数，mock 仅边界依赖）
 * 1) enqueue 硬闸 cwd_missing → skipped 且无 run 行
 * 2) automation 幂等：同 plannedAt 双 dispatch 同一 run
 * 3) orphan running 收尸
 */

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  abortRun: vi.fn(),
  wakeRunWorker: vi.fn(),
  notifyRunTerminal: vi.fn(),
  notifyEnqueueSkipped: vi.fn(),
  notifyCommentCreated: vi.fn(),
  notifyAssigned: vi.fn(),
  ensureIssueSubscriber: vi.fn(),
  computeAgentReadiness: vi.fn(),
  hasRunAbort: vi.fn((_runId?: string) => false),
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
  resolveAssigneeLabel: () => 'test-assignee',
  resolveAuthorLabel: (type: string, id: string) =>
    type === 'member' && id === 'system' ? '系统' : id,
}));

vi.mock('./event-bus.js', () => ({
  eventBus: {
    publish: (...args: unknown[]) => mocks.publish(...args),
  },
}));

vi.mock('./run-control.js', () => ({
  abortRun: (...args: unknown[]) => mocks.abortRun(...args),
  hasRunAbort: (runId?: string) => mocks.hasRunAbort(runId),
  registerRunAbort: vi.fn(),
  clearRunAbort: vi.fn(),
}));

vi.mock('./run-worker.js', () => ({
  wakeRunWorker: (...args: unknown[]) => mocks.wakeRunWorker(...args),
  failRun: vi.fn(),
}));

vi.mock('./inbox-writer.js', () => ({
  notifyRunTerminal: (...args: unknown[]) => mocks.notifyRunTerminal(...args),
  notifyEnqueueSkipped: (...args: unknown[]) => mocks.notifyEnqueueSkipped(...args),
  notifyCommentCreated: (...args: unknown[]) => mocks.notifyCommentCreated(...args),
  notifyAssigned: (...args: unknown[]) => mocks.notifyAssigned(...args),
  ensureIssueSubscriber: (...args: unknown[]) => mocks.ensureIssueSubscriber(...args),
  notifySquadEscalated: vi.fn(),
}));

vi.mock('./readiness.js', () => ({
  computeAgentReadiness: (...args: unknown[]) => mocks.computeAgentReadiness(...args),
}));

// squad-loader 走真实 DB（testState.db）

import { enqueueAgentRun } from './run-service.js';
import { dispatchAutomationRule } from './automation-dispatch.js';
import { recoverOrphanedRunningRuns } from './stale-runs.js';

describe('critical-path integration (Slice 41)', () => {
  beforeEach(() => {
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    mocks.publish.mockReset();
    mocks.abortRun.mockReset();
    mocks.wakeRunWorker.mockReset();
    mocks.notifyRunTerminal.mockReset();
    mocks.notifyEnqueueSkipped.mockReset();
    mocks.notifyCommentCreated.mockReset();
    mocks.notifyAssigned.mockReset();
    mocks.ensureIssueSubscriber.mockReset();
    mocks.computeAgentReadiness.mockReset();
    mocks.hasRunAbort.mockReset();
    mocks.hasRunAbort.mockReturnValue(false);
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
  });

  afterEach(() => {
    testState.cleanup?.();
    testState.db = null;
    testState.cleanup = null;
  });

  it('enqueue hard gate: cwd_missing → skipped with zero agent_run rows', async () => {
    mocks.computeAgentReadiness.mockResolvedValue({
      agentId: 'agt-test-1',
      runtime: 'opencode',
      runtimeInstalled: true,
      runtimePath: '/bin/opencode',
      runtimeVersion: '1.0',
      concurrency: 2,
      runningCount: 0,
      slotsAvailable: 2,
      cwdConfigured: false,
      status: 'cwd_missing',
      detail: '工作区未就绪（集成测）',
    });

    const res = await enqueueAgentRun('iss-test-1', 'agt-test-1');

    expect(res.skipped).toBe(true);
    expect(res.run).toBeNull();
    expect(res.reason).toBe('cwd_missing');
    expect(mocks.wakeRunWorker).not.toHaveBeenCalled();
    expect(mocks.notifyEnqueueSkipped).toHaveBeenCalled();

    const rows = testState.db!.select().from(agentRuns).all();
    expect(rows).toHaveLength(0);
  });

  it('automation idempotent: same plannedAt double dispatch → one automation_run', async () => {
    const now = Date.now();
    const ruleId = 'rule-idem-1';
    const plannedAt = 1_700_000_000_000;

    testState.db!.insert(automationRules)
      .values({
        id: ruleId,
        name: 'Idem Rule',
        enabled: 1,
        scheduleKind: 'interval_minutes',
        intervalMinutes: 60,
        dailyTime: null,
        cronExpression: null,
        // 故意指向不存在 agent → validateAssignee 失败，不建卡，仍落 failed run
        assigneeType: 'agent',
        assigneeId: 'agt-does-not-exist',
        titleTemplate: 'auto {{ruleName}}',
        bodyTemplate: '',
        lastPlannedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const a = await dispatchAutomationRule(ruleId, plannedAt, 'manual');
    const b = await dispatchAutomationRule(ruleId, plannedAt, 'schedule');

    expect(a.id).toBe(b.id);
    expect(a.status).toBe('failed');
    expect(a.error).toMatch(/不存在/);
    expect(b.status).toBe('failed');

    const all = testState.db!.select().from(automationRuns).where(eq(automationRuns.ruleId, ruleId)).all();
    expect(all).toHaveLength(1);
    expect(all[0]!.plannedAt).toBe(plannedAt);
  });

  it('orphan recover: running without live abort → failed once', () => {
    const now = Date.now();
    const id = 'run-orphan-1';
    testState.db!.insert(agentRuns)
      .values({
        id,
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'running',
        kind: 'issue',
        error: null,
        startedAt: now - 60_000,
        finishedAt: null,
        lastHeartbeatAt: now - 60_000,
        isLeader: 0,
        squadId: null,
        createdAt: now - 60_000,
      })
      .run();

    mocks.hasRunAbort.mockReturnValue(false);

    const n1 = recoverOrphanedRunningRuns(now);
    expect(n1).toBe(1);

    const row = testState.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    expect(row?.status).toBe('failed');
    expect(row?.error).toMatch(/orphan/i);
    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'run:failed' }),
    );
    // stale_heartbeat is infrastructure-retryable: the failed source is
    // visible in WS/activity while its bounded child owns recovery.
    expect(mocks.notifyRunTerminal).not.toHaveBeenCalled();
    const retryChild = testState.db!
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.autoRetryOfRunId, id))
      .get();
    expect(retryChild?.status).toBe('queued');
    expect(retryChild?.attempt).toBe(2);

    // 已是终态：再扫 0
    mocks.publish.mockClear();
    mocks.notifyRunTerminal.mockClear();
    const n2 = recoverOrphanedRunningRuns(now + 1);
    expect(n2).toBe(0);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
