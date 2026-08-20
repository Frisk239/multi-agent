/**
 * W5 · chat 路由最小契约：threads 列表 / 创建 / 404 / 校验边界。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agents, agentRuns, chatMessages, chatThreads } from '../db/schema.js';
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

  it('rejects archived Agent chat creation and legacy-thread messages without persisting future work', async () => {
    const db = state.db!;
    db.update(agents)
      .set({ archivedAt: Date.now() })
      .where(eq(agents.id, 'agt-test-1'))
      .run();

    const create = await app.inject({
      method: 'POST',
      url: '/api/chat/threads',
      payload: { agentId: 'agt-test-1' },
    });
    expect(create.statusCode).toBe(409);
    expect(create.json()).toMatchObject({
      code: 'readiness_failed',
      reason: 'agent_archived',
    });

    db.insert(chatThreads)
      .values({
        id: 'chat-archived-agent-history',
        agentId: 'agt-test-1',
        title: '历史会话仍可读',
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    const send = await app.inject({
      method: 'POST',
      url: '/api/chat/threads/chat-archived-agent-history/messages',
      payload: { body: '不得为归档智能体创建 run' },
    });
    expect(send.statusCode).toBe(409);
    expect(send.json()).toMatchObject({
      code: 'readiness_failed',
      reason: 'agent_archived',
    });
    expect(
      db.select().from(chatMessages).where(eq(chatMessages.threadId, 'chat-archived-agent-history')).all(),
    ).toEqual([]);
    expect(
      db.select().from(agentRuns).where(eq(agentRuns.chatThreadId, 'chat-archived-agent-history')).all(),
    ).toEqual([]);
  });

  it('POST /api/chat/threads rejects missing agentId', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/chat/threads', payload: {} });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
  });

  it('PATCH /api/chat/threads/:id trims a title and updates updatedAt', async () => {
    const db = state.db!;
    db.insert(chatThreads)
      .values({
        id: 'chat-rename',
        agentId: 'agt-test-1',
        title: '旧标题',
        createdAt: 1,
        updatedAt: 1,
      })
      .run();

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/chat/threads/chat-rename',
      payload: { title: '  新标题  ' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: 'chat-rename',
      title: '新标题',
    });
    expect(res.json().updatedAt).not.toBe(new Date(1).toISOString());
  });

  it('PATCH /api/chat/threads/:id rejects blank and overlong titles', async () => {
    const db = state.db!;
    db.insert(chatThreads)
      .values({
        id: 'chat-title-validation',
        agentId: 'agt-test-1',
        title: '保留原标题',
        createdAt: 1,
        updatedAt: 1,
      })
      .run();

    const blank = await app.inject({
      method: 'PATCH',
      url: '/api/chat/threads/chat-title-validation',
      payload: { title: '   ' },
    });
    const overlong = await app.inject({
      method: 'PATCH',
      url: '/api/chat/threads/chat-title-validation',
      payload: { title: 'x'.repeat(201) },
    });

    expect(blank.statusCode).toBe(400);
    expect(overlong.statusCode).toBe(400);
    expect(db.select().from(chatThreads).where(eq(chatThreads.id, 'chat-title-validation')).get()?.title).toBe('保留原标题');
  });

  it('DELETE /api/chat/threads/:id requires archive and cascades zero-run messages', async () => {
    const db = state.db!;
    db.insert(chatThreads)
      .values({
        id: 'chat-delete-zero-run',
        agentId: 'agt-test-1',
        title: '可删除会话',
        createdAt: 1,
        updatedAt: 1,
      })
      .run();
    db.insert(chatMessages)
      .values({
        id: 'chat-delete-zero-run-message',
        threadId: 'chat-delete-zero-run',
        role: 'user',
        body: '没有运行记录的消息',
        runId: null,
        createdAt: 1,
      })
      .run();

    const active = await app.inject({
      method: 'DELETE',
      url: '/api/chat/threads/chat-delete-zero-run',
    });
    expect(active.statusCode).toBe(409);
    expect(active.json()).toMatchObject({ code: 'CHAT_THREAD_NOT_ARCHIVED' });

    db.update(chatThreads)
      .set({ archivedAt: 2 })
      .where(eq(chatThreads.id, 'chat-delete-zero-run'))
      .run();
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/chat/threads/chat-delete-zero-run',
    });

    expect(deleted.statusCode).toBe(204);
    expect(db.select().from(chatThreads).where(eq(chatThreads.id, 'chat-delete-zero-run')).get()).toBeUndefined();
    expect(db.select().from(chatMessages).where(eq(chatMessages.threadId, 'chat-delete-zero-run')).all()).toEqual([]);
  });

  it('DELETE /api/chat/threads/:id preserves an archived thread, messages, and every related run', async () => {
    const db = state.db!;
    db.insert(chatThreads)
      .values({
        id: 'chat-delete-protected',
        agentId: 'agt-test-1',
        title: '有运行历史的会话',
        createdAt: 1,
        updatedAt: 1,
        archivedAt: 2,
      })
      .run();
    db.insert(chatMessages)
      .values({
        id: 'chat-delete-protected-message',
        threadId: 'chat-delete-protected',
        role: 'user',
        body: '需保留的消息',
        runId: null,
        createdAt: 1,
      })
      .run();
    db.insert(agentRuns)
      .values({
        id: 'chat-delete-protected-run',
        issueId: null,
        chatThreadId: 'chat-delete-protected',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'completed',
        kind: 'chat',
        priority: 'none',
        isLeader: 0,
        squadId: null,
        error: null,
        createdAt: 1,
      })
      .run();
    db.insert(agentRuns)
      .values({
        id: 'chat-delete-protected-active-run',
        issueId: null,
        chatThreadId: 'chat-delete-protected',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'running',
        kind: 'chat',
        priority: 'none',
        isLeader: 0,
        squadId: null,
        error: null,
        startedAt: 2,
        createdAt: 2,
      })
      .run();

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/chat/threads/chat-delete-protected',
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      code: 'CHAT_THREAD_HAS_RUNS',
      error: '为保留运行记录，无法删除',
    });
    expect(db.select().from(chatThreads).where(eq(chatThreads.id, 'chat-delete-protected')).get()).toBeTruthy();
    expect(db.select().from(chatMessages).where(eq(chatMessages.threadId, 'chat-delete-protected')).all()).toHaveLength(1);
    expect(db.select().from(agentRuns).where(eq(agentRuns.id, 'chat-delete-protected-run')).get()?.chatThreadId).toBe('chat-delete-protected');
    expect(db.select().from(agentRuns).where(eq(agentRuns.id, 'chat-delete-protected-active-run')).get()?.chatThreadId).toBe('chat-delete-protected');
  });
});
