import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Comment } from '@ma/shared';
import React from 'react';

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../toast', () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

import {
  useResolveCommentThread,
  useUnresolveCommentThread,
} from './issues';

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

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe('comment thread resolution mutations', () => {
  const fetchMock = vi.fn();
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    qc = newClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolve patches the comments cache and confirms with a toast', async () => {
    const root = comment({ id: 'root', createdAt: '2026-08-19T00:00:00.000Z' });
    qc.setQueryData(['comments', 'iss-1'], [root]);
    const resolvedRoot = {
      ...root,
      resolvedAt: '2026-08-19T00:01:00.000Z',
      resolutionCommentId: 'reply-2',
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, comment: resolvedRoot }),
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useResolveCommentThread('iss-1'), { wrapper });

    act(() => {
      result.current.mutate(root.id);
    });

    await waitFor(() => {
      expect(qc.getQueryData<Comment[]>(['comments', 'iss-1'])?.[0]).toMatchObject({
        resolvedAt: resolvedRoot.resolvedAt,
        resolutionCommentId: 'reply-2',
      });
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/comments/root/resolve');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
    expect(toastSuccess).toHaveBeenCalledWith('已将最后回复设为结论');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('unresolve restores the root cache and confirms recovery with a toast', async () => {
    const root = comment({
      id: 'root',
      createdAt: '2026-08-19T00:00:00.000Z',
      resolvedAt: '2026-08-19T00:01:00.000Z',
      resolutionCommentId: 'reply-2',
    });
    qc.setQueryData(['comments', 'iss-1'], [root]);
    const unresolvedRoot = {
      ...root,
      resolvedAt: null,
      resolutionCommentId: null,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, comment: unresolvedRoot }),
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUnresolveCommentThread('iss-1'), { wrapper });

    act(() => {
      result.current.mutate(root.id);
    });

    await waitFor(() => {
      expect(qc.getQueryData<Comment[]>(['comments', 'iss-1'])?.[0]).toMatchObject({
        resolvedAt: null,
        resolutionCommentId: null,
      });
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/comments/root/unresolve');
    expect(toastSuccess).toHaveBeenCalledWith('已撤销定论');
    expect(toastError).not.toHaveBeenCalled();
  });
});
