/**
 * G1-1 · POST /api/runs/:runId/command 契约测试。
 * 驱动真实路由处理器 + 内存迁移 DB；mock registry 的 getBackend 以覆盖各分支。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns } from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
  getBackend: vi.fn(),
  sendRunCommand: vi.fn(),
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
vi.mock('../orchestration/inbox-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../orchestration/inbox-writer.js')>();
  return {
    ...actual,
    notifyEnqueueSkipped: vi.fn(),
    notifyRunTerminal: vi.fn(),
  };
});

vi.mock('../runtime/registry.js', () => ({
  getBackend: state.getBackend,
}));

import { buildApp } from '../app.js';

async function insertRun(
  status: 'queued' | 'running' | 'completed',
  runtime: 'pi' | 'claude-code' = 'pi',
  id = 'run-cmd-1',
) {
  const now = Date.now();
  await state.db!.insert(agentRuns).values({
    id,
    issueId: 'iss-test-1',
    agentId: 'agt-test-1',
    runtime,
    status,
    kind: 'issue',
    quickPrompt: null,
    isLeader: 0,
    squadId: null,
    projectId: null,
    error: null,
    startedAt: status === 'running' ? now : null,
    finishedAt: null,
    lastHeartbeatAt: status === 'running' ? now : null,
    createdAt: now,
  }).run();
}

describe('G1-1 run command contract', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    state.getBackend.mockReset();
    state.sendRunCommand.mockReset();
    state.getBackend.mockReturnValue({
      id: 'pi',
      sendRunCommand: state.sendRunCommand,
    });
  });

  afterEach(async () => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('400：非法 body（steer 缺 message）', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs/whatever/command',
      payload: { command: 'steer' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('404：run 不存在', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs/run-nope/command',
      payload: { command: 'steer', message: 'hi' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('409：run 非 running（queued）不可命令', async () => {
    await insertRun('queued');
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs/run-cmd-1/command',
      payload: { command: 'steer', message: 'hi' },
    });
    expect(res.statusCode).toBe(409);
    expect(state.sendRunCommand).not.toHaveBeenCalled();
    await app.close();
  });

  it('501：runtime 无 sendRunCommand（claude-code）', async () => {
    await insertRun('running', 'claude-code');
    state.getBackend.mockReturnValue({ id: 'claude-code' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs/run-cmd-1/command',
      payload: { command: 'steer', message: 'hi' },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error).toContain('不支持运行中命令');
    await app.close();
  });

  it('200：steer 透传给 backend，响应 {ok:true, command}', async () => {
    await insertRun('running');
    state.sendRunCommand.mockResolvedValue({ ok: true });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs/run-cmd-1/command',
      payload: { command: 'steer', message: '先检查测试目录' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, command: 'steer' });
    expect(state.sendRunCommand).toHaveBeenCalledWith('run-cmd-1', {
      command: 'steer',
      message: '先检查测试目录',
    });
    await app.close();
  });

  it('200：set_model 透传', async () => {
    await insertRun('running');
    state.sendRunCommand.mockResolvedValue({ ok: true });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs/run-cmd-1/command',
      payload: { command: 'set_model', provider: 'deepseek', modelId: 'deepseek-v4-pro' },
    });
    expect(res.statusCode).toBe(200);
    expect(state.sendRunCommand).toHaveBeenCalledWith('run-cmd-1', {
      command: 'set_model',
      provider: 'deepseek',
      modelId: 'deepseek-v4-pro',
    });
    await app.close();
  });

  it('502：backend 拒绝 → ok:false + error passthrough', async () => {
    await insertRun('running');
    state.sendRunCommand.mockResolvedValue({ ok: false, error: 'model locked' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs/run-cmd-1/command',
      payload: { command: 'compact' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe('model locked');
    await app.close();
  });
});
