import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { IssueDetail } from './IssueDetail';

const issue = {
  id: 'iss-1',
  workspaceId: 'ws-1',
  identifier: 'MA-1',
  title: '侧滑轻量 Issue',
  description: '描述正文',
  status: 'todo' as const,
  priority: 'medium' as const,
  assignee: { type: 'agent' as const, id: 'ag-1' },
  creatorType: 'user' as const,
  creatorId: 'u-1',
  position: 0,
  labels: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const comments = [
  {
    id: 'c-1',
    issueId: 'iss-1',
    authorType: 'user',
    authorId: 'u-1',
    authorLabel: 'Me',
    body: 'hello',
    createdAt: '2026-07-01T00:00:00.000Z',
  },
];

const runs = [
  {
    id: 'run-1',
    status: 'failed',
    error: 'spawn failed',
    runtime: 'claude-code',
    isLeader: false,
    squadId: null,
  },
];

vi.mock('@/lib/api', () => ({
  useIssue: () => ({ data: issue, isLoading: false, error: null }),
  useComments: () => ({ data: comments, isLoading: false }),
  useRuns: () => ({ data: runs }),
  useIssueRunUsage: (id: string) =>
    id
      ? {
          data: {
            tokensInput: 1,
            tokensOutput: 2,
            tokensCacheRead: 0,
            tokensCacheWrite: 0,
            costUsd: 0.01,
            uncostedRuns: 0,
          },
        }
      : { data: undefined },
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
  IssueHeader: ({
    issue: iss,
    variant,
    endActions,
  }: {
    issue: { title: string; id: string };
    variant?: string;
    endActions?: React.ReactNode;
  }) => (
    <div data-testid={`issue-header-${variant ?? 'full'}`}>
      <h1>{iss.title}</h1>
      {endActions}
      {variant === 'props' ? (
        <div data-testid="issue-meta">props meta</div>
      ) : null}
    </div>
  ),
}));

vi.mock('./Timeline', () => ({
  Timeline: () => <div data-testid="timeline-mock">timeline</div>,
}));

vi.mock('./CommentComposer', () => ({
  CommentComposer: () => <div data-testid="comment-composer">composer</div>,
}));

vi.mock('./RunStatusBar', () => ({
  RunStatusBar: () => (
    <div data-testid="run-status-bar" data-run-status="failed">
      failed run bar
    </div>
  ),
}));

vi.mock('./IssueRunHistory', () => ({
  IssueRunHistory: () => <div data-testid="issue-run-history">history</div>,
}));

vi.mock('./IssueSubtasks', () => ({
  IssueSubtasks: () => <div data-testid="issue-subtasks">subtasks</div>,
}));

vi.mock('./RunEventTimeline', () => ({
  RunEventTimelineDrawer: () => null,
  RunEventTimelineInline: () => (
    <div data-testid="run-event-timeline-inline">inline log</div>
  ),
}));

vi.mock('./ActivityTimeline', () => ({
  ActivityTimeline: () => <div data-testid="activity-timeline">activity</div>,
}));

vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./IssuePrCard', () => ({
  IssuePrCard: () => <div data-testid="issue-pr-card">pr</div>,
}));

vi.mock('./AssigneeSelect', () => ({
  AssigneeSelect: () => <div data-testid="assignee-select">assignee</div>,
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

describe('IssueDetail variant', () => {
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
  });

  it('page (default): shows props rail toggle, knowledge path, activity tabs', () => {
    render(<IssueDetail id="iss-1" />);
    const root = screen.getByTestId('issue-detail');
    expect(root).toHaveAttribute('data-variant', 'page');
    expect(screen.getByTestId('issue-props-toggle')).toBeTruthy();
    expect(screen.getByTestId('activity-tab-comments')).toBeTruthy();
    expect(screen.getByTestId('activity-tab-log')).toBeTruthy();
    expect(screen.queryByTestId('issue-sheet-meta')).toBeNull();
    expect(screen.queryByTestId('issue-sheet-more')).toBeNull();
    // failed run auto-opens exec on live/fail paths via page hash only for live;
    // page still has exec section
    expect(screen.getByTestId('issue-exec-section')).toHaveAttribute(
      'data-sheet-light',
      '0',
    );
  });

  it('sheet: light surface — status/assignee/comments/recent run, hide props & knowledge', () => {
    render(<IssueDetail id="iss-1" variant="sheet" />);
    const root = screen.getByTestId('issue-detail');
    expect(root).toHaveAttribute('data-variant', 'sheet');
    expect(root.className).toContain('issue-detail--sheet');

    expect(screen.getByTestId('issue-sheet-meta')).toBeTruthy();
    expect(screen.getByTestId('issue-sheet-status')).toBeTruthy();
    expect(screen.getByTestId('issue-sheet-assignee')).toBeTruthy();
    expect(screen.getByTestId('issue-sheet-open-fullpage')).toHaveAttribute(
      'href',
      '/issues/iss-1',
    );
    expect(screen.getByTestId('issue-sheet-more')).toBeTruthy();
    expect(screen.getByTestId('comment-composer')).toBeTruthy();
    expect(screen.getByTestId('timeline-mock')).toBeTruthy();

    // heavy page pieces hidden
    expect(screen.queryByTestId('issue-props-rail')).toBeNull();
    expect(screen.queryByTestId('issue-props-toggle')).toBeNull();
    expect(screen.queryByTestId('activity-tab-log')).toBeNull();
    expect(screen.queryByText('沉淀至 Wiki')).toBeNull();
    expect(screen.queryByTestId('issue-token-usage')).toBeNull();
    expect(screen.queryByTestId('run-event-timeline-inline')).toBeNull();
    expect(screen.queryByTestId('issue-run-history')).toBeNull();

    // failed run keeps recent-run body open with status bar (error surface)
    expect(screen.getByTestId('issue-exec-section')).toHaveAttribute(
      'data-sheet-light',
      '1',
    );
    expect(screen.getByTestId('run-status-bar')).toBeTruthy();
    expect(screen.getByText('最近运行')).toBeTruthy();
  });
});
