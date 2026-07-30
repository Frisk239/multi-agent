import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRun } from '@ma/shared';
import { IssueRunHistory } from './IssueRunHistory';

const apiMocks = vi.hoisted(() => ({
  cancelMutate: vi.fn(),
  retryMutate: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  useCancelRun: () => ({ mutate: apiMocks.cancelMutate, isPending: false }),
  useRetryRun: () => ({ mutate: apiMocks.retryMutate, isPending: false }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

function makeRun(overrides: Partial<AgentRun>): AgentRun {
  return {
    id: 'run-default',
    issueId: 'issue-1',
    agentId: 'agent-1',
    runtime: 'opencode',
    status: 'completed',
    kind: 'issue',
    quickPrompt: null,
    error: null,
    startedAt: '2026-07-30T00:00:00.000Z',
    finishedAt: '2026-07-30T00:00:01.000Z',
    lastHeartbeatAt: null,
    isLeader: false,
    squadId: null,
    createdAt: '2026-07-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('IssueRunHistory execution controls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T00:02:00.000Z'));
    apiMocks.cancelMutate.mockReset();
    apiMocks.retryMutate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('groups active/past runs and exposes live elapsed, cancel, retry and transcript links', () => {
    const active = makeRun({
      id: 'run-active',
      status: 'running',
      startedAt: '2026-07-30T00:01:00.000Z',
      finishedAt: null,
      lastHeartbeatAt: '2026-07-30T00:01:30.000Z',
    });
    const failed = makeRun({
      id: 'run-failed',
      status: 'failed',
      error: 'boom',
      finishedAt: '2026-07-30T00:00:10.000Z',
    });

    render(
      <IssueRunHistory
        runs={[active, failed]}
        selectedRunId={undefined}
        onSelect={vi.fn()}
        onOpenTimeline={vi.fn()}
      />,
    );

    expect(screen.getByTestId('issue-run-history-active-group')).toHaveTextContent('在途 · 1');
    expect(screen.getByTestId('issue-run-history-past-group')).toHaveTextContent('历史 · 1');
    expect(screen.getAllByTestId('issue-run-history-duration')[0]).toHaveTextContent('已运行 1m');

    fireEvent.click(screen.getByTestId('issue-run-history-cancel'));
    expect(apiMocks.cancelMutate).toHaveBeenCalledWith('run-active', expect.any(Object));

    fireEvent.click(screen.getByTestId('issue-run-history-retry'));
    expect(apiMocks.retryMutate).toHaveBeenCalledWith('run-failed', expect.any(Object));

    expect(screen.getAllByTestId('issue-run-history-transcript').some(
      (el) => el.getAttribute('href') === '/runs?run=run-active&timeline=1&status=all',
    )).toBe(true);
  });
});
