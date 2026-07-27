import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('./toast', () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

import {
  useBulkUpdateIssueStatus,
  useBulkUpdateIssueAssignee,
  useBulkDeleteIssues,
} from './api';

function wrap() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('bulk issue mutations toast (Slice 55)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('useBulkUpdateIssueStatus toasts success with count', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, updatedCount: 3 }),
    });
    const { result } = renderHook(() => useBulkUpdateIssueStatus(), {
      wrapper: wrap(),
    });

    await act(async () => {
      result.current.mutate({ issueIds: ['a', 'b', 'c'], status: 'todo' });
    });

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('已更新 3 项状态');
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('useBulkUpdateIssueStatus toasts error on failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
      text: async () => 'boom',
    });
    const { result } = renderHook(() => useBulkUpdateIssueStatus(), {
      wrapper: wrap(),
    });

    await act(async () => {
      result.current.mutate({ issueIds: ['a'], status: 'done' });
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    const msg = String(toastError.mock.calls[0]?.[0] ?? '');
    expect(msg.length).toBeGreaterThan(0);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('useBulkUpdateIssueAssignee toasts success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, updatedCount: 2 }),
    });
    const { result } = renderHook(() => useBulkUpdateIssueAssignee(), {
      wrapper: wrap(),
    });

    await act(async () => {
      result.current.mutate({
        issueIds: ['a', 'b'],
        assigneeType: null,
        assigneeId: null,
      });
    });

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('已更新 2 项指派');
    });
  });

  it('useBulkDeleteIssues toasts success and error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, deletedCount: 1 }),
    });
    const { result } = renderHook(() => useBulkDeleteIssues(), {
      wrapper: wrap(),
    });

    await act(async () => {
      result.current.mutate({ issueIds: ['x'] });
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('已删除 1 项');
    });

    toastSuccess.mockClear();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'nope' }),
      text: async () => 'nope',
    });
    await act(async () => {
      result.current.mutate({ issueIds: ['y'] });
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
  });
});
