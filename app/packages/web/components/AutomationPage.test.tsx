import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AutomationRule, AutomationRun } from '@ma/shared';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  rules: [] as AutomationRule[],
  runsByRule: {} as Record<string, AutomationRun[]>,
  runNowMutate: vi.fn(),
  archiveMutate: vi.fn(),
  confirmDialog: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/automation',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => ({
  API: 'http://localhost:3001/api',
  apiFetch: vi.fn(),
  useAutomationRules: () => ({
    data: mocks.rules,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useAutomationRuns: (ruleId: string) => ({
    data: mocks.runsByRule[ruleId] ?? [],
    isLoading: false,
    isError: false,
  }),
  useCreateAutomationRule: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveAutomationRule: () => ({ mutate: mocks.archiveMutate, isPending: false }),
  useRunAutomationNow: () => ({ mutate: mocks.runNowMutate, isPending: false }),
  useReconcileAutomationRun: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAutomationRule: () => ({ mutate: vi.fn(), isPending: false }),
  useAgents: () => ({
    data: [
      { id: 'agt-alpha', name: '巡检甲', runtime: 'opencode' },
      { id: 'agt-beta', name: '审查乙', runtime: 'claude-code' },
    ],
  }),
  useSquads: () => ({ data: [{ id: 'sqd-1', name: '产品小队' }] }),
  useAgentsReadinessMap: () => ({
    data: {
      'agt-alpha': { status: 'ready', runtimeInstalled: true },
      'agt-beta': { status: 'ready', runtimeInstalled: true },
    },
  }),
}));

vi.mock('@/lib/confirm-store', () => ({
  confirmDialog: mocks.confirmDialog,
}));

import { AutomationPage } from './AutomationPage';

function rule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    id: 'rule-1',
    name: '夜间巡检',
    enabled: true,
    archivedAt: null,
    scheduleKind: 'interval_minutes',
    intervalMinutes: 15,
    dailyTime: null,
    cronExpression: null,
    assigneeType: 'agent',
    assigneeId: 'agt-alpha',
    titleTemplate: '巡检 {{date}}',
    bodyTemplate: '检查健康状态',
    executionMode: 'run_only',
    lastPlannedAt: null,
    nextPlannedAt: null,
    failCount: 0,
    skippedStreak: 0,
    lastRunStatus: null,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

function automationRun(
  status: string,
  overrides: Omit<Partial<AutomationRun>, 'status'> = {},
): AutomationRun {
  return {
    id: 'auto-run-1',
    ruleId: 'rule-1',
    plannedAt: '2026-08-19T00:00:00.000Z',
    source: 'manual',
    status: status as AutomationRun['status'],
    issueId: null,
    linkedRunId: null,
    error: null,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AutomationPage />
    </QueryClientProvider>,
  );
}

function resolveRunNow(run: AutomationRun) {
  fireEvent.click(screen.getByTestId('automation-run-now-rule-1'));
  const [, options] = mocks.runNowMutate.mock.calls[0] ?? [];
  expect(options?.onSuccess).toBeTypeOf('function');
  act(() => {
    options.onSuccess(run);
  });
}

describe('AutomationPage assignee search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rules = [];
    mocks.runsByRule = {};
    mocks.confirmDialog.mockResolvedValue(true);
  });
  afterEach(() => {
    cleanup();
  });

  it('空白新建表单用可搜指派，能滤掉不匹配的 agent', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('automation-new-blank'));
    expect(screen.getByTestId('automation-create-assignee-search')).toBeInTheDocument();
    const select = screen.getByTestId('automation-create-assignee') as HTMLSelectElement;
    expect(select.querySelector('option[value="agent:agt-alpha"]')).toBeTruthy();
    expect(select.querySelector('option[value="agent:agt-beta"]')).toBeTruthy();

    fireEvent.change(screen.getByTestId('automation-create-assignee-search'), {
      target: { value: '审查' },
    });
    expect(select.querySelector('option[value="agent:agt-beta"]')).toBeTruthy();
    expect(select.querySelector('option[value="agent:agt-alpha"]')).toBeNull();
  });

  it('uses archive language and promises to preserve execution history', async () => {
    mocks.rules = [rule()];
    renderPage();

    fireEvent.click(screen.getByTestId('automation-archive-rule-1'));

    await waitFor(() => {
      expect(mocks.confirmDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '归档自动化规则？',
          description: expect.stringContaining('停止后续计划，保留已有执行记录'),
          confirmLabel: '归档',
        }),
      );
      expect(mocks.archiveMutate).toHaveBeenCalledWith(
        'rule-1',
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });
});

describe('AutomationPage run-now outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rules = [rule()];
    mocks.runsByRule = { 'rule-1': [] };
  });
  afterEach(() => {
    cleanup();
  });

  it.each([
    'skipped',
    'dispatching',
    'retrying',
    'pending_dispatch',
    'failed',
    'success',
    'future_status',
  ])('expands this rule\'s recent runs after non-success %s', (status) => {
    renderPage();
    resolveRunNow(automationRun(status));
    expect(screen.getByTestId('automation-rule-runs-rule-1')).toBeInTheDocument();
  });

  it('does not open recent runs after a successful dispatch', () => {
    renderPage();
    resolveRunNow(automationRun('issue_created', { linkedRunId: 'run-1' }));
    expect(screen.queryByTestId('automation-rule-runs-rule-1')).toBeNull();
  });

  it('keeps pending dispatch repair and linked-run actions inside auto-expanded recent runs', () => {
    const pending = automationRun('pending_dispatch', {
      id: 'auto-pending',
      linkedRunId: 'run/linked + 1',
      issueId: 'iss-pending',
      error: 'agent 离线',
    });
    mocks.runsByRule = { 'rule-1': [pending] };
    renderPage();
    resolveRunNow(pending);

    expect(screen.getByTestId('automation-reconcile-auto-pending')).toBeInTheDocument();
    expect(screen.getByTestId('automation-linked-run')).toHaveAttribute(
      'href',
      '/runs?run=run%2Flinked%20%2B%201',
    );
  });
});
