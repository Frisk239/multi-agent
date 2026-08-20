import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Issue, PaginatedResponse } from '@ma/shared';

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

  it('useBulkUpdateIssueAssignee distinguishes assignment changes from queued work', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        updatedCount: 2,
        enqueuedCount: 2,
        skippedCount: 0,
        notApplicableCount: 0,
        results: [
          { issueId: 'a', enqueue: { status: 'queued', runId: 'run-a' } },
          { issueId: 'b', enqueue: { status: 'queued', runId: 'run-b' } },
        ],
        skipped: [],
      }),
    });
    const { result } = renderHook(() => useBulkUpdateIssueAssignee(), {
      wrapper: wrap(),
    });

    await act(async () => {
      result.current.mutate({
        issueIds: ['a', 'b'],
        assigneeType: 'agent',
        assigneeId: 'agt-1',
      });
    });

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('已更改 2 项指派，已入队 2 项');
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('useBulkUpdateIssueAssignee preserves a truthful skip reason in a separate toast', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        updatedCount: 2,
        enqueuedCount: 1,
        skippedCount: 1,
        notApplicableCount: 0,
        results: [
          { issueId: 'a', enqueue: { status: 'queued', runId: 'run-a' } },
          {
            issueId: 'b',
            enqueue: {
              status: 'skipped',
              reason: 'already_active',
              detail: '已有进行中的 run',
            },
          },
        ],
        skipped: [
          {
            issueId: 'b',
            reason: 'already_active',
            detail: '已有进行中的 run',
          },
        ],
      }),
    });
    const { result } = renderHook(() => useBulkUpdateIssueAssignee(), {
      wrapper: wrap(),
    });

    await act(async () => {
      result.current.mutate({
        issueIds: ['a', 'b'],
        assigneeType: 'agent',
        assigneeId: 'agt-1',
      });
    });

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('已更改 2 项指派，已入队 1 项');
      expect(toastError).toHaveBeenCalledWith(
        '1 项未启动：已有进行中的 run',
        expect.objectContaining({ action: { label: '查看 Issue', href: '/issues/b' } }),
      );
    });
  });

  it('useBulkUpdateIssueAssignee says unassign created no new run without implying cancellation', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        updatedCount: 1,
        enqueuedCount: 0,
        skippedCount: 0,
        notApplicableCount: 1,
        results: [{ issueId: 'a', enqueue: { status: 'not_applicable' } }],
        skipped: [],
      }),
    });
    const { result } = renderHook(() => useBulkUpdateIssueAssignee(), {
      wrapper: wrap(),
    });

    await act(async () => {
      result.current.mutate({
        issueIds: ['a'],
        assigneeType: null,
        assigneeId: null,
      });
    });

    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith(
        '已更改 1 项指派，1 项未创建新 run（未指派或无需派发）',
      );
    });
    expect(toastError).not.toHaveBeenCalled();
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

// ───────────── W2：乐观更新接入（缓存 patch / 回滚 / 「已还原」toast）─────────────

function makeIssue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    workspaceId: 'ws-1',
    identifier: `FRI-${id}`,
    title: `title ${id}`,
    description: null,
    status: 'todo',
    priority: 'none',
    assignee: null,
    creatorType: 'member',
    creatorId: 'u-1',
    position: 0,
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEnv(data: Issue[]): PaginatedResponse<Issue> {
  return { data, total: data.length, limit: 50, offset: 0 };
}

function makeHarness() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  // 与真实 board 相同：多个 ['issues', ...] 前缀筛选列表变体
  qc.setQueryData(['issues', 'todo'], makeEnv([makeIssue('a'), makeIssue('b')]));
  qc.setQueryData(['issues', 'q'], makeEnv([makeIssue('a')]));
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

