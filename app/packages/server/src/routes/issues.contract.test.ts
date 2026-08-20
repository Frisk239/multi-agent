/**
 * W5 · 契约测试：/api/issues 全路由面（list / search / reorder / PUT / rerun /
 * bulk-status / bulk-assign / bulk-delete）。
 * 模式同 critical-mutate.contract.test.ts：真实迁移 DB（db/client 注入）+ app.inject。
 * 差异：issues.ts 走 `sqlite.transaction`（reorder/delete/bulk），故 mock 的
 * sqlite 直接暴露真实 better-sqlite3 实例（transaction/prepare 都真）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { BulkUpdateIssueAssigneeResponse } from '@ma/shared';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import {
  activityLogs,
  agentRuns,
  comments,
  issues,
  issueLabels,
  issueToLabels,
  squads,
} from '../db/schema.js';
import { LOCAL_MEMBER } from '../local-member.js';
import { resolveSearchTimeoutMs } from './issues.js';

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
  // issues.ts 的 reorder/delete/bulk 用 sqlite.transaction —— 暴露真实实例
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
vi.mock('../orchestration/inbox-writer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../orchestration/inbox-writer.js')>();
  return {
    ...actual,
    notifyEnqueueSkipped: vi.fn(),
    notifyRunTerminal: vi.fn(),
  };
});

import { buildApp } from '../app.js';
import { eventBus } from '../orchestration/event-bus.js';

function insertIssue(
  id: string,
  overrides: Partial<typeof issues.$inferInsert> = {},
) {
  const now = Date.now();
  state.db!.insert(issues)
    .values({
      id,
      workspaceId: 'ws-local',
      identifier: `TST-${id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`,
      title: `Issue ${id}`,
      description: 'desc',
      status: 'todo',
      priority: 'medium',
      creatorType: 'member',
      creatorId: LOCAL_MEMBER.id,
      position: 0,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
}

function insertRun(
  id: string,
  overrides: Partial<typeof agentRuns.$inferInsert> = {},
) {
  const now = Date.now();
  state.db!.insert(agentRuns)
    .values({
      id,
      issueId: 'iss-test-1',
      agentId: 'agt-test-1',
      runtime: 'opencode',
      status: 'failed',
      kind: 'issue',
      quickPrompt: null,
      isLeader: 0,
      squadId: null,
      projectId: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      lastHeartbeatAt: null,
      createdAt: now,
      ...overrides,
    })
    .run();
}

describe('issues contract (W5)', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.sqlite = t.sqlite;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';
  });

  afterEach(() => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    state.cleanup?.();
    state.db = null;
    state.sqlite = null;
    state.cleanup = null;
  });

  describe('GET /api/issues (list)', () => {
    it('200 with data/total/limit/offset + assignee label shape', async () => {
      insertIssue('iss-two');
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/issues' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        data: Array<{ id: string; identifier: string; assignee: { label: string } | null }>;
        total: number;
        limit: number;
        offset: number;
      };
      expect(body.total).toBe(2);
      expect(body.limit).toBe(50);
      expect(body.offset).toBe(0);
      const first = body.data.find((d) => d.id === 'iss-test-1');
      expect(first?.identifier).toBe('FRI-1');
      expect(first?.assignee?.label).toBe('Test Agent');
      await app.close();
    });

    it('filters by status and q', async () => {
      insertIssue('iss-two');
      const app = await buildApp();
      const todo = await app.inject({
        method: 'GET',
        url: '/api/issues?status=todo',
      });
      expect(todo.statusCode).toBe(200);
      expect((todo.json() as { total: number }).total).toBe(2);

      const done = await app.inject({
        method: 'GET',
        url: '/api/issues?status=done',
      });
      expect((done.json() as { total: number }).total).toBe(0);

      const q = await app.inject({ method: 'GET', url: '/api/issues?q=Test' });
      // 仅 iss-test-1（'Test Issue 1'）命中；iss-two 标题是 'Issue iss-two'
      expect((q.json() as { total: number }).total).toBe(1);

      const q2 = await app.inject({ method: 'GET', url: '/api/issues?q=Issue' });
      expect((q2.json() as { total: number }).total).toBe(2);
      await app.close();
    });

    it('400 VALIDATION_ERROR on broken query (assigneeType without assigneeId)', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/issues?assigneeType=agent',
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { code?: string };
      expect(body.code).toBe('VALIDATION_ERROR');
      await app.close();
    });
  });

  describe('GET /api/issues/search', () => {
    it('200 hits with matchSource for title and comment bodies', async () => {
      state.db!.insert(comments)
        .values({
          id: 'cmt-needle',
          issueId: 'iss-test-1',
          type: 'comment',
          authorType: 'member',
          authorId: LOCAL_MEMBER.id,
          body: 'quote-worthy-needle from the discussion',
          createdAt: Date.now(),
        })
        .run();
      const app = await buildApp();

      const titleRes = await app.inject({
        method: 'GET',
        url: '/api/issues/search?q=Test',
      });
      expect(titleRes.statusCode).toBe(200);
      const titleBody = titleRes.json() as {
        data: Array<{ issueId: string; matchSource: string }>;
        total: number;
        query: string;
      };
      expect(titleBody.total).toBe(1);
      expect(titleBody.data[0]?.issueId).toBe('iss-test-1');
      expect(titleBody.data[0]?.matchSource).toBe('title');

      const commentRes = await app.inject({
        method: 'GET',
        url: '/api/issues/search?q=quote-worthy-needle',
      });
      expect(commentRes.statusCode).toBe(200);
      const commentBody = commentRes.json() as {
        data: Array<{ issueId: string; matchSource: string; commentId: string | null }>;
        total: number;
      };
      expect(commentBody.total).toBe(1);
      expect(commentBody.data[0]?.issueId).toBe('iss-test-1');
      expect(commentBody.data[0]?.matchSource).toBe('comment');
      expect(commentBody.data[0]?.commentId).toBe('cmt-needle');
      await app.close();
    });

    it('empty q returns empty result instead of a full-table scan', async () => {
      insertIssue('iss-two');
      const app = await buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/issues/search' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [], total: 0, query: '' });
      await app.close();
    });

    it('scan limit keeps the response bounded on a big match set', async () => {
      for (let i = 0; i < 520; i++) {
        insertIssue(`iss-bulk-${i}`, { title: `needle-scan ${i}` });
      }
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/issues/search?q=needle-scan&limit=100',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { data: unknown[]; total: number };
      expect(body.data.length).toBeLessThanOrEqual(100);
      expect(body.total).toBeLessThanOrEqual(100);
      await app.close();
    });

    it('400 VALIDATION_ERROR on limit out of range', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/issues/search?q=Test&limit=0',
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('503 SEARCH_TIMEOUT when wall-clock budget is exceeded (fast-fail)', async () => {
      vi.stubEnv('MA_SEARCH_TIMEOUT_MS', '1');
      let calls = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => {
        calls += 1;
        return calls * 1000; // 第 2 次调用 → elapsed ≥ 1000ms > 1ms 预算
      });
      const app = await buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/issues/search?q=Test',
      });
      expect(res.statusCode).toBe(503);
      const body = res.json() as { code?: string; success?: boolean };
      expect(body.code).toBe('SEARCH_TIMEOUT');
      expect(body.success).toBe(false);
      expect(calls).toBeGreaterThanOrEqual(2);
      await app.close();
    });
  });

  describe('resolveSearchTimeoutMs (SQLite 等价物决策)', () => {
    it('defaults to 3000ms and honors MA_SEARCH_TIMEOUT_MS', () => {
      expect(resolveSearchTimeoutMs({})).toBe(3000);
      expect(resolveSearchTimeoutMs({ MA_SEARCH_TIMEOUT_MS: '1500' })).toBe(1500);
      expect(resolveSearchTimeoutMs({ MA_SEARCH_TIMEOUT_MS: '0' })).toBe(3000);
      expect(resolveSearchTimeoutMs({ MA_SEARCH_TIMEOUT_MS: 'abc' })).toBe(3000);
    });
  });

  describe('POST /api/issues/reorder', () => {
    it('200 reorders positions and returns updated issues', async () => {
      insertIssue('iss-r2', { position: 1 });
      insertIssue('iss-r3', { position: 2 });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/reorder',
        payload: { status: 'todo', orderedIds: ['iss-r2', 'iss-r3', 'iss-test-1'] },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<{ id: string; position: number }>;
      expect(body).toHaveLength(3);
      const pos = new Map(body.map((b) => [b.id, b.position]));
      expect(pos.get('iss-r2')).toBe(0);
      expect(pos.get('iss-r3')).toBe(1);
      expect(pos.get('iss-test-1')).toBe(2);
      await app.close();
    });

    it('404 on missing issue id (transaction rollback keeps prior positions)', async () => {
      insertIssue('iss-r2', { position: 1 });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/reorder',
        payload: { status: 'todo', orderedIds: ['iss-r2', 'iss-missing'] },
      });
      expect(res.statusCode).toBe(404);
      const row = state.db!.select().from(issues).where(eq(issues.id, 'iss-r2')).get();
      expect(row?.position).toBe(1); // 事务回滚
      await app.close();
    });

    it('400 on duplicate orderedIds and on bad body (Zod)', async () => {
      insertIssue('iss-r2');
      const app = await buildApp();
      const dup = await app.inject({
        method: 'POST',
        url: '/api/issues/reorder',
        payload: { status: 'todo', orderedIds: ['iss-r2', 'iss-r2'] },
      });
      expect(dup.statusCode).toBe(400);

      const zod = await app.inject({
        method: 'POST',
        url: '/api/issues/reorder',
        payload: { status: 'todo', orderedIds: [] },
      });
      expect(zod.statusCode).toBe(400);
      expect((zod.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
      await app.close();
    });
  });

  describe('PUT /api/issues/:id', () => {
    it('200 updates fields and returns the issue + enqueue meta', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/issues/iss-test-1',
        payload: { title: 'Renamed by contract' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { id: string; title: string; enqueue: { status: string } };
      expect(body.id).toBe('iss-test-1');
      expect(body.title).toBe('Renamed by contract');
      expect(body.enqueue.status).toBe('not_applicable');
      await app.close();
    });

    it('404 on missing issue', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/issues/iss-nope',
        payload: { title: 'x' },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('400 when no updatable field is provided', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/issues/iss-test-1',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it('400 VALIDATION_ERROR on invalid status', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/issues/iss-test-1',
        payload: { status: 'nope' },
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('409 conflict when expectedUpdatedAt does not match', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/issues/iss-test-1',
        payload: { title: 'x', expectedUpdatedAt: 1 },
      });
      expect(res.statusCode).toBe(409);
      await app.close();
    });

    it('retains the single-assign cancellation behavior while bulk stays non-cancelling', async () => {
      insertRun('run-single-assign-cancel', {
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        status: 'running',
        startedAt: Date.now(),
      });
      const app = await buildApp();
      const res = await app.inject({
        method: 'PUT',
        url: '/api/issues/iss-test-1',
        payload: { assignee: { type: 'agent', id: 'agt-test-2' } },
      });
      expect(res.statusCode).toBe(200);
      const oldRun = state.db!
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.id, 'run-single-assign-cancel'))
        .get();
      expect(oldRun?.status).toBe('cancelled');
      const newRun = state.db!
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.agentId, 'agt-test-2'))
        .get();
      expect(newRun).toMatchObject({ issueId: 'iss-test-1', status: 'queued' });
      await app.close();
    });
  });

  describe('POST /api/issues/:id/rerun', () => {
    it('201 enqueues a follow-up run for the issue', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/iss-test-1/rerun',
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { id: string; issueId: string | null; status: string };
      expect(body.id).toBeTruthy();
      expect(body.issueId).toBe('iss-test-1');
      expect(body.status).toBe('queued');
      await app.close();
    });

    it('404 on missing issue', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/iss-nope/rerun',
        payload: {},
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('400 when runId belongs to another issue', async () => {
      insertIssue('iss-other');
      insertRun('run-other', { issueId: 'iss-other', status: 'completed' });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/iss-test-1/rerun',
        payload: { runId: 'run-other' },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it('400 VALIDATION_ERROR on bad body (runId shape)', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/iss-test-1/rerun',
        payload: { runId: 42 },
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
      await app.close();
    });
  });

  describe('POST /api/issues/bulk-status', () => {
    it('200 updates status and reports updatedCount', async () => {
      insertIssue('iss-b1');
      insertIssue('iss-b2');
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-status',
        payload: { issueIds: ['iss-test-1', 'iss-b1', 'iss-b2'], status: 'done' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true, updatedCount: 3 });
      const row = state.db!.select().from(issues).where(eq(issues.id, 'iss-b1')).get();
      expect(row?.status).toBe('done');
      await app.close();
    });

    it('400 VALIDATION_ERROR on empty issueIds or bad status', async () => {
      const app = await buildApp();
      const empty = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-status',
        payload: { issueIds: [], status: 'todo' },
      });
      expect(empty.statusCode).toBe(400);
      expect((empty.json() as { code?: string }).code).toBe('VALIDATION_ERROR');

      const badStatus = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-status',
        payload: { issueIds: ['iss-test-1'], status: 'nope' },
      });
      expect(badStatus.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('POST /api/issues/bulk-assign', () => {
    it('preflights once, then persists, broadcasts, and enqueues every actual change', async () => {
      insertIssue('iss-b1');
      (eventBus.publish as ReturnType<typeof vi.fn>).mockClear();
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-assign',
        payload: { issueIds: ['iss-test-1', 'iss-b1'], assigneeType: 'agent', assigneeId: 'agt-test-2' },
      });
      expect(res.statusCode).toBe(200);
      const body = BulkUpdateIssueAssigneeResponse.parse(res.json());
      expect(body).toMatchObject({
        success: true,
        updatedCount: 2,
        enqueuedCount: 2,
        skippedCount: 0,
        notApplicableCount: 0,
        skipped: [],
      });
      expect(body.results.map((item) => item.issueId).sort()).toEqual(['iss-b1', 'iss-test-1']);
      expect(body.results.every((item) => item.enqueue.status === 'queued')).toBe(true);
      const row = state.db!.select().from(issues).where(eq(issues.id, 'iss-test-1')).get();
      expect(row?.assigneeType).toBe('agent');
      expect(row?.assigneeId).toBe('agt-test-2');
      const queued = state.db!
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.agentId, 'agt-test-2'))
        .all();
      expect(queued).toHaveLength(2);
      expect(queued.every((run) => run.status === 'queued')).toBe(true);
      const assignmentEvents = (eventBus.publish as ReturnType<typeof vi.fn>).mock.calls
        .map(([event]) => event)
        .filter((event) => event?.type === 'issue:updated');
      expect(assignmentEvents.map((event) => event.issue.id).sort()).toEqual([
        'iss-b1',
        'iss-test-1',
      ]);
      const activities = state.db!
        .select()
        .from(activityLogs)
        .where(eq(activityLogs.eventType, 'assignee_changed'))
        .all();
      expect(activities.map((activity) => activity.issueId).sort()).toEqual([
        'iss-b1',
        'iss-test-1',
      ]);
      await app.close();
    });

    it('rejects an invalid target before every Issue/activity/run write', async () => {
      insertIssue('iss-b1', { assigneeType: 'agent', assigneeId: 'agt-test-1' });
      const before = state.db!
        .select()
        .from(issues)
        .where(eq(issues.id, 'iss-test-1'))
        .get();
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-assign',
        payload: {
          issueIds: ['iss-test-1', 'iss-b1'],
          assigneeType: 'agent',
          assigneeId: 'agt-missing',
        },
      });
      expect(res.statusCode).toBe(404);
      expect((res.json() as { error?: string }).error).toBe('agent 不存在');
      const after = state.db!
        .select()
        .from(issues)
        .where(eq(issues.id, 'iss-test-1'))
        .get();
      expect(after?.assigneeType).toBe(before?.assigneeType);
      expect(after?.assigneeId).toBe(before?.assigneeId);
      expect(
        state.db!.select().from(activityLogs).where(eq(activityLogs.eventType, 'assignee_changed')).all(),
      ).toHaveLength(0);
      expect(state.db!.select().from(agentRuns).all()).toHaveLength(0);
      await app.close();
    });

    it('rejects a leader-less squad before any target card changes', async () => {
      insertIssue('iss-b1');
      state.db!.insert(squads).values({
        id: 'sqd-no-leader',
        name: 'No leader squad',
        leaderId: null,
        operatingProtocol: '',
        missionDirective: '',
        createdAt: Date.now(),
      }).run();
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-assign',
        payload: {
          issueIds: ['iss-test-1', 'iss-b1'],
          assigneeType: 'squad',
          assigneeId: 'sqd-no-leader',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'readiness_failed', reason: 'no_leader' });
      expect(
        state.db!.select().from(issues).where(eq(issues.id, 'iss-b1')).get()?.assigneeId,
      ).toBeNull();
      expect(
        state.db!.select().from(activityLogs).where(eq(activityLogs.eventType, 'assignee_changed')).all(),
      ).toHaveLength(0);
      expect(state.db!.select().from(agentRuns).all()).toHaveLength(0);
      await app.close();
    });

    it('rejects a readiness hard gate before any target card changes', async () => {
      const oldAllowNotReady = process.env.MA_ENQUEUE_ALLOW_NOT_READY;
      const oldUseWorkspace = process.env.MA_ISSUE_USE_WORKSPACE_CWD;
      const oldWorkspaceCwd = process.env.MA_WORKSPACE_CWD;
      delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
      process.env.MA_ISSUE_USE_WORKSPACE_CWD = '1';
      process.env.MA_WORKSPACE_CWD = `${process.cwd()}/__bulk-assignment-missing-cwd__`;
      try {
        const app = await buildApp();
        const res = await app.inject({
          method: 'POST',
          url: '/api/issues/bulk-assign',
          payload: {
            issueIds: ['iss-test-1'],
            assigneeType: 'agent',
            assigneeId: 'agt-test-2',
          },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ code: 'readiness_failed' });
        expect(
          state.db!.select().from(issues).where(eq(issues.id, 'iss-test-1')).get()?.assigneeId,
        ).toBe('agt-test-1');
        expect(
          state.db!.select().from(activityLogs).where(eq(activityLogs.eventType, 'assignee_changed')).all(),
        ).toHaveLength(0);
        expect(state.db!.select().from(agentRuns).all()).toHaveLength(0);
        await app.close();
      } finally {
        if (oldAllowNotReady === undefined) delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
        else process.env.MA_ENQUEUE_ALLOW_NOT_READY = oldAllowNotReady;
        if (oldUseWorkspace === undefined) delete process.env.MA_ISSUE_USE_WORKSPACE_CWD;
        else process.env.MA_ISSUE_USE_WORKSPACE_CWD = oldUseWorkspace;
        if (oldWorkspaceCwd === undefined) delete process.env.MA_WORKSPACE_CWD;
        else process.env.MA_WORKSPACE_CWD = oldWorkspaceCwd;
      }
    });

    it('does not cancel an existing active run while bulk-assigning a new target', async () => {
      insertRun('run-stays-active', {
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        status: 'running',
        startedAt: Date.now(),
      });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-assign',
        payload: {
          issueIds: ['iss-test-1'],
          assigneeType: 'agent',
          assigneeId: 'agt-test-2',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(BulkUpdateIssueAssigneeResponse.parse(res.json())).toMatchObject({
        updatedCount: 1,
        enqueuedCount: 1,
        skippedCount: 0,
      });
      const oldRun = state.db!
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.id, 'run-stays-active'))
        .get();
      expect(oldRun?.status).toBe('running');
      const newRun = state.db!
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.agentId, 'agt-test-2'))
        .get();
      expect(newRun).toMatchObject({ issueId: 'iss-test-1', status: 'queued' });
      await app.close();
    });

    it('reports already_active for a changed card when the new target already has pending work', async () => {
      insertRun('run-new-target-pending', {
        issueId: 'iss-test-1',
        agentId: 'agt-test-2',
        status: 'queued',
      });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-assign',
        payload: {
          issueIds: ['iss-test-1'],
          assigneeType: 'agent',
          assigneeId: 'agt-test-2',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = BulkUpdateIssueAssigneeResponse.parse(res.json());
      expect(body).toMatchObject({
        updatedCount: 1,
        enqueuedCount: 0,
        skippedCount: 1,
        notApplicableCount: 0,
        results: [
          {
            issueId: 'iss-test-1',
            enqueue: {
              status: 'skipped',
              runId: null,
              reason: 'already_active',
              detail: expect.stringContaining('该 agent 在此 issue 上已有进行中的 run'),
            },
          },
        ],
        skipped: [
          {
            issueId: 'iss-test-1',
            reason: 'already_active',
            detail: expect.stringContaining('该 agent 在此 issue 上已有进行中的 run'),
          },
        ],
      });
      const pendingRuns = state.db!
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.agentId, 'agt-test-2'))
        .all();
      expect(pendingRuns).toHaveLength(1);
      expect(pendingRuns[0]).toMatchObject({
        id: 'run-new-target-pending',
        issueId: 'iss-test-1',
        status: 'queued',
      });
      await app.close();
    });

    it('keeps unassign legal and records no dispatch as not applicable', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-assign',
        payload: { issueIds: ['iss-test-1'], assigneeType: null, assigneeId: null },
      });
      expect(res.statusCode).toBe(200);
      expect(BulkUpdateIssueAssigneeResponse.parse(res.json())).toMatchObject({
        updatedCount: 1,
        enqueuedCount: 0,
        skippedCount: 0,
        notApplicableCount: 1,
        results: [{ issueId: 'iss-test-1', enqueue: { status: 'not_applicable' } }],
      });
      expect(state.db!.select().from(agentRuns).all()).toHaveLength(0);
      await app.close();
    });

    it('400 VALIDATION_ERROR on invalid assigneeType', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-assign',
        payload: { issueIds: ['iss-test-1'], assigneeType: 'nope', assigneeId: 'x' },
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
      await app.close();
    });

    it('400 VALIDATION_ERROR on a half-specified assignee pair', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-assign',
        payload: { issueIds: ['iss-test-1'], assigneeType: 'agent', assigneeId: null },
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
      await app.close();
    });
  });

  describe('POST /api/issues/bulk-delete', () => {
    it('200 deletes issues and reports deletedCount', async () => {
      insertIssue('iss-b1');
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-delete',
        payload: { issueIds: ['iss-test-1', 'iss-b1'] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true, deletedCount: 2 });
      const gone = state.db!.select().from(issues).where(eq(issues.id, 'iss-test-1')).get();
      expect(gone).toBeUndefined();
      await app.close();
    });

    it('400 VALIDATION_ERROR on empty issueIds', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues/bulk-delete',
        payload: { issueIds: [] },
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { code?: string }).code).toBe('VALIDATION_ERROR');
      await app.close();
    });
  });

  describe('POST /api/issues (create, F2)', () => {
    function insertLabel(id: string, overrides: Partial<typeof issueLabels.$inferInsert> = {}) {
      const now = Date.now();
      state.db!.insert(issueLabels)
        .values({
          id,
          workspaceId: 'ws-local',
          name: `Label ${id}`,
          color: '#3b82f6',
          createdAt: now,
          updatedAt: now,
          ...overrides,
        })
        .run();
    }

    it('creates with status and labels, echoing both in response', async () => {
      insertLabel('lab-f2-1');
      insertLabel('lab-f2-2');
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues',
        payload: {
          title: 'F2 create with status/labels',
          priority: 'high',
          status: 'in_progress',
          labels: ['lab-f2-1', 'lab-f2-2'],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { id: string; status: string; labels: Array<{ id: string }> };
      expect(body.status).toBe('in_progress');
      expect(body.labels.map((l) => l.id).sort()).toEqual(['lab-f2-1', 'lab-f2-2']);
      const links = state.db!.select().from(issueToLabels).where(eq(issueToLabels.issueId, body.id)).all();
      expect(links.map((l) => l.labelId).sort()).toEqual(['lab-f2-1', 'lab-f2-2']);
      const row = state.db!.select().from(issues).where(eq(issues.id, body.id)).get();
      expect(row?.status).toBe('in_progress');
      await app.close();
    });

    it('defaults status to todo when omitted, labels [] accepted without error', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues',
        payload: { title: 'F2 default status', labels: [] },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { status: string; labels: unknown[] };
      expect(body.status).toBe('todo');
      expect(body.labels).toEqual([]);
      await app.close();
    });

    it('400 on unknown labelId and leaves no half-created issue', async () => {
      const before = state.db!.select().from(issues).all().length;
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues',
        payload: { title: 'F2 bad label', labels: ['lab-does-not-exist'] },
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error?: string }).error).toContain('labelId');
      const after = state.db!.select().from(issues).all().length;
      expect(after).toBe(before);
      await app.close();
    });

    it('400 on archived label', async () => {
      insertLabel('lab-f2-archived', { archivedAt: Date.now() });
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/issues',
        payload: { title: 'F2 archived label', labels: ['lab-f2-archived'] },
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error?: string }).error).toContain('已归档');
      await app.close();
    });
  });
});
