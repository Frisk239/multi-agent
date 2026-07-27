import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * Slice 62 · IssueDetail 加载失败 / 不存在 → ErrorState / Empty + 回看板
 */

const refetchIssue = vi.fn();

let issueState: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: typeof refetchIssue;
} = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
  refetch: refetchIssue,
};

vi.mock('@/lib/api', () => ({
  API: 'http://test',
  apiFetch: vi.fn(),
  useIssue: () => issueState,
  useComments: () => ({ data: [], isLoading: false }),
  useActivities: () => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useRuns: () => ({ data: [] }),
  useIssueRunUsage: () => ({ data: undefined }),
  useUpdateIssue: () => ({ mutate: vi.fn(), isPending: false }),
  useIssueSubscription: () => ({ data: { subscribed: false } }),
  useToggleIssueSubscription: () => ({ mutate: vi.fn(), isPending: false }),
  useProjects: () => ({ data: [] }),
  useAgents: () => ({ data: [] }),
  useSquads: () => ({ data: [] }),
  useAgentsReadinessMap: () => ({ data: {} }),
  useCancelRun: () => ({ mutate: vi.fn(), isPending: false }),
  useRerunIssue: () => ({ mutate: vi.fn(), isPending: false }),
  useRetryRun: () => ({ mutate: vi.fn(), isPending: false }),
  useSquad: () => ({ data: undefined, isLoading: false }),
  useIssueChildren: () => ({ data: [] }),
}));

vi.mock('./IssueHeader', () => ({
  IssueHeader: () => <div data-testid="issue-header-mock" />,
}));
vi.mock('./Timeline', () => ({
  Timeline: () => null,
}));
vi.mock('./CommentComposer', () => ({
  CommentComposer: () => null,
}));
vi.mock('./RunStatusBar', () => ({
  RunStatusBar: () => null,
}));
vi.mock('./IssueRunHistory', () => ({
  IssueRunHistory: () => null,
}));
vi.mock('./IssueSubtasks', () => ({
  IssueSubtasks: () => null,
}));
vi.mock('./RunEventTimeline', () => ({
  RunEventTimelineDrawer: () => null,
  RunEventTimelineInline: () => null,
}));
vi.mock('./ActivityTimeline', () => ({
  ActivityTimeline: () => null,
}));
vi.mock('./IssueStoryline', () => ({
  IssueStoryline: () => null,
}));
vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./IssuePrCard', () => ({
  IssuePrCard: () => null,
}));
vi.mock('./AssigneeSelect', () => ({
  AssigneeSelect: () => null,
}));
vi.mock('./Select', () => ({
  Select: ({
    children,
    ...rest
  }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...rest}>{children}</select>
  ),
}));
vi.mock('./Skeleton', () => ({
  PageSkeleton: () => <div data-testid="page-skeleton">loading</div>,
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('../lib/toast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

import { IssueDetail } from './IssueDetail';

describe('IssueDetail ErrorState (Slice 62)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    issueState = {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchIssue,
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('shows PageSkeleton while loading', () => {
    issueState = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchIssue,
    };
    render(<IssueDetail id="iss-x" />);
    expect(screen.getByTestId('issue-detail-loading')).toBeTruthy();
    expect(screen.getByTestId('page-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('issue-detail-error')).toBeNull();
  });

  it('shows ErrorState + retry + 回看板 when useIssue isError', () => {
    issueState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('issue 接口 500'),
      refetch: refetchIssue,
    };
    render(<IssueDetail id="iss-x" />);

    expect(screen.getByTestId('issue-detail-error')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('加载 Issue 失败')).toBeTruthy();
    expect(screen.getByText('issue 接口 500')).toBeTruthy();
    expect(screen.getByTestId('issue-back-board')).toHaveAttribute('href', '/');

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(refetchIssue).toHaveBeenCalledTimes(1);
  });

  it('shows EmptyState + 回看板 when issue missing (not error)', () => {
    issueState = {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchIssue,
    };
    render(<IssueDetail id="iss-missing" variant="sheet" />);

    expect(screen.getByTestId('issue-detail-error')).toBeTruthy();
    expect(screen.getByText('Issue 不存在')).toBeTruthy();
    expect(screen.getByTestId('issue-back-board')).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });
});
