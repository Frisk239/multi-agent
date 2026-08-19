import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/automation',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api', () => ({
  API: 'http://localhost:3001/api',
  apiFetch: vi.fn(),
  useAutomationRules: () => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useAutomationRuns: () => ({ data: [] }),
  useCreateAutomationRule: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAutomationRule: () => ({ mutate: vi.fn() }),
  useRunAutomationNow: () => ({ mutate: vi.fn() }),
  useReconcileAutomationRun: () => ({ mutate: vi.fn() }),
  useUpdateAutomationRule: () => ({ mutate: vi.fn() }),
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

import { AutomationPage } from './AutomationPage';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AutomationPage />
    </QueryClientProvider>,
  );
}

describe('AutomationPage assignee search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
