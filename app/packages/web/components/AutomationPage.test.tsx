import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AutomationRule, AutomationRun, WebhookDelivery } from '@ma/shared';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  rules: [] as AutomationRule[],
  runsByRule: {} as Record<string, AutomationRun[]>,
  deliveriesByRule: {} as Record<string, WebhookDelivery[]>,
  useAutomationRunsCalls: [] as Array<{ ruleId: string; limit: number | undefined }>,
  runNowMutate: vi.fn(),
  archiveMutate: vi.fn(),
  webhookRotateMutate: vi.fn(),
  webhookEventsMutate: vi.fn(),
  webhookRateMutate: vi.fn(),
  confirmDialog: vi.fn(),
  clipboardWrite: vi.fn(),
  archivedAgentIds: new Set<string>(),
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
  useRotateAutomationWebhookToken: () => ({
    mutate: mocks.webhookRotateMutate,
    isPending: false,
  }),
  useUpdateAutomationWebhookEvents: () => ({
    mutate: mocks.webhookEventsMutate,
    isPending: false,
  }),
  useUpdateAutomationWebhookRate: () => ({
    mutate: mocks.webhookRateMutate,
    isPending: false,
  }),
  useAutomationWebhookDeliveries: (ruleId: string, limit?: number) => {
    void limit;
    return {
      data: mocks.deliveriesByRule[ruleId] ?? [],
      isLoading: false,
      isError: false,
    };
  },
  useAgents: (opts?: { archived?: '0' | '1' | 'all' }) => {
    const all = [
      {
        id: 'agt-alpha',
        name: '巡检甲',
        runtime: 'opencode',
        archivedAt: mocks.archivedAgentIds.has('agt-alpha') ? '2026-08-20T01:00:00.000Z' : null,
      },
      {
        id: 'agt-beta',
        name: '审查乙',
        runtime: 'claude-code',
        archivedAt: mocks.archivedAgentIds.has('agt-beta') ? '2026-08-20T01:00:00.000Z' : null,
      },
    ];
    return { data: opts?.archived === 'all' ? all : all.filter((agent) => !agent.archivedAt) };
  },
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
    webhookRatePerMin: null,
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
    mocks.archivedAgentIds.clear();
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
    mocks.archivedAgentIds.clear();
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

  it('marks an archived run_only target and presents Run Now as a persisted skipped outcome, not a launch', () => {
    mocks.archivedAgentIds.add('agt-alpha');
    const archivedSkip = automationRun('skipped', {
      id: 'auto-archived-skip',
      error: '智能体「巡检甲」已归档，恢复后才能派发',
    });
    mocks.runsByRule = { 'rule-1': [archivedSkip] };
    renderPage();

    expect(screen.getByTestId('automation-archived-target-rule-1')).toHaveTextContent(
      '智能体已归档 · 立即执行将跳过',
    );
    resolveRunNow(archivedSkip);
    expect(screen.getByTestId('automation-rule-runs-rule-1')).toBeInTheDocument();
    expect(screen.getByTestId('automation-skipped-summary-rule-1')).toHaveTextContent(
      '智能体「巡检甲」已归档，恢复后才能派发',
    );
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
    mocks.archivedAgentIds.clear();
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

describe('AutomationPage webhook section', () => {
  const TOKEN = 'a'.repeat(48);

  function delivery(overrides: Partial<WebhookDelivery> = {}): WebhookDelivery {
    return {
      id: 'dly-1',
      ruleId: 'rule-1',
      event: 'push',
      status: 'dispatched',
      payloadJson: null,
      automationRunId: 'auto-run-9',
      error: null,
      createdAt: '2026-08-20T02:00:00.000Z',
      ...overrides,
    };
  }

  function openSection() {
    fireEvent.click(screen.getByTestId('automation-webhook-toggle-rule-1'));
    expect(screen.getByTestId('automation-webhook-section')).toBeInTheDocument();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.archivedAgentIds.clear();
    mocks.rules = [rule()];
    mocks.runsByRule = {};
    mocks.deliveriesByRule = {};
    mocks.confirmDialog.mockResolvedValue(true);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mocks.clipboardWrite },
      configurable: true,
    });
  });
  afterEach(() => {
    cleanup();
  });

  it('without a token the section offers generation only (no URL, no filter input)', () => {
    renderPage();
    openSection();

    expect(screen.getByTestId('automation-webhook-generate')).toBeInTheDocument();
    expect(screen.queryByTestId('automation-webhook-url')).toBeNull();
    expect(screen.queryByTestId('automation-webhook-events-input')).toBeNull();

    fireEvent.click(screen.getByTestId('automation-webhook-generate'));
    expect(mocks.webhookRotateMutate).toHaveBeenCalledWith('rule-1');
  });

  it('with a token the section shows the full URL derived from the API base and copies it', async () => {
    mocks.rules = [rule({ webhookToken: TOKEN, webhookEvents: ['push'] })];
    renderPage();
    openSection();

    const url = screen.getByTestId('automation-webhook-url');
    expect(url).toHaveTextContent(`http://localhost:3001/api/webhooks/${TOKEN}`);
    expect(
      (screen.getByTestId('automation-webhook-events-input') as HTMLInputElement).value,
    ).toBe('push');

    mocks.clipboardWrite.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByTestId('automation-webhook-copy'));
    await waitFor(() =>
      expect(mocks.clipboardWrite).toHaveBeenCalledWith(
        `http://localhost:3001/api/webhooks/${TOKEN}`,
      ),
    );
  });

  it('rotation requires a danger confirm that warns the old URL dies immediately', async () => {
    mocks.rules = [rule({ webhookToken: TOKEN })];
    renderPage();
    openSection();

    fireEvent.click(screen.getByTestId('automation-webhook-rotate'));
    await waitFor(() => {
      expect(mocks.confirmDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '轮换 Webhook token？',
          description: expect.stringContaining('旧 URL 立即失效'),
          variant: 'danger',
        }),
      );
      expect(mocks.webhookRotateMutate).toHaveBeenCalledWith('rule-1');
    });
  });

  it('declining the rotation confirm keeps the current token untouched', async () => {
    mocks.confirmDialog.mockResolvedValueOnce(false);
    mocks.rules = [rule({ webhookToken: TOKEN })];
    renderPage();
    openSection();

    fireEvent.click(screen.getByTestId('automation-webhook-rotate'));
    await waitFor(() => expect(mocks.confirmDialog).toHaveBeenCalled());
    expect(mocks.webhookRotateMutate).not.toHaveBeenCalled();
  });

  it('saves the event filter as a comma string and clears it with an empty draft', () => {
    mocks.rules = [rule({ webhookToken: TOKEN })];
    renderPage();
    openSection();

    const input = screen.getByTestId('automation-webhook-events-input');
    fireEvent.change(input, { target: { value: ' push , tag_push ' } });
    fireEvent.click(screen.getByTestId('automation-webhook-events-save'));
    expect(mocks.webhookEventsMutate).toHaveBeenCalledWith({
      id: 'rule-1',
      events: 'push , tag_push',
    });

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('automation-webhook-events-save'));
    expect(mocks.webhookEventsMutate).toHaveBeenLastCalledWith({ id: 'rule-1', events: null });
  });

  it('rate input shows the configured cap or the default placeholder and saves a number', () => {
    mocks.rules = [rule({ webhookToken: TOKEN, webhookRatePerMin: 30 })];
    renderPage();
    openSection();

    const input = screen.getByTestId('automation-webhook-rate-input') as HTMLInputElement;
    expect(input.value).toBe('30');

    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('automation-webhook-rate-save'));
    expect(mocks.webhookRateMutate).toHaveBeenCalledWith({ id: 'rule-1', perMinute: 5 });
  });

  it('an empty rate draft restores the default (null) and invalid input is blocked locally', () => {
    mocks.rules = [rule({ webhookToken: TOKEN, webhookRatePerMin: 30 })];
    renderPage();
    openSection();

    const input = screen.getByTestId('automation-webhook-rate-input');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('automation-webhook-rate-save'));
    expect(mocks.webhookRateMutate).toHaveBeenLastCalledWith({ id: 'rule-1', perMinute: null });

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('automation-webhook-rate-save'));
    expect(mocks.webhookRateMutate).toHaveBeenLastCalledWith({ id: 'rule-1', perMinute: null });

    fireEvent.change(input, { target: { value: '2.5' } });
    fireEvent.click(screen.getByTestId('automation-webhook-rate-save'));
    expect(mocks.webhookRateMutate).toHaveBeenLastCalledWith({ id: 'rule-1', perMinute: null });
  });

  it('a rule without a custom cap renders the default placeholder in the rate input', () => {
    mocks.rules = [rule({ webhookToken: TOKEN })];
    renderPage();
    openSection();

    const input = screen.getByTestId('automation-webhook-rate-input') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('默认 10/分钟');
  });

  it('renders recent deliveries with status, time and an automation-run deep link', () => {
    mocks.rules = [rule({ webhookToken: TOKEN })];
    mocks.deliveriesByRule = {
      'rule-1': [
        delivery(),
        delivery({
          id: 'dly-2',
          event: 'issue_comment',
          status: 'filtered',
          automationRunId: null,
          error: '事件 issue_comment 不在过滤列表（push）',
        }),
        delivery({
          id: 'dly-3',
          event: 'push',
          status: 'rate_limited',
          automationRunId: null,
          error: '触发频率超限：滑动窗口 60s 内已 dispatched 10 次（上限 10/分钟）',
        }),
      ],
    };
    renderPage();
    openSection();

    const rows = screen.getByTestId('automation-webhook-deliveries');
    expect(rows).toHaveTextContent('push');
    expect(rows).toHaveTextContent('已触发');
    expect(rows).toHaveTextContent('issue_comment');
    expect(rows).toHaveTextContent('已过滤');
    expect(rows).toHaveTextContent('已限流');

    const runLink = screen.getByTestId('automation-webhook-delivery-run-dly-1');
    expect(runLink).toHaveAttribute('href', '/runs?run=auto-run-9');
    expect(screen.queryByTestId('automation-webhook-delivery-run-dly-2')).toBeNull();
  });

  it('an archived rule keeps the section readable but stops offering actions', () => {
    mocks.rules = [rule({ webhookToken: TOKEN, archivedAt: '2026-08-20T01:00:00.000Z' })];
    renderPage();
    openSection();

    expect(screen.getByTestId('automation-webhook-section')).toHaveTextContent(
      '规则已归档，Webhook 不会再触发',
    );
    expect(screen.queryByTestId('automation-webhook-rotate')).toBeNull();
    expect(screen.queryByTestId('automation-webhook-events-save')).toBeNull();
  });
});
