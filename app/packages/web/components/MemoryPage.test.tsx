import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * MemoryPage 组件测试（Memory 项目上下文闭环）
 * Mock next/navigation + @/lib/api hooks（SquadsPage.test.tsx 模式）；
 * queryKey 三态用真实 useMemoryList（@/lib/api/memory）+ mock http 层直测。
 */

const push = vi.fn();
const replace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    // 模拟真实导航：把 URL query 写回 mockSearchParams，组件重渲染后生效
    replace: (url: string, opts?: object) => {
      replace(url, opts);
      const qs = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
      mockSearchParams = new URLSearchParams(qs);
    },
  }),
  usePathname: () => '/memory',
  useSearchParams: () => mockSearchParams,
}));

const createMutateAsync = vi.fn();
const memoryListCalls: Array<{ q: string; scope?: string; projectId?: string | null }> = [];
const memoryData: Array<{
  id: string;
  text: string;
  projectId?: string | null;
}> = [];
const projectsData: Array<{ id: string; title: string }> = [];

vi.mock('@/lib/api', () => ({
  useMemoryStatus: () => ({ data: { provider: 'sqlite-text', available: true } }),
  useSettingsStatus: () => ({ data: { secrets: { embeddingConfigured: true } } }),
  useProjects: () => ({ data: projectsData }),
  useMemoryList: (q: string, scope?: string, projectId?: string | null) => {
    memoryListCalls.push({ q, scope, projectId });
    return {
      data: memoryData,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  },
  useMemoryItem: () => ({
    data: undefined,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateMemory: () => ({
    mutateAsync: createMutateAsync,
    mutate: vi.fn(),
    isPending: false,
  }),
  useDeleteMemory: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteMemoryMany: () => ({ mutate: vi.fn(), isPending: false }),
}));

// 真实 useMemoryList 的 http 层 mock（供 queryKey 三态直测）
vi.mock('@/lib/api/http', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })),
  API: '/api',
  errMessage: (_e: unknown, fb = '') => fb,
  apiError: async (_r: unknown, fb = '') => fb,
}));

import { MemoryPage } from './MemoryPage';
import { useMemoryList } from '@/lib/api/memory';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryPage />
    </QueryClientProvider>,
  );
  return {
    rerender: () =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <MemoryPage />
        </QueryClientProvider>,
      ),
  };
}

/** 真实 useMemoryList 的探针（queryKey 三态测试用） */
function MemoryListProbe({
  q,
  scope,
  projectId,
}: {
  q: string;
  scope?: string;
  projectId?: string | null;
}) {
  useMemoryList(q, scope, projectId);
  return null;
}

