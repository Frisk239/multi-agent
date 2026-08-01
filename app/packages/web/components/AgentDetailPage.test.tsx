import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentDetail, AgentSummary } from '@ma/shared';
import { AgentDetailPage } from './AgentDetailPage';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  updateMutate: vi.fn(),
  confirmDialog: vi.fn(),
  // 稳定引用：每次 render 返回同一对象，避免 useAgent 新对象导致
  // AgentDetailPage 的 useEffect([agent]) 反复重置本地 state
  agent: null as AgentDetail | null,
  agentsList: [] as AgentSummary[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@/lib/confirm-store', () => ({
  confirmDialog: (...args: unknown[]) => mocks.confirmDialog(...args),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

function makeAgent(overrides: Partial<AgentDetail>): AgentDetail {
  return {
    id: 'agent-primary',
    name: '主岗',
    runtime: 'opencode',
    category: null,
    model: null,
    thinkingLevel: null,
    concurrency: 1,
    mcpServers: null,
    instructions: '',
    allowedPaths: null,
    archivedAt: null,
    liveStatus: 'idle',
    activeRunCount: 0,
    ...overrides,
  };
}

vi.mock('@/lib/api', () => ({
  useAgent: () => ({
    data: mocks.agent,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useAgents: () => ({
    data: mocks.agentsList,
    isLoading: false,
    isError: false,
  }),
  useAgentReadiness: () => ({ data: null }),
  useAgentRuns: () => ({ data: [], isLoading: false, isError: false, error: null }),
  useAgentWorkStats: () => ({
    data: {
      agentId: 'agent-primary',
      windowDays: 30,
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      active: 0,
      successRate: null,
      avgDurationMs: null,
      lastRunAt: null,
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
  useCreateChatThread: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useSkills: () => ({ data: [], isLoading: false }),
  useAgentSkills: () => ({ data: [], isLoading: false }),
  useUpdateAgent: () => ({ mutate: mocks.updateMutate, isPending: false }),
  useUpdateAgentSkills: () => ({ mutate: vi.fn(), isPending: false }),
  useAgentMcp: () => ({ data: null }),
  useUpdateAgentMcp: () => ({ mutate: vi.fn(), isPending: false }),
  useRetryRun: () => ({ mutate: vi.fn(), isPending: false }),
  useRuntimeModels: () => ({ data: { models: [] }, isFetching: false }),
}));

describe('AgentDetailPage · fallback agent（后备 agent）', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.updateMutate.mockReset();
    mocks.confirmDialog.mockReset();
    mocks.agent = makeAgent({});
    mocks.agentsList = [
      makeAgent({ id: 'agent-primary', name: '主岗' }),
      makeAgent({ id: 'agent-backup', name: '后备乙' }),
      makeAgent({ id: 'agent-backup2', name: '后备丙' }),
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it('渲染后备 agent 下拉：默认「无」，列出其他未归档 agents，排除自己', async () => {
    render(<AgentDetailPage agentId="agent-primary" />);

    const select = await screen.findByTestId('agent-fallback-select');
    expect(select).toBeInTheDocument();

    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options[0]).toBe('无（不启用自动改派）');
    expect(options).toContain('后备乙');
    expect(options).toContain('后备丙');
    // 自己不出现
    expect(options).not.toContain('主岗');
  });

  it('回填已配置的 fallbackAgentId 并随保存提交', async () => {
    mocks.agent = makeAgent({ fallbackAgentId: 'agent-backup' });
    render(<AgentDetailPage agentId="agent-primary" />);

    const select = await screen.findByTestId('agent-fallback-select');
    expect(select).toHaveValue('agent-backup');

    fireEvent.change(select, { target: { value: 'agent-backup2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mocks.updateMutate).toHaveBeenCalledWith(
        expect.objectContaining({ fallbackAgentId: 'agent-backup2' }),
      );
    });
  });

  it('选择「无」→ 保存提交 null（清除改派配置）', async () => {
    mocks.agent = makeAgent({ fallbackAgentId: 'agent-backup' });
    render(<AgentDetailPage agentId="agent-primary" />);

    const select = await screen.findByTestId('agent-fallback-select');
    fireEvent.change(select, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(mocks.updateMutate).toHaveBeenCalledWith(
        expect.objectContaining({ fallbackAgentId: null }),
      );
    });
  });
});
