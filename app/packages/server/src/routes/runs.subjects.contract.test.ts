import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, chatThreads, issues, projects } from '../db/schema.js';

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

type RunsResponse = {
  data: Array<{
    id: string;
    subject?: {
      issue?: { id: string; identifier: string; title: string } | null;
      chat?: { id: string; title: string } | null;
      project?: { id: string; title: string } | null;
    };
  }>;
  total: number;
  limit: number;
  offset: number;
};

describe('GET /api/runs subject projection and DB filters', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    const fixtures = seedTestFixtures(t.db);
    const now = Date.now();

    t.db.insert(projects)
      .values([
        { id: 'proj-subject-a', workspaceId: fixtures.workspaceId, title: 'Alpha 项目', status: 'active', createdAt: now, updatedAt: now },
        { id: 'proj-subject-b', workspaceId: fixtures.workspaceId, title: 'Beta 项目', status: 'active', createdAt: now, updatedAt: now },
      ])
      .run();
    t.db.insert(issues)
      .values({
        id: 'iss-subject-a',
        workspaceId: fixtures.workspaceId,
        identifier: 'ISS-42',
        title: '登录 100%_\\路径',
        status: 'todo',
        priority: 'medium',
        assigneeType: 'agent',
        assigneeId: 'agt-test-1',
        creatorType: 'member',
        creatorId: fixtures.userId,
        position: 1,
        projectId: 'proj-subject-a',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    t.db.insert(chatThreads)
      .values({
        id: 'chat-subject-a',
        agentId: 'agt-test-1',
        title: '会话标题',
        projectId: 'proj-subject-a',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // 四条真实 run：Issue 项目 A、chat 项目 A、独立 QC 项目 B、无命中行。
    t.db.insert(agentRuns)
      .values([
        { id: 'run-issue-a', issueId: 'iss-subject-a', agentId: 'agt-test-1', runtime: 'opencode', status: 'completed', kind: 'issue', createdAt: 4_000 },
        { id: 'run-chat-a', chatThreadId: 'chat-subject-a', agentId: 'agt-test-1', runtime: 'opencode', status: 'completed', kind: 'chat', createdAt: 3_000 },
        { id: 'run-qc-b', projectId: 'proj-subject-b', agentId: 'agt-test-1', runtime: 'opencode', status: 'completed', kind: 'quick_create', createdAt: 2_000 },
        { id: 'run-no-match', agentId: 'agt-test-1', runtime: 'opencode', status: 'completed', kind: 'quick_create', createdAt: 1_000 },
      ])
      .run();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('returns a fixed subject projection, createdAt-desc order, total, and page metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/runs?limit=1&offset=1' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RunsResponse;
    expect(body).toMatchObject({ total: 4, limit: 1, offset: 1 });
    expect(body.data.map((run) => run.id)).toEqual(['run-chat-a']);

    const all = (await app.inject({ method: 'GET', url: '/api/runs?limit=10' })).json() as RunsResponse;
    expect(all.data.map((run) => run.id)).toEqual([
      'run-issue-a', 'run-chat-a', 'run-qc-b', 'run-no-match',
    ]);
    expect(all.data[0]?.subject).toEqual({
      issue: { id: 'iss-subject-a', identifier: 'ISS-42', title: '登录 100%_\\路径' },
      chat: null,
      project: { id: 'proj-subject-a', title: 'Alpha 项目' },
    });
    expect(all.data[1]?.subject).toEqual({
      issue: null,
      chat: { id: 'chat-subject-a', title: '会话标题' },
      project: { id: 'proj-subject-a', title: 'Alpha 项目' },
    });
    expect(all.data[2]?.subject).toEqual({
      issue: null,
      chat: null,
      project: { id: 'proj-subject-b', title: 'Beta 项目' },
    });
    expect(all.data[3]?.subject).toEqual({ issue: null, chat: null, project: null });
  });

  it('filters q in SQLite across issue, chat, and effective project with literal LIKE escaping', async () => {
    const byIssue = (await app.inject({ method: 'GET', url: '/api/runs?q=iss-42' })).json() as RunsResponse;
    expect(byIssue.data.map((run) => run.id)).toEqual(['run-issue-a']);

    const byChat = (await app.inject({ method: 'GET', url: '/api/runs?q=%E4%BC%9A%E8%AF%9D%E6%A0%87%E9%A2%98' })).json() as RunsResponse;
    expect(byChat.data.map((run) => run.id)).toEqual(['run-chat-a']);

    const byProject = (await app.inject({ method: 'GET', url: '/api/runs?q=ALPHA' })).json() as RunsResponse;
    expect(byProject.data.map((run) => run.id)).toEqual(['run-issue-a', 'run-chat-a']);

    const escaped = (await app.inject({ method: 'GET', url: '/api/runs?q=100%25_%5C' })).json() as RunsResponse;
    expect(escaped.data.map((run) => run.id)).toEqual(['run-issue-a']);

    const blank = (await app.inject({ method: 'GET', url: '/api/runs?q=%20%20' })).json() as RunsResponse;
    expect(blank.total).toBe(4);
  });

  it('intersects effective-project and q filters without scanning a browser page', async () => {
    const project = (await app.inject({ method: 'GET', url: '/api/runs?projectId=proj-subject-a' })).json() as RunsResponse;
    expect(project).toMatchObject({ total: 2 });
    expect(project.data.map((run) => run.id)).toEqual(['run-issue-a', 'run-chat-a']);

    const intersect = (await app.inject({ method: 'GET', url: '/api/runs?projectId=proj-subject-a&q=%E4%BC%9A%E8%AF%9D%E6%A0%87%E9%A2%98' })).json() as RunsResponse;
    expect(intersect).toMatchObject({ total: 1 });
    expect(intersect.data.map((run) => run.id)).toEqual(['run-chat-a']);

    const none = (await app.inject({ method: 'GET', url: '/api/runs?projectId=proj-subject-b&q=Alpha' })).json() as RunsResponse;
    expect(none).toMatchObject({ total: 0, data: [] });
  });
});