describe('MemoryPage 项目上下文', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryListCalls.length = 0;
    memoryData.length = 0;
    projectsData.length = 0;
    mockSearchParams = new URLSearchParams();
    createMutateAsync.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it('useMemoryList 三态 projectId 生成三个独立 queryKey（不串缓存）', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryListProbe q="" projectId={undefined} />
        <MemoryListProbe q="" projectId={null} />
        <MemoryListProbe q="" projectId="prj-1" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(qc.getQueryCache().getAll()).toHaveLength(3));
    const keys = qc
      .getQueryCache()
      .getAll()
      .map((x) => JSON.stringify(x.queryKey))
      .sort();
    expect(keys).toEqual(
      [
        ['memory', '', '', '__all__'],
        ['memory', '', '', '__global__'],
        ['memory', '', '', 'prj-1'],
      ]
        .map((k) => JSON.stringify(k))
        .sort(),
    );
  });

  it('项目筛选下拉含「全部项目/仅全局/各项目名」，默认全量（undefined）', () => {
    projectsData.push(
      { id: 'prj-1', title: '项目一' },
      { id: 'prj-2', title: '项目二' },
    );
    renderPage();
    const select = screen.getByTestId('memory-project-filter') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent);
    expect(options).toEqual(['全部项目', '仅全局', '项目一', '项目二']);
    expect(select.value).toBe('');
    // 默认不传 projectId（undefined = 全量，不是 null）
    expect(memoryListCalls.at(-1)?.projectId).toBeUndefined();
  });

  it('选择项目 → URL 写入 ?project=<id>，列表查询带该项目', () => {
    projectsData.push({ id: 'prj-1', title: '项目一' });
    const { rerender } = renderPage();
    fireEvent.change(screen.getByTestId('memory-project-filter'), {
      target: { value: 'prj-1' },
    });
    const url = replace.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain('project=prj-1');
    expect(mockSearchParams.get('project')).toBe('prj-1');
    rerender();
    expect(memoryListCalls.at(-1)?.projectId).toBe('prj-1');
  });

  it('选择「仅全局」→ URL 写空值参数 project=，hook 收到 null', () => {
    projectsData.push({ id: 'prj-1', title: '项目一' });
    const { rerender } = renderPage();
    fireEvent.change(screen.getByTestId('memory-project-filter'), {
      target: { value: '__global__' },
    });
    const url = replace.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain('project=');
    expect(url).not.toContain('project=prj');
    expect(mockSearchParams.has('project')).toBe(true);
    expect(mockSearchParams.get('project')).toBe('');
    rerender();
    expect(memoryListCalls.at(-1)?.projectId).toBeNull();
  });

  it('切回「全部项目」→ URL 移除 project 参数，hook 回到 undefined', () => {
    mockSearchParams = new URLSearchParams('project=prj-1');
    projectsData.push({ id: 'prj-1', title: '项目一' });
    const { rerender } = renderPage();
    const select = screen.getByTestId('memory-project-filter') as HTMLSelectElement;
    expect(select.value).toBe('prj-1');
    fireEvent.change(select, { target: { value: '' } });
    const url = replace.mock.calls.at(-1)?.[0] as string;
    expect(url).not.toContain('project=');
    expect(mockSearchParams.has('project')).toBe(false);
    rerender();
    expect(memoryListCalls.at(-1)?.projectId).toBeUndefined();
  });

  it('URL 直达 project=prj-1 → 行内显示项目名并回链 /projects/prj-1', () => {
    mockSearchParams = new URLSearchParams('project=prj-1');
    projectsData.push({ id: 'prj-1', title: '项目一' });
    memoryData.push({ id: 'mem-1', text: '项目经验', projectId: 'prj-1' });
    renderPage();
    expect(memoryListCalls.at(-1)?.projectId).toBe('prj-1');
    const links = screen.getAllByTestId('memory-project-link');
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0].getAttribute('href')).toBe('/projects/prj-1');
    expect(links[0].textContent).toContain('项目一');
  });

  it('项目已删 → 表格行与详情均显示不可点击「已删项目」fallback', () => {
    memoryData.push({ id: 'mem-gone', text: '遗留记忆', projectId: 'prj-gone' });
    renderPage();
    // 表格行：span（非链接）
    const rowFallback = screen.getByTestId('memory-project-deleted');
    expect(rowFallback.textContent).toContain('已删项目');
    expect(rowFallback.querySelector('a')).toBeNull();
    // 详情抽屉：点「详情」打开，同样 fallback
    fireEvent.click(screen.getByTestId('memory-open-detail'));
    const drawer = screen.getByTestId('memory-detail-drawer');
    const detailFallback = within(drawer).getByTestId('memory-project-deleted');
    expect(detailFallback.textContent).toContain('已删项目');
    expect(within(drawer).queryByTestId('memory-project-link')).toBeNull();
  });

  it('选中有效项目 → 创建默认归属该项目，且创建区显示归属提示', () => {
    mockSearchParams = new URLSearchParams('project=prj-1');
    projectsData.push({ id: 'prj-1', title: '项目一' });
    renderPage();
    const hint = screen.getByTestId('memory-create-project-hint');
    expect(hint.textContent).toContain('归属：项目一');
    fireEvent.change(screen.getByTestId('memory-create-input'), {
      target: { value: '新记忆' },
    });
    fireEvent.click(screen.getByTestId('memory-create-submit'));
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(createMutateAsync.mock.calls[0][0]).toEqual({
      text: '新记忆',
      scope: 'workspace',
      projectId: 'prj-1',
    });
  });

  it('URL 指向已删项目 → 不强塞创建归属（无提示、payload 无 projectId）', () => {
    mockSearchParams = new URLSearchParams('project=prj-gone');
    renderPage();
    expect(screen.queryByTestId('memory-create-project-hint')).toBeNull();
    fireEvent.change(screen.getByTestId('memory-create-input'), {
      target: { value: '全局记忆' },
    });
    fireEvent.click(screen.getByTestId('memory-create-submit'));
    expect(createMutateAsync).toHaveBeenCalledTimes(1);
    expect(createMutateAsync.mock.calls[0][0]).toEqual({
      text: '全局记忆',
      scope: 'workspace',
    });
  });

  it('未选项目 → 创建不带 projectId（维持现状）', () => {
    renderPage();
    fireEvent.change(screen.getByTestId('memory-create-input'), {
      target: { value: '普通记忆' },
    });
    fireEvent.click(screen.getByTestId('memory-create-submit'));
    expect(createMutateAsync.mock.calls[0][0]).toEqual({
      text: '普通记忆',
      scope: 'workspace',
    });
  });
});
