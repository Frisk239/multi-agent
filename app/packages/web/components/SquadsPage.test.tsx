import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * SquadsPage 组件测试
 * Mock next/navigation + @/lib/api hooks
 */

const push = vi.fn();
const replace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/squads',
  useSearchParams: () => mockSearchParams,
}));

const createMutate = vi.fn();
const deleteMutate = vi.fn();
const squadsData: Array<{ id: string; name: string; leaderId?: string; memberCount: number }> = [];
const agentsData: Array<{ id: string; name: string; runtime: string }> = [];

vi.mock('@/lib/api', () => ({
  useSquads: () => ({
    data: squadsData,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useAgents: () => ({
    data: agentsData,
  }),
  useCreateSquad: () => ({
    mutate: createMutate,
    isPending: false,
  }),
  useDeleteSquad: () => ({
    mutate: deleteMutate,
    isPending: false,
  }),
  useAgentsReadinessMap: () => ({
    data: {},
  }),
}));

import { SquadsPage } from './SquadsPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SquadsPage />
    </QueryClientProvider>,
  );
}

describe('SquadsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    squadsData.length = 0;
    agentsData.length = 0;
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders empty state when no squads exist', () => {
    renderPage();
    expect(screen.getByTestId('squads-page')).toBeTruthy();
    expect(screen.getByText('创建一个小队开始协作')).toBeTruthy();
  });

  it('renders squad table when squads exist', () => {
    squadsData.push(
      { id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 2 },
      { id: 'sqd-2', name: 'Beta', leaderId: 'agt-2', memberCount: 1 },
    );
    agentsData.push(
      { id: 'agt-1', name: 'Agent One', runtime: 'opencode' },
      { id: 'agt-2', name: 'Agent Two', runtime: 'claude-code' },
    );
    renderPage();
    expect(screen.getByTestId('squads-table')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();
    expect(screen.getByTestId('squads-visible-count')).toHaveTextContent('2');
  });

  it('disables new button when no agents exist', () => {
    renderPage();
    const btn = screen.getByTestId('squads-new-btn');
    expect(btn).toBeDisabled();
  });

  it('toggles create form on button click', () => {
    agentsData.push({ id: 'agt-1', name: 'Leader', runtime: 'opencode' });
    renderPage();
    const btn = screen.getByTestId('squads-new-btn');
    expect(btn).toHaveTextContent('新建小队');
    fireEvent.click(btn);
    expect(btn).toHaveTextContent('收起');
    expect(screen.getByPlaceholderText('如：补2小队')).toBeTruthy();
  });

  it('submits create form with correct input', () => {
    agentsData.push(
      { id: 'agt-1', name: 'Leader', runtime: 'opencode' },
      { id: 'agt-2', name: 'Member', runtime: 'claude-code' },
    );
    renderPage();
    fireEvent.click(screen.getByTestId('squads-new-btn'));

    const nameInput = screen.getByPlaceholderText('如：补2小队');
    fireEvent.change(nameInput, { target: { value: '测试小队' } });

    // Submit the form
    const form = nameInput.closest('form')!;
    fireEvent.submit(form);

    expect(createMutate).toHaveBeenCalledTimes(1);
    const input = createMutate.mock.calls[0][0];
    expect(input.name).toBe('测试小队');
    expect(input.leaderId).toBe('agt-1');
  });

  it('shows search input when squads exist', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 0 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    expect(screen.getByTestId('squads-search')).toBeTruthy();
  });

  it('shows leader and readiness filters', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 0 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    expect(screen.getByTestId('squads-leader-filter')).toBeTruthy();
    expect(screen.getByTestId('squads-ready-filter')).toBeTruthy();
  });

  it('shows empty filter message when filters match nothing', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 0 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    mockSearchParams = new URLSearchParams({ q: 'nonexistent' });
    renderPage();
    expect(screen.getByTestId('squads-empty-filter')).toBeTruthy();
    expect(screen.getByText('没有匹配的小队')).toBeTruthy();
  });

  it('navigates to squad detail on link click', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 0 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    const link = screen.getByText('Alpha').closest('a')!;
    expect(link.getAttribute('href')).toBe('/squads/sqd-1');
  });

  it('shows board and runs links per squad row', () => {
    squadsData.push({ id: 'sqd-1', name: 'Alpha', leaderId: 'agt-1', memberCount: 0 });
    agentsData.push({ id: 'agt-1', name: 'Agent One', runtime: 'opencode' });
    renderPage();
    expect(screen.getByTestId('squad-list-board')).toHaveAttribute(
      'href',
      '/?assignee=squad:sqd-1',
    );
    expect(screen.getByTestId('squad-list-runs')).toHaveAttribute(
      'href',
      '/runs?squad=sqd-1',
    );
  });
});
