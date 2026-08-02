import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRun } from '@ma/shared';
import { IssueRunHistory } from './IssueRunHistory';

const apiMocks = vi.hoisted(() => ({
  cancelMutate: vi.fn(),
  retryMutate: vi.fn(),
  runMessages: [] as unknown[],
}));

vi.mock('@/lib/api', () => ({
  useCancelRun: () => ({ mutate: apiMocks.cancelMutate, isPending: false }),
  useRetryRun: () => ({ mutate: apiMocks.retryMutate, isPending: false }),
  useRunMessages: (runId?: string) => ({
    data: apiMocks.runMessages as never,
    isLoading: false,
    isError: false,
  }),
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

  it('G3-3：点「摘要」行内展开 transcript 预览，再点收起', () => {
    apiMocks.runMessages = [
      { kind: 'tool_start', body: JSON.stringify({ name: 'Read', args: 'readme.md' }), createdAt: '2026-07-30T00:00:00.000Z' },
      { kind: 'tool_end', body: JSON.stringify({ name: 'Read', result: '文件内容' }), createdAt: '2026-07-30T00:00:00.100Z' },
      { kind: 'assistant', body: '已读完 readme', createdAt: '2026-07-30T00:00:01.000Z' },
    ];
    const past = makeRun({ id: 'run-past-1' });
    render(
      <IssueRunHistory
        runs={[past]}
        selectedRunId={undefined}
        onSelect={vi.fn()}
        onOpenTimeline={vi.fn()}
      />,
    );

    // 初始未展开
    expect(screen.queryByTestId('issue-run-history-preview-panel')).toBeNull();

    fireEvent.click(screen.getByTestId('issue-run-history-preview'));
    expect(screen.getByTestId('issue-run-history-preview-panel')).toHaveAttribute('data-run-id', 'run-past-1');
    // 工具配对摘要 + 助手消息可见（不跳页可见产出）
    expect(screen.getByTestId('run-preview')).toHaveAttribute('data-run-id', 'run-past-1');
    expect(screen.getByTestId('run-preview-tool')).toHaveTextContent('Read');
    expect(screen.getByTestId('run-preview-assistant')).toHaveTextContent('已读完 readme');

    // 再点收起
    fireEvent.click(screen.getByTestId('issue-run-history-preview'));
    expect(screen.queryByTestId('issue-run-history-preview-panel')).toBeNull();
  });

  it('G3-3：无轨迹数据时展开显示空态', () => {
    apiMocks.runMessages = [];
    const past = makeRun({ id: 'run-empty-1' });
    render(
      <IssueRunHistory
        runs={[past]}
        selectedRunId={undefined}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('issue-run-history-preview'));
    expect(screen.getByTestId('run-preview-empty')).toHaveTextContent('暂无轨迹数据');
  });
});