describe('bulk issue mutations 乐观更新 (W2)', () => {
  const fetchMock = vi.fn();
  let qc: QueryClient;
  let wrapper: (p: { children: React.ReactNode }) => React.ReactElement;

  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    const h = makeHarness();
    qc = h.qc;
    wrapper = h.wrapper;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function deferFetch() {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );
    return (v: unknown) => resolveFetch(v);
  }

  it('useBulkUpdateIssueStatus：请求返回前所有列表变体即被 patch', async () => {
    const resolveFetch = deferFetch();
    const { result } = renderHook(() => useBulkUpdateIssueStatus(), { wrapper });
    act(() => {
      result.current.mutate({ issueIds: ['a'], status: 'done' });
    });

    await waitFor(() => {
      expect(
        (qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[0].status,
      ).toBe('done');
      expect(
        (qc.getQueryData(['issues', 'q']) as PaginatedResponse<Issue>).data[0].status,
      ).toBe('done');
      // 未选中的行不动
      expect(
        (qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[1].status,
      ).toBe('todo');
    });

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true, updatedCount: 1 }) });
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('已更新 1 项状态');
    });
  });

  it('useBulkUpdateIssueStatus：失败回滚 + toast「已还原」', async () => {
    const resolveFetch = deferFetch();
    const { result } = renderHook(() => useBulkUpdateIssueStatus(), { wrapper });
    act(() => {
      result.current.mutate({ issueIds: ['a'], status: 'blocked' });
    });
    await waitFor(() => {
      expect(
        (qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[0].status,
      ).toBe('blocked');
    });

    await act(async () => {
      resolveFetch({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
        text: async () => 'boom',
      });
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    // 回滚可见：所有变体还原
    expect(
      (qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[0].status,
    ).toBe('todo');
    expect(
      (qc.getQueryData(['issues', 'q']) as PaginatedResponse<Issue>).data[0].status,
    ).toBe('todo');
    expect(String(toastError.mock.calls[0]?.[0] ?? '')).toContain('已还原');
  });

  it('useBulkUpdateIssueAssignee：乐观指派只带 {type,id} + label 占位；失败回滚', async () => {
    const resolveFetch = deferFetch();
    const { result } = renderHook(() => useBulkUpdateIssueAssignee(), { wrapper });
    act(() => {
      result.current.mutate({
        issueIds: ['a', 'b'],
        assigneeType: 'agent',
        assigneeId: 'agt-1',
      });
    });

    await waitFor(() => {
      const row = (qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[0];
      expect(row.assignee).toEqual({ type: 'agent', id: 'agt-1', label: '' });
    });

    await act(async () => {
      resolveFetch({
        ok: false,
        status: 400,
        json: async () => ({ error: 'nope' }),
        text: async () => 'nope',
      });
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    const rows = (qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data;
    expect(rows[0].assignee).toBeNull();
    expect(rows[1].assignee).toBeNull();
    expect(String(toastError.mock.calls[0]?.[0] ?? '')).toContain('已还原');
  });

  it('useBulkDeleteIssues：请求返回前行即被移除，详情缓存同步清除', async () => {
    qc.setQueryData(['issue', 'a'], makeIssue('a'));
    qc.setQueryData(['comments', 'a'], []);
    const resolveFetch = deferFetch();
    const { result } = renderHook(() => useBulkDeleteIssues(), { wrapper });
    act(() => {
      result.current.mutate({ issueIds: ['a'] });
    });

    await waitFor(() => {
      expect(
        (qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data.map((i) => i.id),
      ).toEqual(['b']);
      expect(
        (qc.getQueryData(['issues', 'q']) as PaginatedResponse<Issue>).data.map((i) => i.id),
      ).toEqual([]);
      // afterMutate：详情/评论缓存移除
      expect(qc.getQueryData(['issue', 'a'])).toBeUndefined();
      expect(qc.getQueryData(['comments', 'a'])).toBeUndefined();
    });

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true, deletedCount: 1 }) });
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('已删除 1 项');
    });
  });

  it('useBulkDeleteIssues：失败回滚（列表还原；详情重新挂载即 refetch）', async () => {
    const resolveFetch = deferFetch();
    const { result } = renderHook(() => useBulkDeleteIssues(), { wrapper });
    act(() => {
      result.current.mutate({ issueIds: ['a'] });
    });
    await waitFor(() => {
      expect(
        (qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data.map((i) => i.id),
      ).toEqual(['b']);
    });

    await act(async () => {
      resolveFetch({
        ok: false,
        status: 500,
        json: async () => ({ error: 'boom' }),
        text: async () => 'boom',
      });
    });
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(
      (qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data.map((i) => i.id),
    ).toEqual(['a', 'b']);
    expect(
      (qc.getQueryData(['issues', 'q']) as PaginatedResponse<Issue>).data.map((i) => i.id),
    ).toEqual(['a']);
    expect(String(toastError.mock.calls[0]?.[0] ?? '')).toContain('已还原');
  });
});
