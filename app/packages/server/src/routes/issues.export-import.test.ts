/**
 * G5-7：Issue/看板 JSON 导入导出契约测试。
 * 真实路由 + 内存迁移 DB：导出快照结构（字段/labels）、导入逐条结果（created/failed）、
 * enqueue=false 静默建卡（不触发 run）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { issues, issueLabels, issueToLabels, agentRuns } from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  sqlite: null as ReturnType<typeof createTestDb>['sqlite'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
  // issues.ts 的 labels 写入用 sqlite.transaction —— 暴露真实实例
  get sqlite() {
    if (!state.sqlite) throw new Error('test sqlite not ready');
    return state.sqlite;
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

describe('G5-7 issue export/import contract', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.sqlite = t.sqlite;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';
  });

  afterEach(() => {
    state.cleanup?.();
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
  });

  it('导出快照含字段与 labels；导入 created/failed 计数正确且静默建卡', async () => {
    const db = state.db!;
    // 造 label
    db.insert(issueLabels)
      .values({
        id: 'lbl-imp-1',
        workspaceId: 'ws-local',
        name: '迁移标签',
        color: '#123456',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const app = await buildApp();
    // 1) 建一个待导出的 issue（挂 label + assignee）
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/issues',
      payload: {
        title: '导出源卡',
        description: '迁移源',
        priority: 'high',
        status: 'in_progress',
        labels: ['lbl-imp-1'],
        assignee: { type: 'agent', id: 'agt-test-1' },
        customFields: { 优先级: 'P0' },
      },
    });
    expect(createRes.statusCode).toBe(201);

    // 2) 导出
    const exp = await app.inject({ method: 'GET', url: '/api/issues/export' });
    expect(exp.statusCode).toBe(200);
    const snapshot = exp.json();
    expect(snapshot.version).toBe(1);
    expect(snapshot.workspaceId).toBe('ws-local');
    expect(snapshot.exportedAt).toBeTruthy();
    const item = snapshot.issues.find((i: { title: string }) => i.title === '导出源卡');
    expect(item).toBeTruthy();
    expect(item.priority).toBe('high');
    expect(item.status).toBe('in_progress');
    expect(item.assignee).toEqual({ type: 'agent', id: 'agt-test-1' });
    expect(item.labels).toEqual(['lbl-imp-1']);
    expect(item.customFields).toEqual({ 优先级: 'P0' });
    // 不导 identifier
    expect(item.identifier).toBeUndefined();

    // 3) 导入：一条有效（挂 label）+ 一条坏 label（应 failed）
    const imp = await app.inject({
      method: 'POST',
      url: '/api/issues/import',
      payload: {
        issues: [
          { title: '导入卡A', priority: 'medium', status: 'todo', labels: ['lbl-imp-1'], assignee: { type: 'agent', id: 'agt-test-1' } },
          { title: '导入卡B', labels: ['lbl-not-exist'] },
        ],
      },
    });
    expect(imp.statusCode).toBe(200);
    const impBody = imp.json();
    expect(impBody.ok).toBe(true);
    expect(impBody.created).toBe(1);
    expect(impBody.failed).toEqual([{ title: '导入卡B', error: '存在无效 labelId' }]);

    // 导入卡存在且带 label、assignee
    const imported = db.select().from(issues).where(eq(issues.title, '导入卡A')).get();
    expect(imported).toBeTruthy();
    expect(imported?.status).toBe('todo');
    expect(imported?.assigneeId).toBe('agt-test-1');
    const importedLabels = db.select().from(issueToLabels).where(eq(issueToLabels.issueId, imported!.id)).all();
    expect(importedLabels.map((l) => l.labelId)).toEqual(['lbl-imp-1']);

    // enqueue=false：导入不产生 run
    const runsForImported = db.select().from(agentRuns).where(eq(agentRuns.issueId, imported!.id)).all();
    expect(runsForImported).toHaveLength(0);
  });
});
