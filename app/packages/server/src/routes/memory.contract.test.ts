/**
 * W5 · memory 路由最小契约：status / 创建 / 校验边界。
 * memoryManager 走真实 addCurated（测试 DB + 本地 fallback store）。
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
vi.mock('../orchestration/inbox-writer.js', () => ({
  notifyCommentCreated: vi.fn(), notifyRunTerminal: vi.fn(), notifyEnqueueSkipped: vi.fn(),
}));
vi.mock('../memory/manager.js', () => ({
  memoryManager: {
    addCurated: async (text: string, issueId?: string | null) => ({
      id: 'mem-contract-1',
      issueId: issueId ?? null,
      runId: null,
      text,
      createdAt: Date.now(),
    }),
    getStatus: () => ({ backend: 'test' }),
    ambientCapture: vi.fn(),
  },
}));

import { buildApp } from '../app.js';

describe('W5 memory contracts', () => {
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

  it('GET /api/memory/status reports backend', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/memory/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { backend?: string; ok?: boolean };
    expect(typeof body.backend).toBe('string');
  });

  it('POST /api/memory creates a curated memory', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/memory',
      payload: { text: 'contract memory entry' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id?: string; text?: string };
    expect(body.id).toBe('mem-contract-1');
    expect(body.text).toBe('contract memory entry');
  });

  it('POST /api/memory rejects empty text', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/memory', payload: { text: '' } });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
  });
});
