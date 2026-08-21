import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Issue } from '@ma/shared';

/**
 * 泳道刀 · KanbanBoard 视图三态（Must 1 / Must 4）：
 * - ?view=swimlane → 渲染泳道视图（data-view=swimlane）
 * - 默认 / ?view=list → board / list（深链语义零回归）
 * - toolbar 点击「泳道」tab → router.replace 写 ?view=swimlane
 * - 泳道视图 + 无 issue → 空态
 * 依赖全 mock（同 KanbanBoard.error.test.tsx 基建）+ KanbanSwimlaneView mock。
 */

const push = vi.fn();
const replace = vi.fn();
const refetch = vi.fn();
let mockSearchParams = new URLSearchParams();
let issuesState: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: typeof refetch;
} = {
  data: { data: [] },
  isLoading: false,
  isError: false,
  error: null,
  refetch,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/',
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
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: () => [],
}));

vi.mock('@/lib/density', () => ({
  useDensity: () => ({ density: 'comfortable', setDensity: vi.fn() }),
}));

vi.mock('@/lib/confirm-store', () => ({
  confirmDialog: vi.fn(async () => true),
}));

vi.mock('./KanbanColumn', () => ({
  KanbanColumn: () => <div data-testid="mock-column" />,
}));
vi.mock('./IssueCard', () => ({
  IssueCard: () => <div data-testid="mock-card" />,
}));
vi.mock('./IssueListView', () => ({
  IssueListView: () => <div data-testid="mock-list" />,
}));
vi.mock('./KanbanSwimlaneView', () => ({
  KanbanSwimlaneView: () => <div data-testid="mock-swimlane" />,
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
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
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

vi.mock('@/lib/api', () => ({
  useIssues: () => issuesState,
  useAgents: () => ({ data: [] }),
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

import { KanbanBoard } from './KanbanBoard';

function makeIssue(id: string): Issue {
  return {
    id,
    workspaceId: 'ws-1',
    identifier: `FRI-${id}`,
    title: `标题 ${id}`,
    description: null,
    status: 'todo',
    priority: 'none',
    assignee: null,
    creatorType: 'member',
    creatorId: 'usr-1',
    position: 0,
    labels: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  } as Issue;
}

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <KanbanBoard />
    </QueryClientProvider>,
  );
}

describe('KanbanBoard 泳道视图三态', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    issuesState = {
      data: { data: [makeIssue('1')] },
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('默认无 view 参数 → board（既有深链语义不变）', () => {
    renderBoard();
    const board = screen.getByTestId('kanban-board');
    expect(board.getAttribute('data-view')).toBe('board');
    // board 视图渲染 7 个状态列
    expect(screen.getAllByTestId('mock-column')).toHaveLength(7);
    expect(screen.queryByTestId('mock-swimlane')).toBeNull();
    expect(screen.queryByTestId('mock-list')).toBeNull();
  });

  it('?view=list → 列表视图（零回归）', () => {
    mockSearchParams = new URLSearchParams('view=list');
    renderBoard();
    const board = screen.getByTestId('kanban-board');
    expect(board.getAttribute('data-view')).toBe('list');
    expect(screen.getByTestId('mock-list')).toBeTruthy();
    expect(screen.queryByTestId('mock-swimlane')).toBeNull();
  });

  it('?view=swimlane → 泳道视图', () => {
    mockSearchParams = new URLSearchParams('view=swimlane');
    renderBoard();
    const board = screen.getByTestId('kanban-board');
    expect(board.getAttribute('data-view')).toBe('swimlane');
    expect(screen.getByTestId('mock-swimlane')).toBeTruthy();
    // board 列与列表不同时出现
    expect(screen.queryByTestId('mock-column')).toBeNull();
    expect(screen.queryByTestId('mock-list')).toBeNull();
  });

  it('toolbar 第三个「泳道」tab 存在，点击写 ?view=swimlane', () => {
    renderBoard();
    const tab = screen.getByTestId('kanban-view-swimlane');
    expect(tab.textContent).toBe('泳道');
    expect(tab.getAttribute('aria-selected')).toBe('false');
    fireEvent.click(tab);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/?view=swimlane', { scroll: false });
  });

  it('泳道视图下切回看板 → 清 view 参数（保留其它 query）', () => {
    mockSearchParams = new URLSearchParams('view=swimlane&q=foo');
    renderBoard();
    fireEvent.click(screen.getByTestId('kanban-view-board'));
    expect(replace).toHaveBeenCalledWith('/?q=foo', { scroll: false });
  });

  it('泳道视图无 issue → 空态文案', () => {
    mockSearchParams = new URLSearchParams('view=swimlane');
    issuesState = {
      data: { data: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    };
    renderBoard();
    expect(screen.getByTestId('kanban-swimlane-empty')).toBeTruthy();
    expect(screen.getByText('泳道中无符合条件的 Issue')).toBeTruthy();
    expect(screen.queryByTestId('mock-swimlane')).toBeNull();
  });
});
