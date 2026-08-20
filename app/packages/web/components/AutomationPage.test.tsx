import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AutomationRule, AutomationRun } from '@ma/shared';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  rules: [] as AutomationRule[],
  runsByRule: {} as Record<string, AutomationRun[]>,
  useAutomationRunsCalls: [] as Array<{ ruleId: string; limit: number | undefined }>,
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
  useAutomationRuns: (ruleId: string, limit?: number) => {
    mocks.useAutomationRunsCalls.push({ ruleId, limit });
    return {
      data: mocks.runsByRule[ruleId] ?? [],
      isLoading: false,
      isError: false,
    };
  },
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
    mocks.useAutomationRunsCalls = [];
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
    mocks.useAutomationRunsCalls = [];
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
    expect(mocks.useAutomationRunsCalls).toContainEqual({ ruleId: 'rule-1', limit: 8 });
  });
});

describe('AutomationPage skipped streak drilldown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rules = [rule({ skippedStreak: 3, lastRunStatus: 'skipped' })];
    mocks.useAutomationRunsCalls = [];
    mocks.runsByRule = {
      'rule-1': [
        automationRun('skipped', {
          id: 'skip-newest',
          source: 'schedule',
          plannedAt: '2026-08-20T03:00:00.000Z',
          error: '最新跳过原因',
        }),
        automationRun('skipped', {
          id: 'skip-earlier',
          source: 'manual',
          plannedAt: '2026-08-20T02:00:00.000Z',
          error: '较早跳过原因',
        }),
        automationRun('pending_dispatch', {
          id: 'pending-still-actionable',
          source: 'manual',
          plannedAt: '2026-08-20T01:00:00.000Z',
          issueId: 'iss-pending',
          linkedRunId: 'run/pending + 1',
          error: 'Agent 离线，等待重新派发',
        }),
      ],
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('uses a keyboard-operable warning to request the 20-record drilldown and focus its collapsed summary', async () => {
    const user = userEvent.setup();
    renderPage();

    const warning = screen.getByTestId('automation-skipped-streak-rule-1');
    expect(warning.tagName).toBe('BUTTON');
    expect(warning).toHaveAttribute('aria-expanded', 'false');
    warning.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mocks.useAutomationRunsCalls).toContainEqual({ ruleId: 'rule-1', limit: 20 });
    });
    const runs = screen.getByTestId('automation-rule-runs-rule-1');
    expect(runs).toHaveAttribute('data-limit', '20');
    expect(warning).toHaveAttribute('aria-expanded', 'true');

    const group = screen.getByTestId('automation-skipped-group-rule-1');
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(group).toHaveTextContent('已跳过 2 次');
    expect(screen.getByTestId('automation-skipped-summary-rule-1')).toHaveTextContent(
      '最新跳过原因',
    );
    await waitFor(() => expect(document.activeElement).toBe(group));
    expect(screen.queryByTestId('automation-skipped-details-rule-1')).toBeNull();

    await user.click(group);
    expect(group).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('automation-skipped-detail-skip-newest')).toHaveTextContent(
      '来源：schedule计划时刻：',
    );
    expect(screen.getByTestId('automation-skipped-detail-skip-newest')).toHaveTextContent(
      '原因：最新跳过原因',
    );
    expect(screen.getByTestId('automation-skipped-detail-skip-earlier')).toHaveTextContent(
      '来源：manual',
    );

    // Ordinary records stay on the pre-existing table path, including repair
    // and deep-link actions that must not be hidden by the skipped group.
    expect(screen.getByTestId('automation-reconcile-pending-still-actionable')).toBeInTheDocument();
    expect(screen.getByTestId('automation-linked-issue-pending-still-actionable')).toHaveAttribute(
      'href',
      '/issues/iss-pending',
    );
    expect(screen.getByTestId('automation-linked-run')).toHaveAttribute(
      'href',
      '/runs?run=run%2Fpending%20%2B%201',
    );
  });

  it('keeps the ordinary recent-runs control on its smaller window', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '最近执行' }));

    expect(screen.getByTestId('automation-rule-runs-rule-1')).toHaveAttribute('data-limit', '8');
    expect(mocks.useAutomationRunsCalls).toContainEqual({ ruleId: 'rule-1', limit: 8 });
  });

  it('does not render a skipped group for ordinary-only history', () => {
    mocks.rules = [rule({ skippedStreak: 0, lastRunStatus: 'pending_dispatch' })];
    mocks.runsByRule = {
      'rule-1': [
        automationRun('pending_dispatch', {
          id: 'pending-only',
          issueId: 'iss-only',
          linkedRunId: 'run-only',
        }),
      ],
    };
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '最近执行' }));

    expect(screen.queryByTestId('automation-skipped-group-rule-1')).toBeNull();
    expect(screen.getByTestId('automation-reconcile-pending-only')).toBeInTheDocument();
  });

  it('labels a capped streak as ≥20 and visibly explains the bounded window', () => {
    mocks.rules = [rule({ skippedStreak: 20, lastRunStatus: 'skipped' })];
    renderPage();

    expect(screen.getByTestId('automation-skipped-streak-rule-1')).toHaveTextContent(
      '连续跳过 ≥20 次',
    );
    expect(screen.getByTestId('automation-skipped-window-note-rule-1')).toHaveTextContent(
      '仅基于最近 20 条执行记录',
    );
  });
});
