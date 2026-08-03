import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import type { AgentRun, RunMessage } from '@ma/shared';
import {
  RunEventTimelineInline,
  RunEventTimelineDrawer,
} from './RunEventTimeline';

const run: AgentRun = {
  id: 'run-slice73',
  issueId: 'iss-1',
  agentId: 'ag-1',
  status: 'running',
  runtime: 'opencode',
  kind: 'issue',
  priority: 'none',
  quickPrompt: null,
  error: null,
  startedAt: '2026-07-27T00:00:00.000Z',
  finishedAt: null,
  lastHeartbeatAt: '2026-07-27T00:00:00.000Z',
  isLeader: false,
  squadId: null,
  createdAt: '2026-07-27T00:00:00.000Z',
};

const toolMessages: RunMessage[] = [
  {
    id: 'm1',
    runId: 'run-slice73',
    seq: 1,
    kind: 'tool_start',
    body: JSON.stringify({
      name: 'read_file',
      args: { path: '/tmp/a.txt', mode: 'r' },
    }),
    createdAt: '2026-07-27T00:00:01.000Z',
  },
  {
    id: 'm2',
    runId: 'run-slice73',
    seq: 2,
    kind: 'tool_end',
    body: JSON.stringify({
      name: 'read_file',
      result: 'file contents here',
    }),
    createdAt: '2026-07-27T00:00:02.000Z',
  },
];

let messages: RunMessage[] = [];
let partialByRunId: Record<string, string> = {};
let streamChunks: Record<string, string> = {};
let byRunId: Record<string, string> = {};
let toolByRunId: Record<string, string> = {};

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

vi.mock('@/lib/api', () => ({
  useRunMessages: () => ({ data: messages, isLoading: false }),
  useChildRuns: () => ({ data: [] }),
  useAutoRetryChild: () => ({ data: null }),
  useRetryRun: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/ws', () => ({
  useRunProgressStore: (
    sel: (s: {
      byRunId: Record<string, string>;
      toolByRunId: Record<string, string>;
      partialByRunId: Record<string, string>;
      streamChunks: Record<string, string>;
    }) => unknown,
  ) =>
    sel({
      byRunId,
      toolByRunId,
      partialByRunId,
      streamChunks,
    }),
}));

vi.mock('@/lib/use-focus-trap', () => ({
  useFocusTrap: () => {},
}));

vi.mock('./MarkdownBody', () => ({
  MarkdownBody: ({ source }: { source: string }) => (
    <div data-testid="md-body">{source}</div>
  ),
}));

describe('RunEventTimeline Slice 73', () => {
  beforeEach(() => {
    messages = [];
    partialByRunId = {};
    streamChunks = {};
    byRunId = {};
    toolByRunId = {};
  });

  afterEach(() => {
    cleanup();
  });

  it('inline shows run-partial when live partial exists', () => {
    partialByRunId = {
      'run-slice73': 'Hello **partial** stream from agent',
    };
    render(<RunEventTimelineInline run={run} />);
    const el = screen.getByTestId('run-partial');
    expect(el).toBeTruthy();
    expect(el.textContent).toContain('Hello');
    expect(el.textContent).toContain('partial');
  });

  it('inline shows stream chunk and pair denser args preview', () => {
    messages = toolMessages;
    streamChunks = { 'run-slice73': 'token stream…' };
    render(<RunEventTimelineInline run={run} />);
    expect(screen.getByTestId('run-stream-chunk').textContent).toContain(
      'token stream',
    );
    const pair = screen.getByTestId('run-event-tool-pair');
    expect(pair.getAttribute('data-kind-tone')).toBe('tool');
    expect(pair.className).toMatch(/run-event-kind-bar/);
    expect(screen.getByTestId('run-event-tool-pair-name').textContent).toBe(
      'read_file',
    );
    const preview = screen.getByTestId('run-event-preview');
    expect(preview.getAttribute('data-preview-kind')).toBe('args');
    expect(preview.textContent).toMatch(/path|tmp|a\.txt/);
  });

  it('drawer shows partial when live', () => {
    partialByRunId = { 'run-slice73': 'Drawer partial text' };
    messages = toolMessages;
    render(
      <RunEventTimelineDrawer run={run} open onClose={() => {}} />,
    );
    expect(screen.getByTestId('run-event-drawer')).toBeTruthy();
    const partial = screen.getByTestId('run-partial');
    expect(partial.textContent).toContain('Drawer partial text');
    expect(screen.getByTestId('run-event-drawer-body').getAttribute('data-stick-bottom')).toBe(
      '1',
    );
  });
});
