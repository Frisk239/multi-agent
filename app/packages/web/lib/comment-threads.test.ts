import { describe, expect, it } from 'vitest';
import type { Comment } from '@ma/shared';
import {
  groupCommentThreads,
  hasCollapsibleThreadReplies,
  visibleThreadReplies,
} from './comment-threads';

function comment(
  partial: Partial<Comment> & Pick<Comment, 'id' | 'createdAt'>,
): Comment {
  return {
    issueId: 'iss-1',
    type: 'comment',
    authorType: 'member',
    authorId: 'member-1',
    authorLabel: '成员',
    body: '正文',
    parentCommentId: null,
    resolvedAt: null,
    resolutionCommentId: null,
    ...partial,
  };
}

describe('groupCommentThreads', () => {
  it('groups only direct normal-comment replies and leaves status / orphan items flat', () => {
    const root = comment({ id: 'root', createdAt: '2026-08-19T00:00:00.000Z' });
    const reply = comment({
      id: 'reply',
      parentCommentId: root.id,
      createdAt: '2026-08-19T00:01:00.000Z',
    });
    const status = comment({
      id: 'status',
      type: 'status_change',
      body: JSON.stringify({ from: 'todo', to: 'in_progress' }),
      createdAt: '2026-08-19T00:02:00.000Z',
    });
    const nested = comment({
      id: 'nested',
      parentCommentId: reply.id,
      createdAt: '2026-08-19T00:03:00.000Z',
    });
    const orphan = comment({
      id: 'orphan',
      parentCommentId: 'missing-root',
      createdAt: '2026-08-19T00:04:00.000Z',
    });

    const grouped = groupCommentThreads([root, reply, status, nested, orphan]);

    expect(grouped.map((entry) => (entry.kind === 'thread' ? entry.root.id : entry.item.id))).toEqual([
      'root',
      'status',
      'nested',
      'orphan',
    ]);
    expect(grouped[0]).toMatchObject({
      kind: 'thread',
      root: { id: 'root' },
      replies: [{ id: 'reply' }],
    });
  });

  it('defaults a resolved thread to its resolution reply and can expose all replies', () => {
    const root = comment({
      id: 'root',
      createdAt: '2026-08-19T00:00:00.000Z',
      resolvedAt: '2026-08-19T00:03:00.000Z',
      resolutionCommentId: 'reply-2',
    });
    const replies = [
      comment({ id: 'reply-1', parentCommentId: root.id, createdAt: '2026-08-19T00:01:00.000Z' }),
      comment({ id: 'reply-2', parentCommentId: root.id, createdAt: '2026-08-19T00:02:00.000Z' }),
      comment({ id: 'reply-3', parentCommentId: root.id, createdAt: '2026-08-19T00:03:00.000Z' }),
    ];

    expect(visibleThreadReplies(root, replies, false).map((reply) => reply.id)).toEqual(['reply-2']);
    expect(visibleThreadReplies(root, replies, true).map((reply) => reply.id)).toEqual([
      'reply-1',
      'reply-2',
      'reply-3',
    ]);
    expect(hasCollapsibleThreadReplies(root, replies)).toBe(true);
  });

  it('keeps all replies visible when a stale resolution reference is absent', () => {
    const root = comment({
      id: 'root',
      createdAt: '2026-08-19T00:00:00.000Z',
      resolvedAt: '2026-08-19T00:03:00.000Z',
      resolutionCommentId: 'gone',
    });
    const replies = [
      comment({ id: 'reply-1', parentCommentId: root.id, createdAt: '2026-08-19T00:01:00.000Z' }),
    ];

    expect(visibleThreadReplies(root, replies, false).map((reply) => reply.id)).toEqual(['reply-1']);
    expect(hasCollapsibleThreadReplies(root, replies)).toBe(false);
  });
});
