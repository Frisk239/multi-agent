import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { draftKey } from '@/lib/draft-storage';

const createMutate = vi.fn();

vi.mock('@/lib/api', () => ({
  useAgents: () => ({ data: [] }),
  useSquads: () => ({ data: [] }),
  useCreateComment: () => ({
    mutate: createMutate,
    isPending: false,
    isError: false,
  }),
  useUploadAttachment: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('./MarkdownBody', () => ({
  MarkdownBody: ({ source }: { source: string }) => <div>{source}</div>,
}));

import { CommentComposer } from './CommentComposer';

describe('CommentComposer reply mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('shows the target, sends parentCommentId, and leaves reply mode through success callback', async () => {
    const onCancelReply = vi.fn();
    const onReplySuccess = vi.fn();
    window.localStorage.setItem(draftKey.comment('iss-1'), '根评论草稿');
    window.localStorage.setItem(
      draftKey.commentReply('iss-1', 'root-1'),
      '回复草稿',
    );

    render(
      <CommentComposer
        issueId="iss-1"
        parentCommentId="root-1"
        replyTo={{ id: 'root-1', authorLabel: 'Ada' }}
        onCancelReply={onCancelReply}
        onReplySuccess={onReplySuccess}
      />,
    );

    expect(screen.getByTestId('composer-reply-target')).toHaveTextContent('回复 @Ada');
    await waitFor(() => {
      expect(screen.getByTestId('comment-composer-textarea')).toHaveValue('回复草稿');
    });
    // 回复草稿从独立 key 恢复，根评论草稿不被覆盖。
    expect(window.localStorage.getItem(draftKey.comment('iss-1'))).toBe('根评论草稿');

    fireEvent.change(screen.getByTestId('comment-composer-textarea'), {
      target: { value: '这是一条回复' },
    });
    fireEvent.click(screen.getByTestId('comment-submit-btn'));

    expect(createMutate).toHaveBeenCalledWith(
      { body: '这是一条回复', parentCommentId: 'root-1' },
      expect.any(Object),
    );
    const options = createMutate.mock.calls[0][1] as { onSuccess: () => void };
    options.onSuccess();
    expect(onReplySuccess).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(draftKey.commentReply('iss-1', 'root-1'))).toBeNull();
    expect(window.localStorage.getItem(draftKey.comment('iss-1'))).toBe('根评论草稿');

    fireEvent.click(screen.getByTestId('composer-reply-cancel'));
    expect(onCancelReply).toHaveBeenCalledTimes(1);
  });
});
