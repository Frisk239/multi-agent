import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentRun, RunMessage } from '@ma/shared';
import { RunDetailPage } from './RunDetailPage';

const fetchPreviousPage = vi.fn();

const run: AgentRun = {
  id: 'run-1',
  issueId: 'iss-1',
  agentId: 'ag-1',
  status: 'completed',
  runtime: 'opencode',
  kind: 'issue',
  priority: 'none',
  quickPrompt: null,
  error: null,
  startedAt: '2026-07-30T00:00:00.000Z',
  finishedAt: '2026-07-30T00:00:02.000Z',
  lastHeartbeatAt: null,
  isLeader: false,
  squadId: null,
  createdAt: '2026-07-30T00:00:00.000Z',
};

const messages: RunMessage[] = [
  {
    id: 'm-1',
    runId: 'run-1',
    seq: 1,
    kind: 'assistant',
    body: 'latest-out',
    createdAt: '2026-07-30T00:00:01.000Z',
  },
];

vi.mock('@/lib/api', () => ({
  useRun: () => ({ data: run, isLoading: false, isError: false, refetch: vi.fn(), isFetching: false }),
  useRunMessages: () => ({
    data: messages,
    isFetching: false,
    hasPreviousPage: true,
    isFetchingPreviousPage: false,
    fetchPreviousPage,
  }),
  useChildRuns: () => ({ data: [] }),
  useAutoRetryChild: () => ({ data: null }),
  useAgent: () => ({ data: { id: 'ag-1', name: 'Tester' } }),
  useCancelRun: () => ({ mutate: vi.fn(), isPending: false }),
  useRetryRun: () => ({ mutate: vi.fn(), isPending: false }),
  useSendRunCommand: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/ws', () => ({
  useRunProgressStore: (
    sel: (s: {
      byRunId: Record<string, string>;
      streamChunks: Record<string, string>;
    }) => unknown,
  ) => sel({ byRunId: {}, streamChunks: {} }),
}));

vi.mock('@/lib/use-page-title', () => ({
  usePageTitle: () => {},
}));

vi.mock('./SubagentTreeViewer', () => ({
  SubagentTreeViewer: () => null,
}));

vi.mock('./RunModelSwitcher', () => ({
  RunModelSwitcher: () => null,
}));

vi.mock('./FailureActionChip', () => ({
  FailureActionChip: () => null,
}));

vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./PageBreadcrumb', () => ({
  PageBreadcrumb: () => null,
}));

vi.mock('./PageHeaderMore', () => ({
  PageHeaderMore: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('RunDetailPage earlier events', () => {
  afterEach(() => {
    cleanup();
    fetchPreviousPage.mockReset();
  });

  it('loads earlier events, not newer', () => {
    render(<RunDetailPage runId="run-1" />);
    expect(screen.getByTestId('run-transcript-viewport')).toBeTruthy();
    const btn = screen.getByTestId('run-detail-load-more');
    expect(btn).toHaveTextContent('加载更早的事件');
    fireEvent.click(btn);
    expect(fetchPreviousPage).toHaveBeenCalled();
  });
});
