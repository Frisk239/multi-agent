import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { comments, issues } from '../db/schema.js';

/**
 * S2 · 子任务完成传播 —— DB 级集成测试
 *
 * 纯决策分支已由 child-done-propagation.test.ts 覆盖；这里专门钉住只有落库才能验的行为：
 *  - 批量改同一父级 → 最多一条评论 + 一个 run（折叠）
 *  - squad 指派 → 只唤醒 leader
 *  - 全程不修改父 Issue 状态
 *  - enqueue 去重交给 run-service，这里断言「同一父级只调一次 enqueue」
 */

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  enqueueAgentRun: vi.fn(),
  enqueueLeaderRun: vi.fn(),
  recordActivityLog: vi.fn(),
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

vi.mock('./event-bus.js', () => ({
  eventBus: { publish: mocks.publish, on: vi.fn() },
}));

vi.mock('./run-service.js', () => ({
  enqueueAgentRun: mocks.enqueueAgentRun,
  enqueueLeaderRun: mocks.enqueueLeaderRun,
}));

vi.mock('./activity-logger.js', () => ({
  recordActivityLog: mocks.recordActivityLog,
}));

// 必须与 seed-fixtures.ts 一致，否则 issue.workspace_id / creator_id 外键失败
const WS_ID = 'ws-local';
const CREATOR_ID = 'user-linyuan';
const NOW = 1_700_000_000_000;

async function importSubject() {
  return import('./child-done-propagation.js');
}

function insertIssue(overrides: Partial<typeof issues.$inferInsert> & { id: string }) {
  testState.db!.insert(issues)
    .values({
      workspaceId: WS_ID,
      identifier: `T-${overrides.id}`,
      title: `issue ${overrides.id}`,
      status: 'todo',
      priority: 'none',
      creatorType: 'member',
      creatorId: CREATOR_ID,
      position: 0,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    })
    .run();
}

function commentsOf(issueId: string) {
  return testState.db!.select().from(comments).where(eq(comments.issueId, issueId)).all();
}

function issueRow(id: string) {
  return testState.db!.select().from(issues).where(eq(issues.id, id)).get()!;
}

