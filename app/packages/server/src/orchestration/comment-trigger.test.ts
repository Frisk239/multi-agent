import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment } from '@ma/shared';

const mocks = vi.hoisted(() => ({
  enqueueAgentRun: vi.fn(),
  enqueueLeaderRun: vi.fn(),
  getSquadLeaderId: vi.fn(),
  loadSquadDetail: vi.fn(),
  recordActivityLog: vi.fn(),
  publish: vi.fn(),
  insertedComment: null as Record<string, unknown> | null,
  issueRow: null as Record<string, unknown> | null,
  parentRow: null as Record<string, unknown> | null,
  agentRow: null as Record<string, unknown> | null,
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: (table: { __table: string }) => ({
        where: () => ({
          get: () => {
            if (table.__table === 'agents') return mocks.agentRow;
            if (table.__table === 'issues') return mocks.issueRow;
            if (table.__table === 'comments') return mocks.parentRow;
            return mocks.insertedComment;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        run: () => {
          mocks.insertedComment = row;
        },
      }),
    }),
  },
}));

vi.mock('../db/schema.js', () => ({
  agents: { __table: 'agents', id: 'id' },
  comments: { __table: 'comments', id: 'id' },
  issues: { __table: 'issues', id: 'id' },
}));

vi.mock('../db/reshape.js', () => ({
  toComment: (row: unknown) => row,
}));

vi.mock('./event-bus.js', () => ({
  eventBus: { publish: (...args: unknown[]) => mocks.publish(...args) },
}));

vi.mock('./run-service.js', () => ({
  enqueueAgentRun: (...args: unknown[]) => mocks.enqueueAgentRun(...args),
  enqueueLeaderRun: (...args: unknown[]) => mocks.enqueueLeaderRun(...args),
}));

vi.mock('../db/squad-loader.js', () => ({
  getSquadLeaderId: (...args: unknown[]) => mocks.getSquadLeaderId(...args),
  loadSquadDetail: (...args: unknown[]) => mocks.loadSquadDetail(...args),
}));

vi.mock('./activity-logger.js', () => ({
  recordActivityLog: (...args: unknown[]) => mocks.recordActivityLog(...args),
}));

import { triggerFromComment } from './comment-trigger.js';

const mentionComment = {
  id: 'comment-1',
  issueId: 'issue-42',
  type: 'comment',
  authorType: 'member',
  authorId: 'member-1',
  body: 'Please delegate to [@Worker](mention://agent/agent-1)',
  createdAt: '2026-07-29T00:00:00.000Z',
} as Comment;

function plainComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment-1',
    issueId: 'issue-42',
    type: 'comment',
    authorType: 'member',
    authorId: 'member-1',
    body: '普通评论，无 mention',
    createdAt: '2026-07-29T00:00:00.000Z',
    ...overrides,
  } as Comment;
}

