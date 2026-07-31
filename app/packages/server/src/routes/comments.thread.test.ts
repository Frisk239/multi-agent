import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { comments, issues } from '../db/schema.js';

/**
 * S3 · 评论 thread-lite + resolve/fold —— 路由级测试
 * 纯投影分支已在 src/comment-thread.test.ts 覆盖；这里钉住 HTTP 契约：
 *  - 回复只允许一层（对回复再回复 → THREAD_TOO_DEEP）
 *  - 跨 issue 的父评论被拒
 *  - resolve / unresolve 幂等
 *  - 每线程恒一个 resolution（换结论是替换而非新增）
 */

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  triggerFromComment: vi.fn(async () => []),
  notifyCommentCreated: vi.fn(),
  ambientCapture: vi.fn(),
}));

const testState = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!testState.db) throw new Error('test db not ready');
    return testState.db;
  },
  resolveAssigneeLabel: () => 'test-assignee',
  resolveAuthorLabel: (type: string, id: string) =>
    type === 'member' && id === 'system' ? '系统' : id,
}));
vi.mock('../orchestration/event-bus.js', () => ({
  eventBus: { publish: mocks.publish, on: vi.fn() },
}));
vi.mock('../orchestration/comment-trigger.js', () => ({
  triggerFromComment: mocks.triggerFromComment,
}));
vi.mock('../orchestration/inbox-writer.js', () => ({
  notifyCommentCreated: mocks.notifyCommentCreated,
}));
vi.mock('../memory/manager.js', () => ({
  memoryManager: { ambientCapture: mocks.ambientCapture },
}));

const WS_ID = 'ws-local';
const CREATOR_ID = 'user-linyuan';
const NOW = 1_700_000_000_000;
const ISSUE_ID = 'iss-thread';

async function buildServer() {
  const Fastify = (await import('fastify')).default;
  const { commentRoutes } = await import('./comments.js');
  const app = Fastify();
  await app.register(commentRoutes);
  await app.ready();
  return app;
}

