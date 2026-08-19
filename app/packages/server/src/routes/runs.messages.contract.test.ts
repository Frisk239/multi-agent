import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, runMessages } from '../db/schema.js';

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
vi.mock('../orchestration/event-bus.js', () => ({
  eventBus: { publish: vi.fn(), on: vi.fn() },
}));

import { buildApp } from '../app.js';

describe('GET /api/runs/:runId/messages cursor contract', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    t.db.insert(agentRuns)
      .values({
        id: 'run-msg-page',
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'completed',
        kind: 'issue',
        createdAt: 1,
      })
      .run();
     t.db.insert(runMessages)
       .values(
         [1, 2, 3, 4, 5, 6, 7, 8].map((seq) => ({
           id: `msg-${seq}`,
           runId: 'run-msg-page',
           seq,
           kind: 'assistant' as const,
           body: `message ${seq}`,
           createdAt: seq,
         })),
       )
       .run();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('keeps the legacy no-query array response', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/runs/run-msg-page/messages' });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Array<{ seq: number }>).map((m) => m.seq)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('limit only returns the last N messages ASC', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/runs/run-msg-page/messages?limit=3',
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Array<{ seq: number }>).map((m) => m.seq)).toEqual([6, 7, 8]);
  });

  it('beforeSeq returns the last N messages before the cursor ASC', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/runs/run-msg-page/messages?beforeSeq=6&limit=3',
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Array<{ seq: number }>).map((m) => m.seq)).toEqual([3, 4, 5]);
  });

  it('rejects afterSeq and beforeSeq together', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/runs/run-msg-page/messages?afterSeq=1&beforeSeq=5&limit=2',
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
  });

  it('returns strict afterSeq pages in ascending order', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/runs/run-msg-page/messages?afterSeq=2&limit=2',
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Array<{ seq: number }>).map((m) => m.seq)).toEqual([3, 4]);
  });

  it('validates cursor and limit bounds', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/runs/run-msg-page/messages?afterSeq=-1&limit=0',
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
  });
});
