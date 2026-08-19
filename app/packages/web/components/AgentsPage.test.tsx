import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSummary } from '@ma/shared';

const mockSearchParams = new URLSearchParams();
const agentsData: AgentSummary[] = [];

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/agents',
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/lib/api', () => ({
  useAgents: () => ({ data: agentsData, isLoading: false, isError: false, error: null }),
  useAgentsReadinessMap: () => ({ data: {} }),
  useCreateAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useUnarchiveAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useRuntimeModels: () => ({ data: { models: [] }, isFetching: false }),
}));

vi.mock('./AgentBuilderWizard', () => ({
  AgentBuilderWizard: () => <div data-testid="agent-builder-wizard" />,
}));

import { AgentsPage } from './AgentsPage';

function makeAgent(overrides: Partial<AgentSummary> = {}): AgentSummary {
  return {
    id: 'agt-default',
    name: 'Default Agent',
    runtime: 'opencode',
    category: null,
    model: null,
    thinkingLevel: null,
    fallbackAgentId: null,
    invocationPermission: 'auto',
    archivedAt: null,
    liveStatus: 'idle',
    activeRunCount: 0,
    currentIssueRun: null,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AgentsPage />
    </QueryClientProvider>,
  );
}

describe('AgentsPage active task peek', () => {
  beforeEach(() => {
    agentsData.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a single active Issue as an accessible direct run link without nesting it in the agent link', () => {
    agentsData.push(makeAgent({
      id: 'agt-single',
      name: 'Single Worker',
      liveStatus: 'working',
      activeRunCount: 1,
      currentIssueRun: {
        runId: 'run-single',
        runStatus: 'running',
        issueId: 'iss-single',
        issueIdentifier: 'FRI-813',
        issueTitle: '修复任务入口',
      },
    }));

    renderPage();

    const task = screen.getByTestId('agent-list-current-task');
    expect(task).toHaveAttribute('href', '/runs/run-single');
    expect(task).toHaveTextContent('FRI-813 · 修复任务入口');
    const identity = screen.getByTestId('agent-list-identity');
    expect(identity).toHaveAttribute('href', '/agents/agt-single');
    expect(identity.contains(task)).toBe(false);
  });

  it('keeps the newest Issue title visible but routes multi-active work to the filtered runs list', () => {
    agentsData.push(makeAgent({
      id: 'agt-multi',
      name: 'Multi Worker',
      liveStatus: 'working',
      activeRunCount: 3,
      currentIssueRun: {
        runId: 'run-latest-issue',
        runStatus: 'queued',
        issueId: 'iss-latest',
        issueIdentifier: 'FRI-814',
        issueTitle: '最新的并行任务',
      },
    }));

    renderPage();

    const task = screen.getByTestId('agent-list-current-task');
    expect(task).toHaveAttribute('href', '/runs?agent=agt-multi&status=active');
    expect(task).toHaveTextContent('FRI-814 · 最新的并行任务 · 3 条在途');
  });

  it('does not invent a task title for a single chat or quick-create run', () => {
    agentsData.push(makeAgent({
      id: 'agt-chat',
      name: 'Chat Worker',
      liveStatus: 'working',
      activeRunCount: 1,
      currentIssueRun: null,
    }));

    renderPage();

    expect(screen.queryByTestId('agent-list-current-task')).toBeNull();
    expect(screen.queryByTestId('agent-list-active-runs')).toBeNull();
  });
});
