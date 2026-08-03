import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRun } from '@ma/shared';
import { SquadRunsTimeline } from './SquadRunsTimeline';

const apiMocks = vi.hoisted(() => ({
  cancelMutate: vi.fn(),
  retryMutate: vi.fn(),
  refetch: vi.fn(),
}));

const runs: AgentRun[] = [
  {
    id: 'squad-active', issueId: 'issue-1', agentId: 'agent-1', runtime: 'opencode',
    status: 'running', kind: 'issue', priority: 'none', quickPrompt: null, error: null,
    startedAt: '2026-07-30T00:01:00.000Z', finishedAt: null, lastHeartbeatAt: null,
    isLeader: true, squadId: 'squad-1', createdAt: '2026-07-30T00:00:00.000Z',
  },
  {
    id: 'squad-failed', issueId: 'issue-2', agentId: 'agent-2', runtime: 'opencode',
    status: 'failed', kind: 'issue', priority: 'none', quickPrompt: null, error: 'boom',
    startedAt: '2026-07-30T00:00:00.000Z', finishedAt: '2026-07-30T00:00:10.000Z', lastHeartbeatAt: null,
    isLeader: false, squadId: 'squad-1', createdAt: '2026-07-30T00:00:00.000Z',
  },
];

vi.mock('@/lib/api', () => ({
  useWorkspaceRuns: () => ({ data: runs, isLoading: false, isError: false, refetch: apiMocks.refetch, isFetching: false }),
  useCancelRun: () => ({ mutate: apiMocks.cancelMutate, isPending: false }),
  useRetryRun: () => ({ mutate: apiMocks.retryMutate, isPending: false }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

describe('SquadRunsTimeline execution controls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T00:02:00.000Z'));
    apiMocks.cancelMutate.mockReset(); apiMocks.retryMutate.mockReset(); apiMocks.refetch.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); cleanup(); });

  it('shows active/past groups with stop, retry and transcript actions', () => {
    render(<SquadRunsTimeline squadId="squad-1" />);
    expect(screen.getByTestId('squad-runs-active-group')).toHaveTextContent('在途 · 1');
    expect(screen.getByTestId('squad-runs-past-group')).toHaveTextContent('历史 · 1');
    expect(screen.getByTestId('squad-run-elapsed')).toHaveTextContent('已运行 1m');
    fireEvent.click(screen.getByTestId('squad-run-cancel'));
    expect(apiMocks.cancelMutate).toHaveBeenCalledWith('squad-active', expect.any(Object));
    fireEvent.click(screen.getByTestId('squad-run-retry'));
    expect(apiMocks.retryMutate).toHaveBeenCalledWith('squad-failed', expect.any(Object));
    expect(screen.getAllByTestId('squad-run-transcript').some(
      (el) => el.getAttribute('href') === '/runs?run=squad-active&timeline=1&status=all',
    )).toBe(true);
  });
});
