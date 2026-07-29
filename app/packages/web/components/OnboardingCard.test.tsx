import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAY0_SESSION_KEY, DAY0_STORAGE_KEY } from '@/lib/day0-onboarding';
import { OnboardingCard } from './OnboardingCard';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  API: 'http://api.test/api',
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

function response(body: Record<string, unknown>, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  });
}

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingCard />
    </QueryClientProvider>,
  );
}

const incomplete = {
  hasRuntimes: true,
  installedRuntimesCount: 1,
  hasValidProject: false,
  validProjectCount: 0,
  hasAgents: false,
  activeAgentCount: 0,
  hasAssignedIssueRun: false,
  firstIssueId: null,
  firstIssueIdentifier: null,
  firstRunId: null,
  firstRunStatus: null,
  completed: false,
};

describe('OnboardingCard', () => {
  afterEach(cleanup);

  beforeEach(() => {
    apiFetch.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders one real-condition flow and keeps progress across remounts', async () => {
    apiFetch.mockReturnValue(response(incomplete));
    const first = renderCard();
    expect(await screen.findByTestId('onboarding-card')).toBeVisible();
    expect(screen.getByTestId('onboarding-step-runtime')).toHaveAttribute('data-done', '1');
    expect(screen.getByTestId('onboarding-step-project')).toHaveAttribute('data-done', '0');
    expect(screen.getByTestId('onboarding-step-agent')).toBeVisible();
    first.unmount();

    renderCard();
    expect(await screen.findByTestId('onboarding-step-runtime')).toHaveAttribute('data-done', '1');
  });

  it('dismisses only for the current session', async () => {
    apiFetch.mockReturnValue(response(incomplete));
    renderCard();
    fireEvent.click(await screen.findByTestId('onboarding-dismiss'));
    expect(sessionStorage.getItem(DAY0_SESSION_KEY)).toBe('1');
    expect(localStorage.getItem(DAY0_STORAGE_KEY)).toBeNull();
    expect(screen.queryByTestId('onboarding-card')).toBeNull();
  });

  it('shows success once, persists completion, then stays hidden after reload', async () => {
    apiFetch.mockReturnValue(
      response({
        ...incomplete,
        hasValidProject: true,
        validProjectCount: 1,
        hasAgents: true,
        activeAgentCount: 1,
        hasAssignedIssueRun: true,
        firstIssueId: 'i-1',
        firstIssueIdentifier: 'FRI-1',
        firstRunId: 'r-1',
        firstRunStatus: 'running',
        completed: true,
      }),
    );
    const first = renderCard();
    expect(await screen.findByTestId('onboarding-success')).toBeVisible();
    expect(screen.getByTestId('onboarding-open-run')).toHaveAttribute('href', '/runs?run=r-1');
    expect(localStorage.getItem(DAY0_STORAGE_KEY)).toContain('"runId":"r-1"');
    first.unmount();

    renderCard();
    await act(async () => {});
    await waitFor(() => expect(screen.queryByTestId('onboarding-card')).toBeNull());
    expect(screen.queryByTestId('onboarding-success')).toBeNull();
  });

  it('explains API failure and retries', async () => {
    apiFetch
      .mockReturnValueOnce(response({}, false))
      .mockReturnValueOnce(response(incomplete));
    renderCard();
    expect(await screen.findByTestId('onboarding-error')).toHaveTextContent('HTTP 503');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByTestId('onboarding-card')).toBeVisible();
  });
});
