import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * SquadDetailPage 归档语义测试（G2-9 squad-retirement-dispatch-closure）
 * Mock @/lib/api hooks + confirmDialog + SquadRunsTimeline
 */

type SquadFixture = {
  id: string;
  name: string;
  leaderId: string;
  operatingProtocol: string;
  missionDirective: string;
  members: Array<{ agentId: string; name: string }>;
  archivedAt: string | null;
};

let squadData: SquadFixture | null = null;

const updateMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock('@/lib/api', () => ({
  useSquad: () => ({
    data: squadData,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useAgents: () => ({
    data: [
      { id: 'agt-1', name: 'leader-a', runtime: 'claude-code' },
      { id: 'agt-2', name: 'member-b', runtime: 'claude-code' },
    ],
  }),
  useUpdateSquad: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSquad: () => ({ mutate: deleteMutate, isPending: false }),
  useAgentsReadinessMap: () => ({ data: {} }),
}));

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: string;
};
const confirmDialog = vi.hoisted(() =>
  vi.fn((_opts: ConfirmOptions) => Promise.resolve(true)),
);
vi.mock('@/lib/confirm-store', () => ({ confirmDialog }));

vi.mock('./SquadRunsTimeline', () => ({
  SquadRunsTimeline: () => <div data-testid="squad-runs-timeline-stub" />,
}));

import { SquadDetailPage } from './SquadDetailPage';

function activeSquad(): SquadFixture {
  return {
    id: 'sqd-1',
    name: 'Alpha Squad',
    leaderId: 'agt-1',
    operatingProtocol: '',
    missionDirective: '',
    members: [{ agentId: 'agt-2', name: 'member-b' }],
    archivedAt: null,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SquadDetailPage squadId="sqd-1" />
    </QueryClientProvider>,
  );
}

describe('SquadDetailPage 归档语义', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    squadData = activeSquad();
  });

  afterEach(() => {
    cleanup();
  });

  it('active squad：归档按钮可点，确认文案声明不可恢复与 leader 转交', async () => {
    renderPage();
    const btn = screen.getByRole('button', { name: '归档小队' });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    const args = vi.mocked(confirmDialog).mock.calls[0][0] as ConfirmOptions;
    expect(args.title).toBe('归档小队？');
    expect(args.description).toContain('不可恢复');
    expect(args.description).toContain('former leader');
    expect(args.confirmLabel).toBe('归档小队');
    expect(deleteMutate).toHaveBeenCalledWith('sqd-1');
  });

  it('确认取消时不触发归档', async () => {
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '归档小队' }));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalledTimes(1));
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it('archived squad：显示已归档历史只读说明，不伪称 active', () => {
    squadData = { ...activeSquad(), archivedAt: '2026-08-20T00:00:00.000Z' };
    renderPage();
    const note = screen.getByTestId('squad-archived-note');
    expect(note.textContent).toContain('已归档 · 历史只读');
    expect(note.textContent).toContain('不可恢复');
    expect(note.textContent).toContain('转交给队长');
  });

  it('archived squad：归档按钮与编辑表单全部禁用', () => {
    squadData = { ...activeSquad(), archivedAt: '2026-08-20T00:00:00.000Z' };
    renderPage();
    expect(screen.getByRole('button', { name: '归档小队' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
    expect(screen.getByLabelText('小队 Leader')).toBeDisabled();
    const nameInput = screen
      .getAllByRole('textbox')
      .find((el) => (el as HTMLInputElement).value === 'Alpha Squad');
    expect(nameInput).toBeTruthy();
    expect((nameInput as HTMLInputElement).disabled).toBe(true);
  });

  it('active squad：编辑表单可用（对照）', () => {
    renderPage();
    expect(screen.getByRole('button', { name: '保存' })).not.toBeDisabled();
    expect(screen.getByLabelText('小队 Leader')).not.toBeDisabled();
    expect(screen.queryByTestId('squad-archived-note')).toBeNull();
  });
});