describe('triggerFromComment mention activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertedComment = null;
    mocks.issueRow = null;
    mocks.parentRow = null;
    mocks.agentRow = null;
    mocks.getSquadLeaderId.mockReturnValue(null);
  });

  // —— 既有 mention 行为不回归（B1+B2 后 source 显式标记为 mention）——

  it('records mention_delegated with the issue and dispatch payload when enqueue creates a run', async () => {
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-123456789' } });

    await triggerFromComment(mentionComment);

    expect(mocks.recordActivityLog).toHaveBeenCalledTimes(1);
    expect(mocks.recordActivityLog).toHaveBeenCalledWith({
      issueId: 'issue-42',
      actorType: 'system',
      actorId: null,
      eventType: 'mention_delegated',
      payload: {
        targetId: 'agent-1',
        targetKind: 'agent',
        runId: 'run-123456789',
        source: 'mention',
      },
    });
    expect(mocks.enqueueAgentRun).toHaveBeenCalledWith('issue-42', 'agent-1');
  });

  it('does not record mention_delegated when enqueue does not create a run', async () => {
    mocks.enqueueAgentRun.mockResolvedValue({
      run: null,
      detail: 'an active run already exists',
    });

    const res = await triggerFromComment(mentionComment);

    expect(mocks.recordActivityLog).not.toHaveBeenCalled();
    expect(res[0]).toMatchObject({ runId: null, source: 'mention' });
  });

  it('mention summary keeps the @提及派发 header', async () => {
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-123456789' } });

    await triggerFromComment(mentionComment);

    expect(mocks.insertedComment?.body).toContain('📣 **@提及派发**');
  });

  // —— B1：issue_assignee fallback（member 无 mention 评论）——

  it('member plain comment routes to issue assignee agent (source=assignee)', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'agent', assigneeId: 'agent-9' };
    mocks.agentRow = { id: 'agent-9', name: 'Assignee' };
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-abc' } });

    const res = await triggerFromComment(plainComment());

    expect(mocks.enqueueAgentRun).toHaveBeenCalledWith('issue-42', 'agent-9');
    expect(mocks.enqueueLeaderRun).not.toHaveBeenCalled();
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      kind: 'agent',
      targetId: 'agent-9',
      source: 'assignee',
      runId: 'run-abc',
    });
    expect(mocks.recordActivityLog).toHaveBeenCalledWith({
      issueId: 'issue-42',
      actorType: 'system',
      actorId: null,
      eventType: 'mention_delegated',
      payload: {
        targetId: 'agent-9',
        targetKind: 'agent',
        runId: 'run-abc',
        source: 'assignee',
      },
    });
  });

  it('assignee fallback enqueue skipped → dispatch with note, no activity', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'agent', assigneeId: 'agent-9' };
    mocks.enqueueAgentRun.mockResolvedValue({
      run: null,
      detail: 'an active run already exists',
    });

    const res = await triggerFromComment(plainComment());

    expect(res[0]).toMatchObject({ runId: null, source: 'assignee' });
    expect(res[0].note).toContain('active run');
    expect(mocks.recordActivityLog).not.toHaveBeenCalled();
  });

  it('assignee=squad routes to squad leader via enqueueLeaderRun', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'squad', assigneeId: 'squad-7' };
    mocks.getSquadLeaderId.mockReturnValue('agent-leader');
    mocks.enqueueLeaderRun.mockResolvedValue({ run: { id: 'run-lead' } });

    const res = await triggerFromComment(plainComment());

    expect(mocks.getSquadLeaderId).toHaveBeenCalledWith('squad-7');
    expect(mocks.enqueueLeaderRun).toHaveBeenCalledWith('issue-42', 'agent-leader', 'squad-7');
    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
    expect(res[0]).toMatchObject({
      kind: 'squad',
      targetId: 'squad-7',
      source: 'assignee',
      runId: 'run-lead',
    });
  });

  it('assignee=squad without leader → note dispatch, no enqueue', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'squad', assigneeId: 'squad-7' };
    mocks.getSquadLeaderId.mockReturnValue(null);

    const res = await triggerFromComment(plainComment());

    expect(mocks.enqueueLeaderRun).not.toHaveBeenCalled();
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ runId: null, source: 'assignee' });
    expect(res[0].note).toContain('无 leader');
  });

  it('assignee=member or unassigned → no dispatch, no enqueue', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'member', assigneeId: 'member-1' };

    const res = await triggerFromComment(plainComment());

    expect(res).toEqual([]);
    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
    expect(mocks.enqueueLeaderRun).not.toHaveBeenCalled();
    expect(mocks.recordActivityLog).not.toHaveBeenCalled();
    expect(mocks.insertedComment).toBeNull();
  });

  it('assignee fallback summary uses 评论路由 header', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'agent', assigneeId: 'agent-9' };
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-abc' } });

    await triggerFromComment(plainComment());

    expect(mocks.insertedComment?.body).toContain('📣 **评论路由：将任务派给指派人**');
  });

  // —— 有 mention 时 fallback 不叠加 ——

  it('mention present → assignee fallback does NOT stack', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'agent', assigneeId: 'agent-9' };
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-1' } });

    const res = await triggerFromComment(mentionComment);

    // 只 @ 了 agent-1；指派人 agent-9 不叠加
    expect(mocks.enqueueAgentRun).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueAgentRun).toHaveBeenCalledWith('issue-42', 'agent-1');
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ targetId: 'agent-1', source: 'mention' });
    expect(mocks.recordActivityLog).toHaveBeenCalledTimes(1);
  });

  // —— agent 作者评论：默认不参与路由，仅 squad-assigned 窄路径 ——

  it('agent comment on non-squad-assigned issue → no trigger', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'agent', assigneeId: 'agent-9' };

    const res = await triggerFromComment(
      plainComment({ authorType: 'agent', authorId: 'agent-worker' }),
    );

    expect(res).toEqual([]);
    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
    expect(mocks.enqueueLeaderRun).not.toHaveBeenCalled();
    expect(mocks.recordActivityLog).not.toHaveBeenCalled();
    expect(mocks.insertedComment).toBeNull();
  });

  it('agent comment on squad-assigned issue (author≠leader) wakes the leader', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'squad', assigneeId: 'squad-7' };
    mocks.getSquadLeaderId.mockReturnValue('agent-leader');
    mocks.enqueueLeaderRun.mockResolvedValue({ run: { id: 'run-wake' } });

    const res = await triggerFromComment(
      plainComment({ authorType: 'agent', authorId: 'agent-worker' }),
    );

    expect(mocks.enqueueLeaderRun).toHaveBeenCalledWith('issue-42', 'agent-leader', 'squad-7');
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      kind: 'squad',
      targetId: 'squad-7',
      source: 'assignee',
      runId: 'run-wake',
    });
    expect(mocks.recordActivityLog).toHaveBeenCalledWith({
      issueId: 'issue-42',
      actorType: 'system',
      actorId: null,
      eventType: 'mention_delegated',
      payload: {
        targetId: 'squad-7',
        targetKind: 'squad',
        runId: 'run-wake',
        source: 'assignee',
      },
    });
  });

  it('agent comment by the leader on squad-assigned issue → self-trigger guard skips', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'squad', assigneeId: 'squad-7' };
    mocks.getSquadLeaderId.mockReturnValue('agent-leader');

    const res = await triggerFromComment(
      plainComment({ authorType: 'agent', authorId: 'agent-leader' }),
    );

    expect(mocks.enqueueLeaderRun).not.toHaveBeenCalled();
    expect(res).toEqual([]);
    expect(mocks.insertedComment).toBeNull();
  });

  it('agent comment on squad-assigned issue but leader has pending queued → silent, no dispatch', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'squad', assigneeId: 'squad-7' };
    mocks.getSquadLeaderId.mockReturnValue('agent-leader');
    mocks.enqueueLeaderRun.mockResolvedValue({
      run: null,
      detail: 'an active run already exists',
    });

    const res = await triggerFromComment(
      plainComment({ authorType: 'agent', authorId: 'agent-worker' }),
    );

    expect(mocks.enqueueLeaderRun).toHaveBeenCalled();
    expect(res).toEqual([]);
    expect(mocks.insertedComment).toBeNull();
  });

  it('agent comment while leader running → follow-up run is announced (not swallowed as already_active)', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'squad', assigneeId: 'squad-7' };
    mocks.getSquadLeaderId.mockReturnValue('agent-leader');
    mocks.enqueueLeaderRun.mockResolvedValue({ run: { id: 'run-followup' } });

    const res = await triggerFromComment(
      plainComment({ authorType: 'agent', authorId: 'agent-worker' }),
    );

    expect(mocks.enqueueLeaderRun).toHaveBeenCalledWith('issue-42', 'agent-leader', 'squad-7');
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      kind: 'squad',
      runId: 'run-followup',
      source: 'assignee',
    });
    expect(mocks.insertedComment?.body).toContain('📣 **评论路由：将任务派给指派人**');
  });

  // —— B2：thread_parent ——

  it('member reply to an agent comment triggers the parent author (source=thread-parent)', async () => {
    mocks.parentRow = {
      id: 'parent-1',
      issueId: 'issue-42',
      type: 'comment',
      authorType: 'agent',
      authorId: 'agent-parent',
      body: 'done, see summary',
      createdAt: 0,
    };
    mocks.agentRow = { id: 'agent-parent', name: 'Parent Agent' };
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-thread' } });

    const res = await triggerFromComment(
      plainComment({ id: 'reply-1', parentCommentId: 'parent-1', body: '收到，继续' }),
    );

    expect(mocks.enqueueAgentRun).toHaveBeenCalledWith('issue-42', 'agent-parent');
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      kind: 'agent',
      targetId: 'agent-parent',
      targetLabel: 'Parent Agent',
      source: 'thread-parent',
      runId: 'run-thread',
    });
    expect(mocks.recordActivityLog).toHaveBeenCalledWith({
      issueId: 'issue-42',
      actorType: 'system',
      actorId: null,
      eventType: 'mention_delegated',
      payload: {
        targetId: 'agent-parent',
        targetKind: 'agent',
        runId: 'run-thread',
        source: 'thread-parent',
      },
    });
    expect(mocks.insertedComment?.body).toContain('📣 **评论路由：回复将唤醒**');
  });

  it('member reply to agent comment whose author no longer exists → assignee fallback', async () => {
    mocks.parentRow = {
      id: 'parent-1',
      issueId: 'issue-42',
      type: 'comment',
      authorType: 'agent',
      authorId: 'agent-gone',
      body: 'done',
      createdAt: 0,
    };
    mocks.agentRow = null; // 父作者不存在
    mocks.issueRow = { id: 'issue-42', assigneeType: 'agent', assigneeId: 'agent-9' };
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-fb' } });

    const res = await triggerFromComment(
      plainComment({ id: 'reply-1', parentCommentId: 'parent-1' }),
    );

    expect(mocks.enqueueAgentRun).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueAgentRun).toHaveBeenCalledWith('issue-42', 'agent-9');
    expect(res[0]).toMatchObject({ targetId: 'agent-9', source: 'assignee' });
  });

  it('member reply to a non-agent (member) comment → assignee fallback', async () => {
    mocks.parentRow = {
      id: 'parent-1',
      issueId: 'issue-42',
      type: 'comment',
      authorType: 'member',
      authorId: 'member-2',
      body: 'anyone?',
      createdAt: 0,
    };
    mocks.issueRow = { id: 'issue-42', assigneeType: 'squad', assigneeId: 'squad-7' };
    mocks.getSquadLeaderId.mockReturnValue('agent-leader');
    mocks.enqueueLeaderRun.mockResolvedValue({ run: { id: 'run-fb' } });

    const res = await triggerFromComment(
      plainComment({ id: 'reply-1', parentCommentId: 'parent-1' }),
    );

    expect(mocks.enqueueLeaderRun).toHaveBeenCalledWith('issue-42', 'agent-leader', 'squad-7');
    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
    expect(res[0]).toMatchObject({ kind: 'squad', source: 'assignee' });
  });

  it('member reply to archived agent author → assignee fallback (no runtime → no trigger)', async () => {
    mocks.parentRow = {
      id: 'parent-1',
      issueId: 'issue-42',
      type: 'comment',
      authorType: 'agent',
      authorId: 'agent-archived',
      body: 'done',
      createdAt: 0,
    };
    mocks.agentRow = { id: 'agent-archived', name: 'Old', archivedAt: 1750000000000 };
    mocks.issueRow = { id: 'issue-42', assigneeType: 'agent', assigneeId: 'agent-9' };
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-fb' } });

    const res = await triggerFromComment(
      plainComment({ id: 'reply-1', parentCommentId: 'parent-1' }),
    );

    expect(mocks.enqueueAgentRun).toHaveBeenCalledWith('issue-42', 'agent-9');
    expect(res[0]).toMatchObject({ targetId: 'agent-9', source: 'assignee' });
  });

  it('member root comment without parent → assignee fallback', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'agent', assigneeId: 'agent-9' };
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-fb' } });

    const res = await triggerFromComment(plainComment());

    expect(mocks.enqueueAgentRun).toHaveBeenCalledWith('issue-42', 'agent-9');
    expect(res[0]).toMatchObject({ source: 'assignee' });
  });

  // —— W7 invoke gate：mention-only 的 agent 不参与隐式路由 ——

  it('mention-only assignee is NOT woken by comment fallback', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'agent', assigneeId: 'agent-9' };
    mocks.agentRow = { id: 'agent-9', name: 'Quiet', invocationPermission: 'mention-only' };
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-fb' } });

    const res = await triggerFromComment(plainComment());

    expect(mocks.enqueueAgentRun).not.toHaveBeenCalled();
    expect(res).toEqual([]);
  });

  it('mention-only squad leader is NOT woken by squad-assignee fallback', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'squad', assigneeId: 'sqd-1' };
    mocks.getSquadLeaderId.mockReturnValue('agent-9');
    mocks.agentRow = { id: 'agent-9', name: 'Quiet', invocationPermission: 'mention-only' };
    mocks.enqueueLeaderRun.mockResolvedValue({ run: { id: 'run-fb' } });

    const res = await triggerFromComment(plainComment());

    expect(mocks.enqueueLeaderRun).not.toHaveBeenCalled();
    expect(res).toEqual([]);
  });

  it('mention-only leader is NOT woken by agent-authored squad comment', async () => {
    mocks.issueRow = { id: 'issue-42', assigneeType: 'squad', assigneeId: 'sqd-1' };
    mocks.getSquadLeaderId.mockReturnValue('agent-9');
    mocks.agentRow = { id: 'agent-9', name: 'Quiet', invocationPermission: 'mention-only' };
    mocks.enqueueLeaderRun.mockResolvedValue({ run: { id: 'run-fb' } });

    const res = await triggerFromComment(
      plainComment({ id: 'worker-c', authorType: 'agent', authorId: 'agent-worker' }),
    );

    expect(mocks.enqueueLeaderRun).not.toHaveBeenCalled();
    expect(res).toEqual([]);
  });

  it('thread-parent reply still wakes a mention-only parent author (explicit interaction)', async () => {
    mocks.parentRow = {
      id: 'parent-1',
      issueId: 'issue-42',
      type: 'comment',
      authorType: 'agent',
      authorId: 'agent-quiet',
      body: 'done',
      createdAt: 0,
    };
    mocks.agentRow = { id: 'agent-quiet', name: 'Quiet', invocationPermission: 'mention-only' };
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-reply' } });

    const res = await triggerFromComment(
      plainComment({ id: 'reply-1', parentCommentId: 'parent-1' }),
    );

    expect(mocks.enqueueAgentRun).toHaveBeenCalledWith('issue-42', 'agent-quiet');
    expect(res[0]).toMatchObject({ targetId: 'agent-quiet', source: 'thread-parent' });
  });
});
