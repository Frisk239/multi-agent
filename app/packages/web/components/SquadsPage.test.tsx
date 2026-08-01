import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * SquadsPage 组件测试
 * Mock next/navigation + @/lib/api hooks
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
  usePathname: () => '/squads',
  useSearchParams: () => mockSearchParams,
}));

const createMutate = vi.fn();
const deleteMutate = vi.fn();
const squadsData: Array<{ id: string; name: string; leaderId?: string; memberCount: number }> = [];
const agentsData: Array<{ id: string; name: string; runtime: string }> = [];

vi.mock('@/lib/api', () => ({
  useSquads: () => ({
    data: squadsData,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useAgents: () => ({
    data: agentsData,
  }),
  useCreateSquad: () => ({
    mutate: createMutate,
    isPending: false,
  }),
  useDeleteSquad: () => ({
    mutate: deleteMutate,
    isPending: false,
  }),
  useAgentsReadinessMap: () => ({
    data: {},
  }),
}));

import { SquadsPage } from './SquadsPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SquadsPage />
    </QueryClientProvider>,
  );
  return {
    rerender: () =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <SquadsPage />
        </QueryClientProvider>,
      ),
  };
}

describe('SquadsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    squadsData.length = 0;
    agentsData.length = 0;
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders empty state when no squads exist', () => {
    renderPage();
    expect(screen.getByTestId('squads-page')).toBeTruthy();
    expect(screen.getByText('创建一个小队开始协作')).toBeTruthy();
  });

  it('renders squad table when squads exist', () => {
    squadsData.push(
      { id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 2 },
      { id: 'sqd-2', name: 'Beta', leaderId: 'agt-2', memberCount: 1 },
    );
    agentsData.push(
      { id: 'agt-1', name: 'Agent One', runtime: 'opencode' },
      { id: 'agt-2', name: 'Agent Two', runtime: 'claude-code' },
    );
    renderPage();
    expect(screen.getByTestId('squads-table')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByTestId('squads-visible-count')).toHaveTextContent('2');
  });

  it('disables new button when no agents exist', () => {
    renderPage();
    const btn = screen.getByTestId('squads-new-btn');
    expect(btn).toBeDisabled();
  });

  it('toggles create form on button click', () => {
    agentsData.push({ id: 'agt-1', name: 'Leader', runtime: 'opencode' });
    renderPage();
    const btn = screen.getByTestId('squads-new-btn');
    expect(btn).toHaveTextContent('新建小队');
    fireEvent.click(btn);
    expect(btn).toHaveTextContent('收起');
    expect(screen.getByPlaceholderText('如：补2小队')).toBeTruthy();
  });

  it('submits create form with correct input', () => {
    agentsData.push(
      { id: 'agt-1', name: 'Leader', runtime: 'opencode' },
      { id: 'agt-2', name: 'Member', runtime: 'claude-code' },
    );
    renderPage();
    fireEvent.click(screen.getByTestId('squads-new-btn'));

    const nameInput = screen.getByPlaceholderText('如：补2小队');
    fireEvent.change(nameInput, { target: { value: '测试小队' } });

    // Submit the form
    const form = nameInput.closest('form')!;
    fireEvent.submit(form);

    expect(createMutate).toHaveBeenCalledTimes(1);
    const input = createMutate.mock.calls[0][0];
    expect(input.name).toBe('测试小队');
    expect(input.leaderId).toBe('agt-1');
  });

  it('shows search input when squads exist', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 0 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    expect(screen.getByTestId('squads-search')).toBeTruthy();
  });

  it('shows leader and readiness filters', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 0 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    expect(screen.getByTestId('squads-leader-filter')).toBeTruthy();
    expect(screen.getByTestId('squads-ready-filter')).toBeTruthy();
  });

  it('shows empty filter message when filters match nothing', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 0 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    mockSearchParams = new URLSearchParams({ q: 'nonexistent' });
    renderPage();
    expect(screen.getByTestId('squads-empty-filter')).toBeTruthy();
    expect(screen.getByText('没有匹配的小队')).toBeTruthy();
  });

  it('navigates to squad detail on link click', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 0 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    const link = screen.getByText('Alpha').closest('a')!;
    expect(link.getAttribute('href')).toBe('/squads/sqd-1');
  });

  it('shows board and runs links per squad row', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 0 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    expect(screen.getByTestId('squad-list-board')).toHaveAttribute(
      'href',
      '/?assignee=squad:sqd-1',
    );
    expect(screen.getByTestId('squad-list-runs')).toHaveAttribute(
      'href',
      '/runs?squad=sqd-1',
    );
  });

  // ── F6-1（UI-SQD-002）：我的 / 全部 Tab ──

  it('shows 全部/我的 scope tabs and defaults to 全部', () => {
    squadsData.push(
      { id: 'sqd-1', name: 'Alpha', leaderId: 'user-linyuan', memberCount: 1 },
      { id: 'sqd-2', name: 'Beta', leaderId: 'agt-1', memberCount: 2 },
    );
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    expect(screen.getByTestId('squads-scope-tabs')).toBeTruthy();
    expect(screen.getByTestId('squads-scope-all')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('squads-scope-mine')).toHaveAttribute(
      'aria-selected',
      'false',
    );
    // 默认「全部」：两个小队都可见
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
  });

  it('switches to 我的 tab: URL ?scope=mine and only squads led by local user', () => {
    squadsData.push(
      { id: 'sqd-1', name: 'Mine Squad', leaderId: 'user-linyuan', memberCount: 1 },
      { id: 'sqd-2', name: 'Other Squad', leaderId: 'agt-1', memberCount: 2 },
    );
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    const { rerender } = renderPage();
    fireEvent.click(screen.getByTestId('squads-scope-mine'));
    expect(replace).toHaveBeenCalledWith('/squads?scope=mine', { scroll: false });
    rerender();
    expect(screen.getByTestId('squads-scope-mine')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('squads-scope-all')).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByText('Mine Squad')).toBeTruthy();
    expect(screen.queryByText('Other Squad')).toBeNull();
  });

  it('?scope=mine deep link filters on load and survives refresh', () => {
    squadsData.push(
      { id: 'sqd-1', name: 'Mine Squad', leaderId: 'user-linyuan', memberCount: 1 },
      { id: 'sqd-2', name: 'Other Squad', leaderId: 'agt-1', memberCount: 2 },
    );
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    mockSearchParams = new URLSearchParams('scope=mine');
    renderPage();
    expect(screen.getByTestId('squads-scope-mine')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Mine Squad')).toBeTruthy();
    expect(screen.queryByText('Other Squad')).toBeNull();
    // Tab 计数：我的 1 / 全部 2
    expect(screen.getByTestId('squads-scope-mine')).toHaveTextContent('1');
    expect(screen.getByTestId('squads-scope-all')).toHaveTextContent('2');
  });

  // ── F6-3（UI-SQD-014）：成员列 ──

  it('renders member count cell with unit label', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 2 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    expect(screen.getByTestId('squad-member-count')).toHaveTextContent('2 名成员');
    expect(screen.getByTestId('squad-member-count')).toHaveAttribute('title');
  });
});
