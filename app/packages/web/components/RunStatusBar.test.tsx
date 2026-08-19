import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

const rerunMutate = vi.fn();

vi.mock('@/lib/api', () => ({
  useCancelRun: () => ({ mutate: vi.fn(), isPending: false }),
  useRerunIssue: () => ({ mutate: rerunMutate, isPending: false }),
  useRetryRun: () => ({ mutate: vi.fn(), isPending: false }),
  useSquad: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@/lib/ws', () => ({
  useRunProgressStore: (selector: (state: { byRunId: Record<string, string>; toolByRunId: Record<string, string> }) => unknown) =>
    selector({ byRunId: {}, toolByRunId: {} }),
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { RunStatusBar } from './RunStatusBar';

describe('RunStatusBar query truthfulness', () => {
  beforeEach(() => {
    rerunMutate.mockReset();
  });

  it('shows a local query error and retries the supplied query without creating a run', () => {
    const retryRuns = vi.fn();
    render(
      <RunStatusBar
        issueId="iss-runs-error"
        runs={[]}
        runsIsError
        runsError={new Error('runs 接口 500')}
        onRetryRuns={retryRuns}
      />,
    );

    expect(screen.getByTestId('run-status-error')).toBeTruthy();
    expect(screen.getByText('运行状态暂不可用')).toBeTruthy();
    expect(screen.getByText('runs 接口 500')).toBeTruthy();
    expect(screen.queryByTestId('run-status-empty')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(retryRuns).toHaveBeenCalledTimes(1);
    expect(rerunMutate).not.toHaveBeenCalled();
  });

  it('shows loading and only shows the old empty copy after a successful empty result', () => {
    const { rerender } = render(
      <RunStatusBar issueId="iss-runs-loading" runs={[]} runsIsLoading />,
    );
    expect(screen.getByTestId('run-status-loading')).toHaveTextContent('正在加载运行状态');
    expect(screen.queryByTestId('run-status-empty')).toBeNull();

    rerender(<RunStatusBar issueId="iss-runs-loading" runs={[]} />);
    expect(screen.getByTestId('run-status-empty')).toHaveTextContent('指派 agent 后自动执行');
  });
});
