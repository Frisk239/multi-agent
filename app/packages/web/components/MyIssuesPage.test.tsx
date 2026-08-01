import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Issue } from '@ma/shared';

/**
 * MyIssuesPage scoped 看板测试（UI-NAV-005）
 * - 默认 assigned 视角渲染看板，只显示分配给我的 issue
 * - 筛选 Tab 切换写 ?scope=（可分享深链）
 * - ?scope=created 深链直达「我创建的」视角
 * KanbanColumn 用透传 mock，以便断言每列收到的 scoped issue 集合。
 */

const replace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    // 模拟真实导航：把 URL query 写回 mockSearchParams，组件重渲染后生效
    replace: (url: string, opts?: object) => {
      replace(url, opts);
      const qs = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
      mockSearchParams = new URLSearchParams(qs);
    },
  }),
  usePathname: () => '/my-issues',
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  closestCorners: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
}));

vi.mock('@/lib/density', () => ({
  useDensity: () => ({ density: 'comfortable', setDensity: vi.fn() }),
}));

vi.mock('@/lib/confirm-store', () => ({
  confirmDialog: vi.fn(async () => true),
}));

// 透传 KanbanColumn：把每列的 issues 暴露给断言
vi.mock('./KanbanColumn', () => ({
  KanbanColumn: ({ issues }: { issues: Issue[] }) => (
    <div data-testid="mock-column">
      {issues.map((i) => (
        <span key={i.id} data-testid="col-issue" data-issue-id={i.id}>
          {i.title}
        </span>
      ))}
    </div>
  ),
}));
vi.mock('./IssueCard', () => ({
  IssueCard: () => <div data-testid="mock-card" />,
}));
vi.mock('./IssueListView', () => ({
  IssueListView: () => <div data-testid="mock-list" />,
}));
vi.mock('./IssueSideSheet', () => ({
  IssueSideSheet: () => null,
  buildIssueSheetHref: () => '/',
  withIssueSearchParam: (sp: URLSearchParams) => sp,
}));
vi.mock('./NewIssueForm', () => ({
  NewIssueForm: () => <button type="button">新建 Issue</button>,
}));
vi.mock('./EmptyState', () => ({
  EmptyState: () => <div>empty</div>,
}));
vi.mock('./Skeleton', () => ({
  PageSkeleton: () => <div data-testid="page-skeleton">loading</div>,
}));
vi.mock('./AgentsWorkingBanner', () => ({
  AgentsWorkingBanner: () => null,
}));
vi.mock('./Select', () => ({
  Select: ({
    children,
    ...rest
  }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...rest}>{children}</select>
  ),
}));

const refetch = vi.fn();
let issuesState: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: typeof refetch;
  isFetching: boolean;
} = {
  data: { data: [], total: 0 },
  isLoading: false,
  isError: false,
  error: null,
  refetch,
  isFetching: false,
};

vi.mock('@/lib/api', () => ({
  useIssues: () => issuesState,
  useAgents: () => ({ data: [{ id: 'agent-a', name: 'Agent A' }] }),
  useSquads: () => ({ data: [] }),
  useProjects: () => ({ data: [] }),
  useLabels: () => ({ data: [] }),
  useAgentsReadinessMap: () => ({ data: {} }),
  useWorkspaceRuns: () => ({ data: [] }),
  useReorderIssues: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateIssue: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkUpdateIssueStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkUpdateIssueAssignee: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkDeleteIssues: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MyIssuesPage } from './MyIssuesPage';

function makeIssue(over: Partial<Issue> & { id: string; title: string }): Issue {
  return {
    workspaceId: 'ws-1',
    identifier: `FRI-${over.id}`,
    description: null,
    status: 'todo',
    priority: 'none',
    assignee: null,
    // 默认非我创建；需要「我创建的」用例显式传 creatorId=user-linyuan
    creatorType: 'member',
    creatorId: 'user-other',
    position: 0,
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function visibleIssueIds(): string[] {
  return screen
    .queryAllByTestId('col-issue')
    .map((el) => el.getAttribute('data-issue-id') ?? '');
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MyIssuesPage />
    </QueryClientProvider>,
  );
  return {
    queryClient,
    rerender: () =>
      view.rerender(
        <QueryClientProvider client={queryClient}>
          <MyIssuesPage />
        </QueryClientProvider>,
      ),
  };
}

describe('MyIssuesPage scoped 看板', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    const me: Issue['assignee'] = {
      type: 'member',
      id: 'user-linyuan',
      label: '林远',
    };
    const agentA: Issue['assignee'] = {
      type: 'agent',
      id: 'agent-a',
      label: 'Agent A',
    };
    const issues = [
      makeIssue({
        id: 'i1',
        title: '分配给我',
        assignee: me,
        creatorId: 'user-other',
      }),
      makeIssue({
        id: 'i2',
        title: '我创建',
        assignee: null,
        creatorId: 'user-linyuan',
      }),
      makeIssue({
        id: 'i3',
        title: '智能体负责',
        assignee: agentA,
        creatorId: 'user-other',
      }),
    ];
    issuesState = {
      data: { data: issues, total: issues.length },
      isLoading: false,
      isError: false,
      error: null,
      refetch,
      isFetching: false,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('默认「已分配」视角：渲染看板，只显示分配给我的 issue', () => {
    setup();
    expect(screen.getByTestId('kanban-board')).toBeTruthy();
    expect(screen.getByTestId('my-issues-tabs')).toBeTruthy();
    expect(visibleIssueIds()).toEqual(['i1']);
  });

  it('切到「我创建的」：URL 写 ?scope=created，只显示我创建的 issue', () => {
    const { rerender } = setup();
    fireEvent.click(screen.getByTestId('my-issues-tab-created'));

    expect(replace).toHaveBeenCalledWith('/my-issues?scope=created', {
      scroll: false,
    });

    rerender();
    expect(visibleIssueIds()).toEqual(['i2']);
  });

  it('切到「我的智能体和小队」：只显示我的智能体负责的 issue', () => {
    const { rerender } = setup();
    fireEvent.click(screen.getByTestId('my-issues-tab-agents'));
    rerender();
    expect(visibleIssueIds()).toEqual(['i3']);
  });

  it('「全部」视角：显示我创建 / 分配给我 / 我的智能体负责的全部', () => {
    const { rerender } = setup();
    fireEvent.click(screen.getByTestId('my-issues-tab-all'));
    rerender();
    expect(visibleIssueIds().sort()).toEqual(['i1', 'i2', 'i3']);
  });

  it('?scope=created 深链直达「我创建的」视角，刷新不丢上下文', () => {
    mockSearchParams = new URLSearchParams('scope=created');
    setup();

    const tab = screen.getByTestId('my-issues-tab-created');
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(visibleIssueIds()).toEqual(['i2']);
  });
});
