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
const squadsData: Array<{
  id: string;
  name: string;
  leaderId?: string;
  memberCount: number;
  memberIds?: string[];
}> = [];
// G2-9：归档视图数据源（useSquads('archived') 的返回）
const archivedSquadsData: Array<{
  id: string;
  name: string;
  leaderId?: string;
  memberCount: number;
  memberIds?: string[];
  archivedAt?: string;
}> = [];
const agentsData: Array<{ id: string; name: string; runtime: string }> = [];

// G2-9：记录 view 参数的 useSquads mock——active/undefined 返回 squadsData，archived 返回 archivedSquadsData
const useSquadsMock = vi.fn((view?: string) => ({
  data: view === 'archived' ? archivedSquadsData : squadsData,
  isLoading: false,
  isError: false,
  error: null,
}));

vi.mock('@/lib/api', () => ({
  // 闭包转发（不能直接引用 useSquadsMock：vi.mock 工厂被提升到文件顶部，立即解引用会 TDZ）
  useSquads: (view?: string) => useSquadsMock(view),
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
    archivedSquadsData.length = 0;
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
  });

  // ── F6-3（UI-SQD-014）：memberIds 到位后成员列头像堆叠 ──

  it('renders avatar stack from memberIds (id → name lookup)', () => {
    squadsData.push({
      id: 'sqd-1',
      name: 'Alpha',
      leaderId: 'agt-1',
      memberCount: 2,
      memberIds: ['agt-2', 'agt-3'],
    });
    agentsData.push(
      { id: 'agt-1', name: 'Agent One', runtime: 'opencode' },
      { id: 'agt-2', name: 'Bob Agent', runtime: 'opencode' },
      { id: 'agt-3', name: 'Carol Agent', runtime: 'claude-code' },
    );
    renderPage();
    const cell = screen.getByTestId('squad-member-count');
    expect(cell).not.toHaveTextContent('名成员');
    const avatars = screen.getAllByTestId('squad-member-avatar');
    expect(avatars.length).toBe(2);
    expect(avatars[0]).toHaveTextContent('B');
    expect(avatars[1]).toHaveTextContent('C');
    // 每个头像有 hash 底色（不透明色值），且名字不同 → 颜色不同
    expect(avatars[0].style.background).toBeTruthy();
    expect(avatars[1].style.background).toBeTruthy();
    expect(avatars[0].style.background).not.toBe(avatars[1].style.background);
  });

  it('shows +N overflow when more than 4 members resolve', () => {
    squadsData.push({
      id: 'sqd-1',
      name: 'Alpha',
      leaderId: 'agt-1',
      memberCount: 6,
      memberIds: ['agt-2', 'agt-3', 'agt-4', 'agt-5', 'agt-6', 'agt-7'],
    });
    agentsData.push(
      { id: 'agt-1', name: 'Agent One', runtime: 'opencode' },
      { id: 'agt-2', name: 'Two', runtime: 'opencode' },
      { id: 'agt-3', name: 'Three', runtime: 'opencode' },
      { id: 'agt-4', name: 'Four', runtime: 'opencode' },
      { id: 'agt-5', name: 'Five', runtime: 'opencode' },
      { id: 'agt-6', name: 'Six', runtime: 'opencode' },
      { id: 'agt-7', name: 'Seven', runtime: 'opencode' },
    );
    renderPage();
    expect(screen.getAllByTestId('squad-member-avatar').length).toBe(4);
    expect(screen.getByTestId('squad-member-overflow')).toHaveTextContent('+2');
  });

  it('falls back to text when memberIds absent or names unresolvable', () => {
    squadsData.push(
      { id: 'sqd-1', name: 'NoIds', leaderId: 'agt-1', memberCount: 2 },
      {
        id: 'sqd-2',
        name: 'GhostIds',
        leaderId: 'agt-1',
        memberCount: 2,
        memberIds: ['agt-unknown'],
      },
    );
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    const cells = screen.getAllByTestId('squad-member-count');
    expect(cells[0]).toHaveTextContent('2 名成员');
    expect(cells[1]).toHaveTextContent('1 名成员');
    expect(screen.queryAllByTestId('squad-member-avatar').length).toBe(0);
  });

  // ── F6-3：「我的」Tab 命中 memberIds（不依赖 leaderId）──

  it('?scope=mine includes squads where local user is a member', () => {
    squadsData.push(
      // leader 是 agent，但成员里有本地用户
      {
        id: 'sqd-1',
        name: 'Member Squad',
        leaderId: 'agt-1',
        memberCount: 1,
        memberIds: ['user-linyuan'],
      },
      { id: 'sqd-2', name: 'Foreign Squad', leaderId: 'agt-2', memberCount: 0 },
    );
    agentsData.push(
      { id: 'agt-1', name: 'Agent One', runtime: 'opencode' },
      { id: 'agt-2', name: 'Agent Two', runtime: 'opencode' },
    );
    mockSearchParams = new URLSearchParams('scope=mine');
    renderPage();
    expect(screen.getByText('Member Squad')).toBeTruthy();
    expect(screen.queryByText('Foreign Squad')).toBeNull();
    // Tab 计数：我的 1 / 全部 2
    expect(screen.getByTestId('squads-scope-mine')).toHaveTextContent('1');
    expect(screen.getByTestId('squads-scope-all')).toHaveTextContent('2');
  });

  // ── G2-9：历史小队浏览（已归档 tab / ?view=archived）──

  const ARCHIVED_AT = '2026-08-01T09:30:00.000Z';

  it('已归档 tab 点击写 URL ?view=archived（清除 scope），再点全部回到 /squads', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 1 });
    archivedSquadsData.push({
      id: 'sqd-a1',
      name: 'Old Squad',
      leaderId: 'agt-1',
      memberCount: 2,
      archivedAt: ARCHIVED_AT,
    });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    const { rerender } = renderPage();
    fireEvent.click(screen.getByTestId('squads-scope-archived'));
    expect(replace).toHaveBeenCalledWith('/squads?view=archived', { scroll: false });
    rerender();
    // 归档视图选中态 + 数据源切到归档小队
    expect(screen.getByTestId('squads-scope-archived')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('squads-scope-all')).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByText('Old Squad')).toBeTruthy();
    expect(screen.queryByText('Alpha')).toBeNull();
    // 再点「全部」：移除 view 参数回 active
    fireEvent.click(screen.getByTestId('squads-scope-all'));
    expect(replace).toHaveBeenLastCalledWith('/squads', { scroll: false });
    rerender();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByText('Old Squad')).toBeNull();
  });

  it('?view=archived 深链渲染「已归档」chip + 日期，行名可点进详情', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 1 });
    archivedSquadsData.push({
      id: 'sqd-a1',
      name: 'Old Squad',
      leaderId: 'agt-1',
      memberCount: 2,
      archivedAt: ARCHIVED_AT,
    });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    mockSearchParams = new URLSearchParams('view=archived');
    renderPage();
    // chip：已归档 + 日期（格式与组件一致 toLocaleDateString）
    const chip = screen.getByTestId('squad-archived-chip');
    expect(chip).toHaveTextContent('已归档');
    expect(chip).toHaveTextContent(new Date(ARCHIVED_AT).toLocaleDateString());
    // 行名链接进既有只读详情
    const link = screen.getByText('Old Squad').closest('a')!;
    expect(link.getAttribute('href')).toBe('/squads/sqd-a1');
    // 归档视图 tab 计数来自归档数据源
    expect(screen.getByTestId('squads-scope-archived')).toHaveTextContent('1');
  });

  it('active 视图渲染 readiness 而无「已归档」chip', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 1 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    expect(screen.queryByTestId('squad-archived-chip')).toBeNull();
    expect(screen.getByTestId('squad-leader-readiness')).toBeTruthy();
  });

  it('hook 主数据源收到 view 参数：默认首调 active', () => {
    renderPage();
    // 组件内首个 useSquads 调用即主数据源（view 驱动；后续两个是 tab 计数用的恒定调用）
    expect(useSquadsMock).toHaveBeenCalled();
    expect(useSquadsMock.mock.calls[0]).toEqual(['active']);
  });

  it('hook 主数据源收到 view 参数：?view=archived 深链首调 archived', () => {
    mockSearchParams = new URLSearchParams('view=archived');
    renderPage();
    expect(useSquadsMock).toHaveBeenCalled();
    expect(useSquadsMock.mock.calls[0]).toEqual(['archived']);
  });

  it('归档视图隐藏 leader/ready 筛选与「归档」按钮，q 搜索保留', () => {
    archivedSquadsData.push({
      id: 'sqd-a1',
      name: 'Old Squad',
      leaderId: 'agt-1',
      memberCount: 2,
      archivedAt: ARCHIVED_AT,
    });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    mockSearchParams = new URLSearchParams('view=archived');
    renderPage();
    expect(screen.getByTestId('squads-search')).toBeTruthy();
    expect(screen.queryByTestId('squads-leader-filter')).toBeNull();
    expect(screen.queryByTestId('squads-ready-filter')).toBeNull();
    // 归档视图只读：不放「归档」行动按钮
    expect(screen.queryByText('归档')).toBeNull();
  });

  it('归档视图无归档小队时显示独立空态，不与 active 空态混淆', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 1 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    mockSearchParams = new URLSearchParams('view=archived');
    renderPage();
    expect(screen.getByText('还没有已归档的小队')).toBeTruthy();
    expect(screen.queryByText('创建一个小队开始协作')).toBeNull();
  });
});
