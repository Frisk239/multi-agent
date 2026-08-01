/**
 * W5 · wiki 路由最小契约：meta / health / query（无 LLM key → 关键词直出降级）。
 * MA_WIKI_DIR 指向临时目录，避免污染仓库 cwd。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

import { buildApp } from '../app.js';

describe('W5 wiki contracts', () => {
  let app: FastifyInstance;
  let tmpWiki: string;

  beforeEach(async () => {
    tmpWiki = mkdtempSync(join(tmpdir(), 'ma-wiki-contract-'));
    process.env.MA_WIKI_DIR = tmpWiki;
    delete process.env.WIKI_LLM_API_KEY; // 无 key → query 走关键词直出降级（P2-3）
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
    delete process.env.MA_WIKI_DIR;
    rmSync(tmpWiki, { recursive: true, force: true });
  });

  it('GET /api/wiki/meta reports global root', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/wiki/meta' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { source?: string };
    expect(typeof body.source).toBe('string');
  });

  it('GET /api/wiki/health runs structural check', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/wiki/health' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/wiki/query returns keyword fallback without LLM key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wiki/query',
      payload: { question: '架构是什么' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { answer: string; citations: unknown[] };
    expect(typeof body.answer).toBe('string');
    expect(Array.isArray(body.citations)).toBe(true);
  });

  it('POST /api/wiki/query rejects empty question', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/wiki/query',
      payload: { question: '' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
  });
});
