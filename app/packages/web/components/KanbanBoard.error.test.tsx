import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Slice 55 · KanbanBoard 诚实 ErrorState
 * 仅测 isError 分支；主 UI 依赖过多 hook，全部 mock 掉。
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
vi.mock('./OnboardingWizard', () => ({
  OnboardingWizard: () => null,
}));
vi.mock('./Select', () => ({
  Select: ({
    children,
    ...rest
  }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...rest}>{children}</select>
  ),
}));

const bulkStatusMutate = vi.fn();
const bulkAssigneeMutate = vi.fn();
const bulkDeleteMutate = vi.fn();

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
  useBulkUpdateIssueStatus: () => ({
    mutate: bulkStatusMutate,
    isPending: false,
  }),
  useBulkUpdateIssueAssignee: () => ({
    mutate: bulkAssigneeMutate,
    isPending: false,
  }),
  useBulkDeleteIssues: () => ({
    mutate: bulkDeleteMutate,
    isPending: false,
  }),
}));

import { KanbanBoard } from './KanbanBoard';

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

describe('KanbanBoard ErrorState (Slice 55)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    issuesState = {
      data: { data: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders ErrorState with retry when useIssues isError', () => {
    issuesState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('网络不可用'),
      refetch,
    };
    renderBoard();

    expect(screen.getByTestId('kanban-error')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('加载看板失败')).toBeTruthy();
    expect(screen.getByText('网络不可用')).toBeTruthy();
    expect(screen.queryByTestId('kanban-board')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not show ErrorState while loading', () => {
    issuesState = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch,
    };
    renderBoard();
    expect(screen.getByTestId('page-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('kanban-error')).toBeNull();
  });
});
