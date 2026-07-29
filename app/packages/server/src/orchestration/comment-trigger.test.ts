import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment } from '@ma/shared';

const mocks = vi.hoisted(() => ({
  enqueueAgentRun: vi.fn(),
  recordActivityLog: vi.fn(),
  publish: vi.fn(),
  insertedComment: null as Record<string, unknown> | null,
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: (table: { __table: string }) => ({
        where: () => ({
          get: () =>
            table.__table === 'agents'
              ? { id: 'agent-1', name: 'Worker' }
              : mocks.insertedComment,
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
}));

vi.mock('../db/reshape.js', () => ({
  toComment: (row: unknown) => row,
}));

vi.mock('./event-bus.js', () => ({
  eventBus: { publish: (...args: unknown[]) => mocks.publish(...args) },
}));

vi.mock('./run-service.js', () => ({
  enqueueAgentRun: (...args: unknown[]) => mocks.enqueueAgentRun(...args),
  enqueueLeaderRun: vi.fn(),
}));

vi.mock('../db/squad-loader.js', () => ({
  getSquadLeaderId: vi.fn(),
  loadSquadDetail: vi.fn(),
}));

vi.mock('./activity-logger.js', () => ({
  recordActivityLog: (...args: unknown[]) => mocks.recordActivityLog(...args),
}));

import { triggerFromComment } from './comment-trigger.js';

const comment = {
  id: 'comment-1',
  issueId: 'issue-42',
  type: 'comment',
  authorType: 'member',
  authorId: 'member-1',
  body: 'Please delegate to [@Worker](mention://agent/agent-1)',
  createdAt: '2026-07-29T00:00:00.000Z',
} as Comment;

describe('triggerFromComment mention activity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertedComment = null;
  });

  it('records mention_delegated with the issue and dispatch payload when enqueue creates a run', async () => {
    mocks.enqueueAgentRun.mockResolvedValue({ run: { id: 'run-123456789' } });

    await triggerFromComment(comment);

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
      },
    });
  });

  it('does not record mention_delegated when enqueue does not create a run', async () => {
    mocks.enqueueAgentRun.mockResolvedValue({
      run: null,
      detail: 'an active run already exists',
    });

    await triggerFromComment(comment);

    expect(mocks.recordActivityLog).not.toHaveBeenCalled();
  });
});
