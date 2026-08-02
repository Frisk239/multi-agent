/**
 * G5-6：运营统计契约测试 —— /api/analytics/ops（cycle time / 利用率 / 失败率·改派趋势）。
 * 真实路由 + 内存迁移 DB；造 issue/activity_log/agent_run 数据断言聚合口径。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { issues, activityLogs, agentRuns } from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
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
vi.mock('../orchestration/run-worker.js', () => ({ wakeRunWorker: vi.fn() }));

import { buildApp } from '../app.js';

describe('G5-6 ops analytics contract', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';
  });

  afterEach(() => {
    state.cleanup?.();
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
  });

  it('cycle time 中位数 = 创建→done 耗时；利用率/趋势聚合正确', async () => {
    const db = state.db!;
    const NOW = Date.now();
    // done issue：创建于 10 天前，5 分钟后 done → cycle = 300_000ms
    db.insert(issues)
      .values({
        id: 'iss-ops-done',
        workspaceId: 'ws-local',
        identifier: 'OPS-1',
        title: 'ops done',
        status: 'done',
        priority: 'medium',
        creatorType: 'member',
        creatorId: 'user-local',
        createdAt: NOW - 10 * 86_400_000,
        updatedAt: NOW - 10 * 86_400_000 + 300_000,
      })
      .run();
    db.insert(activityLogs)
      .values({
        id: 'act-ops-1',
        issueId: 'iss-ops-done',
        actorType: 'member',
        actorName: '用户',
        eventType: 'status_changed',
        payload: JSON.stringify({ from: 'todo', to: 'done' }),
        createdAt: NOW - 10 * 86_400_000 + 300_000,
      })
      .run();
    // 非 done 的 status_changed（to=in_progress）不应计入 cycle
    db.insert(activityLogs)
      .values({
        id: 'act-ops-2',
        issueId: 'iss-ops-done',
        actorType: 'member',
        actorName: '用户',
        eventType: 'status_changed',
        payload: JSON.stringify({ from: 'todo', to: 'in_progress' }),
        createdAt: NOW - 10 * 86_400_000 + 60_000,
      })
      .run();
    // 改派事件（今天）
    db.insert(activityLogs)
      .values({
        id: 'act-ops-3',
        issueId: 'iss-ops-done',
        actorType: 'member',
        actorName: '用户',
        eventType: 'assignee_changed',
        payload: JSON.stringify({ from: 'agt-test-1', to: 'agt-test-2' }),
        createdAt: NOW - 60_000,
      })
      .run();
    // run：agt-test-1 今天活跃 2h（成功）；agt-test-1 昨天 1 条 failed（30min）
    const runBase: {
      issueId: null;
      agentId: string;
      runtime: 'opencode';
      kind: 'chat';
      cwdPath: string;
      cwdMode: string;
      attempt: number;
      maxAttempts: number;
      sessionResumeStatus: string;
    } = {
      issueId: null,
      agentId: 'agt-test-1',
      runtime: 'opencode',
      kind: 'chat',
      cwdPath: '.',
      cwdMode: 'isolated_issue',
      attempt: 1,
      maxAttempts: 1,
      sessionResumeStatus: 'fresh',
    };
    db.insert(agentRuns)
      .values({
        ...runBase,
        id: 'run-ops-1',
        status: 'completed',
        startedAt: NOW - 2 * 3_600_000,
        finishedAt: NOW,
        createdAt: NOW - 2 * 3_600_000,
      })
      .run();
    db.insert(agentRuns)
      .values({
        ...runBase,
        id: 'run-ops-2',
        status: 'failed',
        startedAt: NOW - 26 * 3_600_000,
        finishedAt: NOW - 25.5 * 3_600_000,
        createdAt: NOW - 26 * 3_600_000,
      })
      .run();

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/analytics/ops?days=30' });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // cycle time
    expect(body.cycleTime.samples).toBe(1);
    expect(body.cycleTime.medianMs).toBe(300_000);
    expect(body.cycleTime.meanMs).toBe(300_000);
    expect(body.cycleTime.p90Ms).toBe(300_000);

    // 利用率：agt-test-1 活跃 2h30m = 9_000_000ms
    const util = body.utilization.agents.find((a: { agentId: string }) => a.agentId === 'agt-test-1');
    expect(util).toBeTruthy();
    expect(util.name).toBe('Test Agent 1');
    expect(util.activeMs).toBe(2.5 * 3_600_000);
    expect(util.utilization).toBeCloseTo((2.5 * 3_600_000) / (30 * 86_400_000), 6);

    // 趋势：今天 1 run 0 failed；昨天 1 run 1 failed（failRate 1）
    const today = body.trend[body.trend.length - 1];
    expect(today.runs).toBe(1);
    expect(today.failedRuns).toBe(0);
    expect(today.reassignments).toBe(1);
    const yesterday = body.trend[body.trend.length - 2];
    expect(yesterday.runs).toBe(1);
    expect(yesterday.failedRuns).toBe(1);
    expect(yesterday.failRate).toBe(1);
    // 趋势连续（30 天每天一条）
    expect(body.trend).toHaveLength(30);
    // 空日 0 填充
    expect(body.trend[0].runs).toBe(0);
  });
});
