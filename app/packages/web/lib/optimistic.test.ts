import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Issue, PaginatedResponse } from '@ma/shared';
import {
  mapIssueRows,
  removeIssueRows,
  snapshotQueries,
  rollbackQueries,
  optimisticOnMutate,
} from './optimistic';
import { useUpdateIssue } from './api';

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('./toast', () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

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

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe('mapIssueRows（行级 patch，兼容三种缓存形状）', () => {
  it('patches rows in PaginatedResponse envelope, preserving envelope fields', () => {
    const list = makeEnv([makeIssue('a'), makeIssue('b')]);
    const out = mapIssueRows(list, (row) =>
      row.id === 'a' ? { ...row, status: 'done' as const } : row,
    ) as PaginatedResponse<Issue>;
    expect(out.data[0].status).toBe('done');
    expect(out.data[1].status).toBe('todo');
    expect(out.total).toBe(2);
    // 原对象不可变（新引用）
    expect(out).not.toBe(list);
    expect(list.data[0].status).toBe('todo');
  });

  it('patches rows in plain array shape (ws.ts 精确 key 的形状)', () => {
    const arr = [makeIssue('a'), makeIssue('b')];
    const out = mapIssueRows(arr, (row) =>
      row.id === 'b' ? { ...row, priority: 'high' as const } : row,
    ) as Issue[];
    expect(out[1].priority).toBe('high');
    expect(out[0].priority).toBe('none');
  });

  it('patches a single Issue entity (详情 key 的形状)', () => {
    const ent = makeIssue('a');
    const out = mapIssueRows(ent, (row) => ({ ...row, title: '改' })) as Issue;
    expect(out.title).toBe('改');
    expect(ent.title).not.toBe('改');
  });

  it('passes undefined / null through unchanged (无缓存 no-op)', () => {
    const fn = vi.fn();
    expect(mapIssueRows(undefined, fn)).toBeUndefined();
    expect(mapIssueRows(null, fn)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('removeIssueRows（行级删除）', () => {
  it('filters ids from envelope and array shapes', () => {
    const ids = new Set(['a']);
    const env = makeEnv([makeIssue('a'), makeIssue('b')]);
    const outEnv = removeIssueRows(env, ids) as PaginatedResponse<Issue>;
    expect(outEnv.data.map((i) => i.id)).toEqual(['b']);
    expect(outEnv.total).toBe(2); // 信封计数保持原样，refetch 后校准

    const arr = [makeIssue('a'), makeIssue('b'), makeIssue('c')];
    const outArr = removeIssueRows(arr, ids) as Issue[];
    expect(outArr.map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('passes single entity through untouched (详情删除走 removeQueries)', () => {
    const ent = makeIssue('a');
    expect(removeIssueRows(ent, new Set(['a']))).toBe(ent);
    expect(removeIssueRows(undefined, new Set(['a']))).toBeUndefined();
  });
});

describe('snapshotQueries / rollbackQueries（多 key 快照隔离）', () => {
  it('restores only the snapshotted caches; unrelated caches untouched', () => {
    const qc = newClient();
    qc.setQueryData(['issues', 'todo'], makeEnv([makeIssue('a')]));
    qc.setQueryData(['issues', 'q'], makeEnv([makeIssue('a')]));
    qc.setQueryData(['issue', 'a'], makeIssue('a'));
    qc.setQueryData(['labels'], [{ id: 'l1' }]);

    const snapshot = snapshotQueries(qc, [['issues'], ['issue', 'a']]);
    expect(snapshot.size).toBe(3);

    // 外部改动：两个列表 + 实体被 patch，labels 也被外部改（但未被快照）
    const patch = (old: unknown) =>
      mapIssueRows(old, (row: Issue) =>
        row.id === 'a' ? { ...row, status: 'done' as const } : row,
      );
    qc.setQueriesData({ queryKey: ['issues'] }, patch);
    qc.setQueriesData({ queryKey: ['issue', 'a'] }, patch);
    qc.setQueryData(['labels'], [{ id: 'l1', name: 'x' }]);

    rollbackQueries(qc, snapshot);

    // 快照内的三个 key 全部还原
    expect((qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[0].status).toBe('todo');
    expect((qc.getQueryData(['issues', 'q']) as PaginatedResponse<Issue>).data[0].status).toBe('todo');
    expect((qc.getQueryData(['issue', 'a']) as Issue).status).toBe('todo');
    // 未快照的 labels 保持外部修改（互不干扰）
    expect(qc.getQueryData(['labels'])).toEqual([{ id: 'l1', name: 'x' }]);
  });

  it('does not snapshot keys without data (pending 查询不回滚也不误建缓存)', () => {
    const qc = newClient();
    qc.setQueryData(['issues', 'todo'], makeEnv([makeIssue('a')]));
    const snapshot = snapshotQueries(qc, [['issues'], ['labels']]);
    expect(snapshot.size).toBe(1);
    rollbackQueries(qc, snapshot);
    expect(qc.getQueryData(['labels'])).toBeUndefined();
  });
});

describe('optimisticOnMutate（cancel → 快照 → patch → 回滚 全流程）', () => {
  it('patches all fuzzy list variants, and rollback restores them all', async () => {
    const qc = newClient();
    qc.setQueryData(['issues', 'todo'], makeEnv([makeIssue('a'), makeIssue('b')]));
    qc.setQueryData(['issues', 'q'], makeEnv([makeIssue('a')]));

    const ctx = await optimisticOnMutate(
      qc,
      { id: 'a', status: 'done' },
      {
        queryKeys: () => [['issues']],
        apply: (vars, old) =>
          mapIssueRows(old, (row: Issue) =>
            row.id === vars.id ? { ...row, status: vars.status as Issue['status'] } : row,
          ),
      },
    );

    expect((qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[0].status).toBe('done');
    expect((qc.getQueryData(['issues', 'q']) as PaginatedResponse<Issue>).data[0].status).toBe('done');
    expect(ctx.snapshot.size).toBe(2);

    rollbackQueries(qc, ctx.snapshot);
    expect((qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[0].status).toBe('todo');
    expect((qc.getQueryData(['issues', 'q']) as PaginatedResponse<Issue>).data[0].status).toBe('todo');
  });
});

describe('useUpdateIssue 乐观接入（真实接入点：状态改 / 指派）', () => {
  const fetchMock = vi.fn();
  let qc: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);

  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    qc = newClient();
    // 与真实 board 相同：['issues', ...] 前缀的筛选列表 + ['issue', id] 详情
    qc.setQueryData(['issues', 'todo'], makeEnv([makeIssue('a'), makeIssue('b')]));
    qc.setQueryData(['issue', 'a'], makeIssue('a'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('状态改：列表与详情在请求返回前即被乐观 patch', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const { result } = renderHook(() => useUpdateIssue(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'a', input: { status: 'done' } });
    });

    // 网络尚未返回，缓存已乐观更新（列表 + 详情）
    await waitFor(() => {
      expect((qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[0].status).toBe('done');
      expect((qc.getQueryData(['issue', 'a']) as Issue).status).toBe('done');
    });

    // server 返回全量 Issue → onSuccess 落地
    const serverIssue = makeIssue('a', { status: 'done', updatedAt: '2026-02-01T00:00:00.000Z' });
    await act(async () => {
      resolveFetch({ ok: true, json: async () => serverIssue });
    });
    await waitFor(() => {
      expect((qc.getQueryData(['issue', 'a']) as Issue).updatedAt).toBe('2026-02-01T00:00:00.000Z');
    });
  });

  it('状态改失败：列表与详情回滚 + toast「已还原」', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const { result } = renderHook(() => useUpdateIssue(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'a', input: { status: 'blocked' } });
    });
    await waitFor(() => {
      expect((qc.getQueryData(['issue', 'a']) as Issue).status).toBe('blocked');
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
    // 回滚可见：列表 + 详情都还原
    expect((qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[0].status).toBe('todo');
    expect((qc.getQueryData(['issue', 'a']) as Issue).status).toBe('todo');
    expect(String(toastError.mock.calls[0]?.[0] ?? '')).toContain('已还原');
  });

  it('指派：乐观只 patch {type,id} + label 占位，成功后 label 由 server 回填', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const { result } = renderHook(() => useUpdateIssue(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'a', input: { assignee: { type: 'agent', id: 'agt-1' } } });
    });

    await waitFor(() => {
      const row = (qc.getQueryData(['issues', 'todo']) as PaginatedResponse<Issue>).data[0];
      expect(row.assignee).toEqual({ type: 'agent', id: 'agt-1', label: '' });
    });

    // server 响应带完整 label → 详情落地（label 以 server 为准）
    const serverIssue = makeIssue('a', { assignee: { type: 'agent', id: 'agt-1', label: 'Agent A' } });
    await act(async () => {
      resolveFetch({ ok: true, json: async () => serverIssue });
    });
    await waitFor(() => {
      expect((qc.getQueryData(['issue', 'a']) as Issue).assignee?.label).toBe('Agent A');
    });
  });
});
