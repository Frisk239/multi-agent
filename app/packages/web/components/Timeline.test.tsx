import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Comment } from '@ma/shared';
import React from 'react';

vi.mock('./MarkdownBody', () => ({
  MarkdownBody: ({ source }: { source: string }) => <span>{source}</span>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { Timeline } from './Timeline';

afterEach(() => cleanup());

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

describe('Timeline 评论线程', () => {
  it('groups direct replies while leaving status / invalid nested items visible and flat', () => {
    const root = comment({ id: 'root', createdAt: '2026-08-19T00:00:00.000Z' });
    const reply = comment({
      id: 'reply',
      parentCommentId: root.id,
      body: '一层回复',
      createdAt: '2026-08-19T00:01:00.000Z',
    });
    const status = comment({
      id: 'status',
      type: 'status_change',
      body: JSON.stringify({ from: 'todo', to: 'in_progress' }),
      createdAt: '2026-08-19T00:02:00.000Z',
    });
    const invalidNested = comment({
      id: 'nested',
      parentCommentId: reply.id,
      body: '异常的二层项仍可见',
      createdAt: '2026-08-19T00:03:00.000Z',
    });
    const onReply = vi.fn();
    const onResolveThread = vi.fn();

    render(
      <Timeline
        items={[root, reply, status, invalidNested]}
        onReply={onReply}
        onResolveThread={onResolveThread}
      />,
    );

    expect(screen.getByTestId('timeline-thread-root')).toBeTruthy();
    expect(screen.getByTestId('timeline-item-reply')).toHaveAttribute(
      'data-thread-role',
      'reply',
    );
    expect(screen.getByTestId('timeline-item-status')).toHaveTextContent('状态变更');
    expect(screen.getByTestId('timeline-item-nested')).toHaveTextContent('异常的二层项仍可见');

    fireEvent.click(screen.getByTestId('timeline-thread-reply-root'));
    expect(onReply).toHaveBeenCalledWith(root);
    fireEvent.click(screen.getByTestId('timeline-thread-resolve-root'));
    expect(onResolveThread).toHaveBeenCalledWith(root.id);
  });

  it('resolve → collapse/expand → unresolve recovery keeps the correct replies visible', () => {
    const root = comment({ id: 'root', createdAt: '2026-08-19T00:00:00.000Z' });
    const replies = [
      comment({ id: 'reply-1', parentCommentId: root.id, body: '讨论一', createdAt: '2026-08-19T00:01:00.000Z' }),
      comment({ id: 'reply-2', parentCommentId: root.id, body: '最终结论', createdAt: '2026-08-19T00:02:00.000Z' }),
      comment({ id: 'reply-3', parentCommentId: root.id, body: '讨论三', createdAt: '2026-08-19T00:03:00.000Z' }),
    ];
    const onResolveThread = vi.fn();
    const onUnresolveThread = vi.fn();
    const { rerender } = render(
      <Timeline
        items={[root, ...replies]}
        onResolveThread={onResolveThread}
        onUnresolveThread={onUnresolveThread}
      />,
    );

    fireEvent.click(screen.getByTestId('timeline-thread-resolve-root'));
    expect(onResolveThread).toHaveBeenCalledWith(root.id);

    const resolvedRoot = {
      ...root,
      resolvedAt: '2026-08-19T00:04:00.000Z',
      resolutionCommentId: 'reply-2',
    };
    rerender(
      <Timeline
        items={[resolvedRoot, ...replies]}
        onResolveThread={onResolveThread}
        onUnresolveThread={onUnresolveThread}
      />,
    );

    expect(screen.queryByTestId('timeline-item-reply-1')).toBeNull();
    expect(screen.getByTestId('timeline-item-reply-2')).toHaveTextContent('最终结论');
    expect(screen.getByText('结论')).toBeTruthy();
    const toggle = screen.getByTestId('timeline-thread-toggle-root');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('timeline-item-reply-1')).toBeTruthy();
    expect(screen.getByTestId('timeline-item-reply-3')).toBeTruthy();

    // 同一 root 被外部更新为另一条结论时，不能沿用旧结论的展开态。
    const reassignedResolvedRoot = {
      ...resolvedRoot,
      resolutionCommentId: 'reply-3',
    };
    rerender(
      <Timeline
        items={[reassignedResolvedRoot, ...replies]}
        onResolveThread={onResolveThread}
        onUnresolveThread={onUnresolveThread}
      />,
    );
    expect(screen.queryByTestId('timeline-item-reply-1')).toBeNull();
    expect(screen.queryByTestId('timeline-item-reply-2')).toBeNull();
    expect(screen.getByTestId('timeline-item-reply-3')).toBeTruthy();
    expect(screen.getByTestId('timeline-thread-toggle-root')).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    fireEvent.click(screen.getByTestId('timeline-thread-unresolve-root'));
    expect(onUnresolveThread).toHaveBeenCalledWith(root.id);

    rerender(
      <Timeline
        items={[root, ...replies]}
        onResolveThread={onResolveThread}
        onUnresolveThread={onUnresolveThread}
      />,
    );
    expect(screen.getByTestId('timeline-item-reply-1')).toBeTruthy();
    expect(screen.getByTestId('timeline-item-reply-3')).toBeTruthy();
    expect(screen.queryByTestId('timeline-thread-unresolve-root')).toBeNull();
    expect(screen.getByTestId('timeline-thread-resolve-root')).toBeTruthy();
  });
});