describe('S3 comment thread routes', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    t.db
      .insert(issues)
      .values({
        id: ISSUE_ID,
        workspaceId: WS_ID,
        identifier: 'T-thread',
        title: 'thread issue',
        status: 'todo',
        priority: 'none',
        creatorType: 'member',
        creatorId: CREATOR_ID,
        position: 0,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
    mocks.publish.mockReset();
    app = await buildServer();
  });

  afterEach(async () => {
    await app.close();
    testState.cleanup?.();
    testState.db = null;
    vi.resetModules();
  });

  async function postComment(body: string, parentCommentId?: string) {
    return app.inject({
      method: 'POST',
      url: `/api/issues/${ISSUE_ID}/comments`,
      payload: parentCommentId ? { body, parentCommentId } : { body },
    });
  }

  it('可创建根评论与一层回复', async () => {
    const root = await postComment('根问题');
    expect(root.statusCode).toBe(201);
    const rootId = root.json().id as string;
    expect(root.json().parentCommentId).toBeNull();

    const reply = await postComment('一层回复', rootId);
    expect(reply.statusCode).toBe(201);
    expect(reply.json().parentCommentId).toBe(rootId);
  });

  // 明确边界：不做任意深树
  it('对回复再回复 → 400 THREAD_TOO_DEEP', async () => {
    const rootId = (await postComment('根')).json().id as string;
    const replyId = (await postComment('回复', rootId)).json().id as string;

    const deep = await postComment('回复的回复', replyId);
    expect(deep.statusCode).toBe(400);
    expect(deep.json().code).toBe('THREAD_TOO_DEEP');
  });

  it('父评论属于别的 issue → 400 PARENT_NOT_FOUND', async () => {
    testState.db!
      .insert(comments)
      .values({
        id: 'c-other',
        issueId: 'iss-test-1',
        type: 'comment',
        authorType: 'member',
        authorId: CREATOR_ID,
        body: 'other issue root',
        createdAt: NOW,
      })
      .run();

    const res = await postComment('挂错 issue', 'c-other');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('PARENT_NOT_FOUND');
  });

  it('resolve 默认取最后一条回复，并写入 resolvedAt', async () => {
    const rootId = (await postComment('根')).json().id as string;
    await postComment('r1', rootId);
    const r2 = (await postComment('r2', rootId)).json().id as string;

    const res = await app.inject({
      method: 'POST',
      url: `/api/comments/${rootId}/resolve`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().comment.resolutionCommentId).toBe(r2);
    expect(res.json().comment.resolvedAt).toBeTruthy();
    expect(res.json().idempotent).toBe(false);
  });

  it('重复 resolve 同一结论 → 幂等，resolvedAt 不变', async () => {
    const rootId = (await postComment('根')).json().id as string;
    const r1 = (await postComment('r1', rootId)).json().id as string;

    const first = await app.inject({
      method: 'POST',
      url: `/api/comments/${rootId}/resolve`,
      payload: { resolutionCommentId: r1 },
    });
    const firstAt = first.json().comment.resolvedAt as string;

    const second = await app.inject({
      method: 'POST',
      url: `/api/comments/${rootId}/resolve`,
      payload: { resolutionCommentId: r1 },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().idempotent).toBe(true);
    expect(second.json().comment.resolvedAt).toBe(firstAt);
  });

  // 「每线程最多一个 resolution」
  it('换结论是替换，不会同时存在两个结论', async () => {
    const rootId = (await postComment('根')).json().id as string;
    const r1 = (await postComment('r1', rootId)).json().id as string;
    const r2 = (await postComment('r2', rootId)).json().id as string;

    await app.inject({
      method: 'POST',
      url: `/api/comments/${rootId}/resolve`,
      payload: { resolutionCommentId: r1 },
    });
    const swapped = await app.inject({
      method: 'POST',
      url: `/api/comments/${rootId}/resolve`,
      payload: { resolutionCommentId: r2 },
    });

    expect(swapped.json().comment.resolutionCommentId).toBe(r2);
    const row = testState.db!.select().from(comments).where(eq(comments.id, rootId)).get()!;
    expect(row.resolutionCommentId).toBe(r2);
  });

  it('无回复时无法定论 → 400 no_replies', async () => {
    const rootId = (await postComment('孤立根')).json().id as string;
    const res = await app.inject({
      method: 'POST',
      url: `/api/comments/${rootId}/resolve`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('no_replies');
  });

  it('不能对回复定论 → 400 not_root', async () => {
    const rootId = (await postComment('根')).json().id as string;
    const replyId = (await postComment('r1', rootId)).json().id as string;

    const res = await app.inject({
      method: 'POST',
      url: `/api/comments/${replyId}/resolve`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('not_root');
  });

  it('unresolve 清空结论，且重复调用幂等', async () => {
    const rootId = (await postComment('根')).json().id as string;
    const r1 = (await postComment('r1', rootId)).json().id as string;
    await app.inject({
      method: 'POST',
      url: `/api/comments/${rootId}/resolve`,
      payload: { resolutionCommentId: r1 },
    });

    const first = await app.inject({
      method: 'POST',
      url: `/api/comments/${rootId}/unresolve`,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().idempotent).toBe(false);
    expect(first.json().comment.resolvedAt).toBeNull();
    expect(first.json().comment.resolutionCommentId).toBeNull();

    const second = await app.inject({
      method: 'POST',
      url: `/api/comments/${rootId}/unresolve`,
    });
    expect(second.json().idempotent).toBe(true);
  });

  // 「展开不丢历史」的落库保证
  it('定论后所有回复仍在库中，可完整取回', async () => {
    const rootId = (await postComment('根')).json().id as string;
    await postComment('r1', rootId);
    await postComment('r2', rootId);
    const r3 = (await postComment('r3', rootId)).json().id as string;

    await app.inject({
      method: 'POST',
      url: `/api/comments/${rootId}/resolve`,
      payload: { resolutionCommentId: r3 },
    });

    const list = await app.inject({ method: 'GET', url: `/api/issues/${ISSUE_ID}/comments` });
    const ids = (list.json() as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toHaveLength(4);
  });

  it('resolve 不存在的评论 → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/comments/nope/resolve',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});