describe('S2 child-done propagation (integration)', () => {
  beforeEach(() => {
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    mocks.publish.mockReset();
    mocks.recordActivityLog.mockReset();
    mocks.enqueueAgentRun.mockReset().mockResolvedValue({ run: { id: 'run-new' } });
    mocks.enqueueLeaderRun.mockReset().mockResolvedValue({ run: { id: 'run-leader' } });
  });

  afterEach(() => {
    testState.cleanup?.();
    testState.db = null;
    vi.resetModules();
  });

  it('最后一个子任务收口 → 父级一条评论 + 唤醒父 agent 一次，且父状态不变', async () => {
    insertIssue({ id: 'p1', status: 'in_progress', assigneeType: 'agent', assigneeId: 'agt-test-1' });
    insertIssue({ id: 'c1', parentIssueId: 'p1', status: 'done' });
    insertIssue({ id: 'c2', parentIssueId: 'p1', status: 'done' });

    const { propagateChildDoneBatch } = await importSubject();
    const out = await propagateChildDoneBatch([
      { issueId: 'c2', parentIssueId: 'p1', prevStatus: 'in_progress', nextStatus: 'done' },
    ]);

    expect(out).toHaveLength(1);
    expect(commentsOf('p1')).toHaveLength(1);
    expect(mocks.enqueueAgentRun).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueAgentRun).toHaveBeenCalledWith('p1', 'agt-test-1');
    // 关键约束：不自动修改父状态
    expect(issueRow('p1').status).toBe('in_progress');
  });

  // AC2 的「批量更新同一父级最多一条评论一个 run」
  it('同批次多个子任务收口 → 同一父级仍只有一条评论一个 run', async () => {
    insertIssue({ id: 'p1', status: 'in_progress', assigneeType: 'agent', assigneeId: 'agt-test-1' });
    insertIssue({ id: 'c1', parentIssueId: 'p1', status: 'done' });
    insertIssue({ id: 'c2', parentIssueId: 'p1', status: 'done' });
    insertIssue({ id: 'c3', parentIssueId: 'p1', status: 'done' });

    const { propagateChildDoneBatch } = await importSubject();
    await propagateChildDoneBatch([
      { issueId: 'c1', parentIssueId: 'p1', prevStatus: 'todo', nextStatus: 'done' },
      { issueId: 'c2', parentIssueId: 'p1', prevStatus: 'todo', nextStatus: 'done' },
      { issueId: 'c3', parentIssueId: 'p1', prevStatus: 'todo', nextStatus: 'done' },
    ]);

    expect(commentsOf('p1')).toHaveLength(1);
    expect(mocks.enqueueAgentRun).toHaveBeenCalledTimes(1);
    expect(issueRow('p1').status).toBe('in_progress');
  });

  it('squad 指派 → 只唤醒 leader，不逐个唤醒成员', async () => {
    insertIssue({ id: 'p1', status: 'in_progress', assigneeType: 'squad', assigneeId: 'sqd-test-1' });
    insertIssue({ id: 'c1', parentIssueId: 'p1', status: 'done' });

    const { propagateChildDoneBatch } = await importSubject();
    await propagateChildDoneBatch([
      { issueId: 'c1', parentIssueId: 'p1', prevStatus: 'in_review', nextStatus: 'done' },
    ]);

    expect(mocks.enqueueLeaderRun).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueLeaderRun).toHaveBeenCalledWith('p1', 'agt-test-1', 'sqd-test-1');
    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
    expect(issueRow('p1').status).toBe('in_progress');
  });

  it('还有兄弟未收口 → 不写评论不派活', async () => {
    insertIssue({ id: 'p1', status: 'in_progress', assigneeType: 'agent', assigneeId: 'agt-test-1' });
    insertIssue({ id: 'c1', parentIssueId: 'p1', status: 'done' });
    insertIssue({ id: 'c2', parentIssueId: 'p1', status: 'in_progress' });

    const { propagateChildDoneBatch } = await importSubject();
    const out = await propagateChildDoneBatch([
      { issueId: 'c1', parentIssueId: 'p1', prevStatus: 'todo', nextStatus: 'done' },
    ]);

    expect(out).toHaveLength(0);
    expect(commentsOf('p1')).toHaveLength(0);
    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
  });

  it('terminal 之间移动（done→cancelled）→ 不重复通知', async () => {
    insertIssue({ id: 'p1', status: 'in_progress', assigneeType: 'agent', assigneeId: 'agt-test-1' });
    insertIssue({ id: 'c1', parentIssueId: 'p1', status: 'cancelled' });

    const { propagateChildDoneBatch } = await importSubject();
    await propagateChildDoneBatch([
      { issueId: 'c1', parentIssueId: 'p1', prevStatus: 'done', nextStatus: 'cancelled' },
    ]);

    expect(commentsOf('p1')).toHaveLength(0);
    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
  });

  it('父已收口 → 不再打扰', async () => {
    insertIssue({ id: 'p1', status: 'done', assigneeType: 'agent', assigneeId: 'agt-test-1' });
    insertIssue({ id: 'c1', parentIssueId: 'p1', status: 'done' });

    const { propagateChildDoneBatch } = await importSubject();
    await propagateChildDoneBatch([
      { issueId: 'c1', parentIssueId: 'p1', prevStatus: 'todo', nextStatus: 'done' },
    ]);

    expect(commentsOf('p1')).toHaveLength(0);
    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
  });

  it('父未指派 → 只通知，不派活', async () => {
    insertIssue({ id: 'p1', status: 'in_progress' });
    insertIssue({ id: 'c1', parentIssueId: 'p1', status: 'done' });

    const { propagateChildDoneBatch } = await importSubject();
    const out = await propagateChildDoneBatch([
      { issueId: 'c1', parentIssueId: 'p1', prevStatus: 'todo', nextStatus: 'done' },
    ]);

    expect(commentsOf('p1')).toHaveLength(1);
    expect(commentsOf('p1')[0]!.body).toContain('父任务未指派');
    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
    expect(mocks.enqueueLeaderRun).not.toHaveBeenCalled();
  });

  it('run-service 拒绝派活（已有进行中 run）时不炸，评论仍写入', async () => {
    mocks.enqueueAgentRun.mockResolvedValue({ run: null, detail: '已有进行中的 run' });
    insertIssue({ id: 'p1', status: 'in_progress', assigneeType: 'agent', assigneeId: 'agt-test-1' });
    insertIssue({ id: 'c1', parentIssueId: 'p1', status: 'done' });

    const { propagateChildDoneBatch } = await importSubject();
    const out = await propagateChildDoneBatch([
      { issueId: 'c1', parentIssueId: 'p1', prevStatus: 'todo', nextStatus: 'done' },
    ]);

    expect(out[0]!.runId).toBeNull();
    expect(out[0]!.note).toContain('已有进行中的 run');
    expect(commentsOf('p1')).toHaveLength(1);
  });

  it('多个不同父级各自独立收口', async () => {
    insertIssue({ id: 'p1', status: 'in_progress', assigneeType: 'agent', assigneeId: 'agt-test-1' });
    insertIssue({ id: 'p2', status: 'todo', assigneeType: 'agent', assigneeId: 'agt-test-2' });
    insertIssue({ id: 'a1', parentIssueId: 'p1', status: 'done' });
    insertIssue({ id: 'b1', parentIssueId: 'p2', status: 'done' });

    const { propagateChildDoneBatch } = await importSubject();
    const out = await propagateChildDoneBatch([
      { issueId: 'a1', parentIssueId: 'p1', prevStatus: 'todo', nextStatus: 'done' },
      { issueId: 'b1', parentIssueId: 'p2', prevStatus: 'todo', nextStatus: 'done' },
    ]);

    expect(out).toHaveLength(2);
    expect(commentsOf('p1')).toHaveLength(1);
    expect(commentsOf('p2')).toHaveLength(1);
    expect(mocks.enqueueAgentRun).toHaveBeenCalledTimes(2);
  });

  it('空输入不做任何事', async () => {
    const { propagateChildDoneBatch } = await importSubject();
    expect(await propagateChildDoneBatch([])).toEqual([]);
    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
  });
});
