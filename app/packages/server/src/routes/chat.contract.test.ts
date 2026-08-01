/**
 * W5 · chat 路由最小契约：threads 列表 / 创建 / 404 / 校验边界。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import type { FastifyInstance } from 'fastify';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
  sqlite: { prepare: () => ({ get: () => ({ '1': 1 }) }) },
  getSqliteHardeningInfo: () => ({
    path: ':memory:', busyTimeoutMs: 5000, journalMode: 'memory', foreignKeys: true,
  }),
  resolveAssigneeLabel: () => 'Test Agent',
  resolveAuthorLabel: () => 'Test User',
}));
vi.mock('../orchestration/event-bus.js', () => ({ eventBus: { publish: vi.fn(), on: vi.fn() } }));
vi.mock('../memory/manager.js', () => ({
  memoryManager: { ambientCapture: vi.fn(), getStatus: vi.fn() },
}));
vi.mock('../orchestration/inbox-writer.js', () => ({
  notifyCommentCreated: vi.fn(), notifyRunTerminal: vi.fn(), notifyEnqueueSkipped: vi.fn(),
}));

import { buildApp } from '../app.js';

describe('W5 chat contracts', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('GET /api/chat/threads returns empty list', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/chat/threads' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /api/chat/threads creates a thread for an existing agent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/threads',
      payload: { agentId: 'agt-test-1' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string; agentId: string };
    expect(body.agentId).toBe('agt-test-1');
  });

  it('POST /api/chat/threads 404 for unknown agent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat/threads',
      payload: { agentId: 'agt-nope' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/chat/threads rejects missing agentId', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/chat/threads', payload: {} });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
  });
});
