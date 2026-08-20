import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AutomationRun } from '@ma/shared';
import React from 'react';

const toastSuccess = vi.fn();
const toastWarning = vi.fn();
const toastError = vi.fn();

vi.mock('../toast', () => ({
  toastSuccess: (...args: unknown[]) => toastSuccess(...args),
  toastWarning: (...args: unknown[]) => toastWarning(...args),
  toastError: (...args: unknown[]) => toastError(...args),
}));

import { useArchiveAutomationRule, useRunAutomationNow } from './automation';

function automationRun(
  status: string | null | undefined,
  overrides: Omit<Partial<AutomationRun>, 'status'> = {},
): AutomationRun {
  return {
    id: 'auto-run-1',
    ruleId: 'rule-1',
    plannedAt: '2026-08-19T00:00:00.000Z',
    source: 'manual',
    // The transport is intentionally not parsed at this boundary; exercise drift
    // exactly as a future server response would reach the hook at runtime.
    status: status as AutomationRun['status'],
    issueId: null,
    linkedRunId: null,
    error: null,
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe('useRunAutomationNow', () => {
  const fetchMock = vi.fn();
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    qc = newClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function runNow(run: AutomationRun) {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => run,
    });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useRunAutomationNow(), { wrapper });
    await act(async () => {
      await hook.result.current.mutateAsync(run.ruleId);
    });
    return hook;
  }

  it.each([
    ['issue_created', 'success', '已创建 Issue'],
    ['running', 'success', '已创建 Issue'],
    ['skipped', 'warning', 'runtime missing'],
    ['dispatching', 'warning', '仍在派发中'],
    ['retrying', 'warning', '仍在自动重试中'],
    ['pending_dispatch', 'error', 'Issue 已创建，但尚未派发'],
    ['failed', 'error', 'dispatch failed'],
    ['success', 'error', '可确认的派发结果'],
    [null, 'error', '可确认的派发结果'],
    [undefined, 'error', '可确认的派发结果'],
    ['', 'error', '可确认的派发结果'],
    ['future_status', 'error', '可确认的派发结果'],
  ] as const)(
    'uses a %s toast for runtime status %p',
    async (status, kind, message) => {
      await runNow(
        automationRun(status, {
          issueId: status === 'issue_created' || status === 'running' ? 'iss-12345678' : null,
          error:
            status === 'skipped'
              ? 'runtime missing'
              : status === 'failed'
                ? 'dispatch failed'
                : null,
        }),
      );

      const expected =
        kind === 'success' ? toastSuccess : kind === 'warning' ? toastWarning : toastError;
      expect(expected).toHaveBeenCalled();
      expect(String(expected.mock.calls[0]?.[0] ?? '')).toContain(message);
      if (kind !== 'success') expect(toastSuccess).not.toHaveBeenCalled();
      if (kind !== 'warning') expect(toastWarning).not.toHaveBeenCalled();
    },
  );

  it('calls a run-only issue_created result a dispatched run, not a created Issue', async () => {
    await runNow(
      automationRun('issue_created', {
        linkedRunId: 'run-abcdef12',
      }),
    );

    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining('已派发运行'),
      expect.objectContaining({
        action: { label: '查看运行', href: '/runs?run=run-abcdef12' },
      }),
    );
    expect(String(toastSuccess.mock.calls[0]?.[0] ?? '')).not.toContain('已创建 Issue');
  });

  it('keeps pending_dispatch repair CTA and invalidates the existing rule caches', async () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    await runNow(
      automationRun('pending_dispatch', {
        issueId: 'iss-pending',
        error: 'agent 离线',
      }),
    );

    expect(toastError).toHaveBeenCalledWith(
      'agent 离线',
      expect.objectContaining({
        action: { label: '打开 Issue', href: '/issues/iss-pending' },
      }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['automation-rules'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['automation-runs', 'rule-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['issues'] });
  });

  it('keeps the Settings repair CTA when pending_dispatch has no Issue', async () => {
    await runNow(automationRun('pending_dispatch'));

    expect(toastError).toHaveBeenCalledWith(
      'Issue 已创建，但尚未派发',
      expect.objectContaining({
        action: { label: '环境诊断', href: '/settings' },
      }),
    );
  });
});

describe('useArchiveAutomationRule', () => {
  const fetchMock = vi.fn();
  let qc: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    qc = newClient();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the DELETE transport but announces archive history preservation', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useArchiveAutomationRule(), { wrapper });

    await act(async () => {
      await hook.result.current.mutateAsync('rule-archive-1');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/automation/rules/rule-archive-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['automation-rules'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['automation-runs', 'rule-archive-1'],
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      '规则已归档：已停止后续计划，执行记录已保留',
    );
  });
});
