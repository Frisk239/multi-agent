import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentDetail, AgentReadiness, AgentSummary } from '@ma/shared';
import { AgentDetailPage } from './AgentDetailPage';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  updateMutate: vi.fn(),
  confirmDialog: vi.fn(),
  // 稳定引用：每次 render 返回同一对象，避免 useAgent 新对象导致
  // AgentDetailPage 的 useEffect([agent]) 反复重置本地 state
  agent: null as AgentDetail | null,
  agentsList: [] as AgentSummary[],
  readiness: null as AgentReadiness | null,
  runtimeCatalog: undefined as
    | {
        runtimes: Array<{
          id: string;
          supportsMcpConfig?: boolean;
          supportsCustomArgs?: boolean;
          supportsThinkingLevel?: boolean;
        }>;
      }
    | undefined,
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
    invocationPermission: 'auto',
    archivedAt: null,
    liveStatus: 'idle',
    activeRunCount: 0,
    envVars: [],
    customArgs: [],
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
  useAgentReadiness: () => ({ data: mocks.readiness }),
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
  useRuntimes: () => ({ data: mocks.runtimeCatalog }),
}));

describe('AgentDetailPage · fallback agent（后备 agent）', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.updateMutate.mockReset();
    mocks.confirmDialog.mockReset();
    mocks.agent = makeAgent({});
    mocks.readiness = null;
    mocks.runtimeCatalog = undefined;
    mocks.agentsList = [
      makeAgent({ id: 'agent-primary', name: '主岗' }),
      makeAgent({ id: 'agent-backup', name: '后备乙' }),
      makeAgent({ id: 'agent-backup2', name: '后备丙' }),
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it('将分配工作直达带预选 Agent 的新建表单，并保留独立的已指派筛选入口', async () => {
    render(<AgentDetailPage agentId="agent-primary" />);

    expect(await screen.findByTestId('agent-direct-issue-create')).toHaveAttribute(
      'href',
      '/?new=1&createAssignee=agent:agent-primary',
    );
    const assignedIssues = screen.getByTestId('agent-to-board-assignee');
    expect(assignedIssues).toHaveAttribute('href', '/?assignee=agent:agent-primary');
    expect(assignedIssues).toHaveTextContent('查看已指派 Issue');
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

describe('G3-4 agent envVars / customArgs settings', () => {
  beforeEach(() => {
    mocks.updateMutate.mockReset();
    mocks.runtimeCatalog = {
      runtimes: [
        { id: 'opencode', supportsMcpConfig: false, supportsCustomArgs: true },
      ],
    };
    mocks.agent = makeAgent({
      envVars: [{ key: 'LANG', value: 'zh-CN' }],
      customArgs: ['--max-turns 40'],
    });
    mocks.readiness = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('settings tab 回读已配置 envVars 与 customArgs', async () => {
    render(<AgentDetailPage agentId="agent-primary" />);
    fireEvent.click(await screen.findByTestId('agent-tab-settings'));
    const rows = await screen.findAllByTestId('agent-envvar-row');
    expect(rows).toHaveLength(1);
    expect(screen.getByTestId('agent-envvar-key')).toHaveValue('LANG');
    expect(screen.getByTestId('agent-envvar-value')).toHaveValue('zh-CN');
    expect(screen.getByTestId('agent-customargs-input')).toHaveValue('--max-turns 40');
  });

  it('添加/删除 envVars 行并随保存提交（空 key 行被清理）', async () => {
    render(<AgentDetailPage agentId="agent-primary" />);
    fireEvent.click(await screen.findByTestId('agent-tab-settings'));
    await screen.findAllByTestId('agent-envvar-row');

    fireEvent.click(screen.getByTestId('agent-envvar-add'));
    const rows = screen.getAllByTestId('agent-envvar-row');
    expect(rows).toHaveLength(2);
    // 填第二行
    fireEvent.change(screen.getAllByTestId('agent-envvar-key')[1], {
      target: { value: 'API_BASE' },
    });
    fireEvent.change(screen.getAllByTestId('agent-envvar-value')[1], {
      target: { value: 'http://localhost:8080' },
    });
    // 自定义参数追加
    fireEvent.change(screen.getByTestId('agent-customargs-input'), {
      target: { value: '--max-turns 40\n--permission-mode acceptEdits' },
    });

    fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
    await waitFor(() => {
      expect(mocks.updateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          envVars: [
            { key: 'LANG', value: 'zh-CN' },
            { key: 'API_BASE', value: 'http://localhost:8080' },
          ],
          customArgs: ['--max-turns 40', '--permission-mode acceptEdits'],
        }),
      );
    });

    // 删除行
    fireEvent.click(screen.getAllByTestId('agent-envvar-remove')[1]);
    expect(screen.getAllByTestId('agent-envvar-row')).toHaveLength(1);
  });

  it('空 envVars（无配置）显示空态提示', async () => {
    mocks.agent = makeAgent({});
    render(<AgentDetailPage agentId="agent-primary" />);
    fireEvent.click(await screen.findByTestId('agent-tab-settings'));
    expect(await screen.findByTestId('agent-envvars-empty')).toHaveTextContent('尚未配置环境变量');
  });
});

describe('G8-4a runtime capability honesty', () => {
  beforeEach(() => {
    mocks.updateMutate.mockReset();
    mocks.confirmDialog.mockReset();
    mocks.agent = makeAgent({ customArgs: ['--legacy-noop'] });
    mocks.runtimeCatalog = undefined;
    mocks.readiness = null;
  });

  afterEach(() => {
    cleanup();
  });

  it('catalog 未到位时 MCP 和 customArgs 均 fail-closed，并说明未知而非不支持', async () => {
    render(<AgentDetailPage agentId="agent-primary" />);
    fireEvent.click(await screen.findByTestId('agent-tab-capabilities'));

    expect(screen.queryByTestId('agent-cap-mcp')).toBeNull();
    expect(screen.getByTestId('agent-cap-mcp-unknown')).toHaveTextContent('尚未加载');
    expect(screen.getByTestId('agent-cap-mcp-unknown')).toHaveTextContent('不表示 adapter 已支持');

    fireEvent.click(screen.getByTestId('agent-tab-settings'));
    expect(screen.queryByTestId('agent-customargs-input')).toBeNull();
    expect(screen.getByTestId('agent-customargs-unavailable')).toHaveTextContent('能力尚未确认');
    expect(screen.getByTestId('agent-customargs-readonly')).toHaveValue('--legacy-noop');
  });

  it('明确 preflight failed 时保留 error/recovery，不显示“尚未安全预检”', async () => {
    mocks.readiness = {
      agentId: 'agent-primary',
      runtime: 'opencode',
      runtimeInstalled: true,
      runtimePath: '/usr/local/bin/opencode',
      runtimeVersion: '1.2.3',
      concurrency: 1,
      runningCount: 0,
      slotsAvailable: 1,
      cwdConfigured: true,
      preflightStatus: 'failed',
      runtimeVerification: 'unverified',
      status: 'error',
      detail: '运行时安全预检未通过：请先在本机 CLI 完成登录，然后重试。',
    };
    render(<AgentDetailPage agentId="agent-primary" />);

    expect(await screen.findByTestId('agent-readiness-recovery')).toHaveAttribute(
      'data-status',
      'error',
    );
    expect(screen.queryByTestId('agent-readiness-unverified')).toBeNull();
    expect(
      screen.getByTitle('运行时安全预检未通过：请先在本机 CLI 完成登录，然后重试。'),
    ).toBeInTheDocument();
  });

  it('没有失败证据的 unverified runtime 仍显示首次运行风险', async () => {
    mocks.readiness = {
      agentId: 'agent-primary',
      runtime: 'opencode',
      runtimeInstalled: true,
      runtimePath: '/usr/local/bin/opencode',
      runtimeVersion: '1.2.3',
      concurrency: 1,
      runningCount: 0,
      slotsAvailable: 1,
      cwdConfigured: true,
      preflightStatus: 'not_available',
      runtimeVerification: 'unverified',
      status: 'ready',
      detail: null,
    };
    render(<AgentDetailPage agentId="agent-primary" />);

    expect(await screen.findByTestId('agent-readiness-unverified')).toHaveTextContent(
      '首次运行仍可能失败',
    );
  });

  it('明确声明不支持时，说明 adapter 不消费而不把它误称为目录未知', async () => {
    mocks.runtimeCatalog = {
      runtimes: [
        { id: 'opencode', supportsMcpConfig: false, supportsCustomArgs: false },
      ],
    };
    render(<AgentDetailPage agentId="agent-primary" />);
    fireEvent.click(await screen.findByTestId('agent-tab-capabilities'));

    expect(screen.queryByTestId('agent-cap-mcp')).toBeNull();
    expect(screen.getByTestId('agent-cap-mcp-unsupported')).toHaveTextContent('不消费');
    expect(screen.queryByTestId('agent-cap-mcp-unknown')).toBeNull();

    fireEvent.click(screen.getByTestId('agent-tab-settings'));
    expect(screen.queryByTestId('agent-customargs-input')).toBeNull();
    expect(screen.getByTestId('agent-customargs-unavailable')).toHaveTextContent('不消费');
  });

  it('catalog 有 runtime 但没有声明可选能力字段时，仍按未知 fail-closed', async () => {
    mocks.runtimeCatalog = { runtimes: [{ id: 'opencode' }] };
    render(<AgentDetailPage agentId="agent-primary" />);
    fireEvent.click(await screen.findByTestId('agent-tab-capabilities'));

    expect(screen.queryByTestId('agent-cap-mcp')).toBeNull();
    expect(screen.getByTestId('agent-cap-mcp-unknown')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('agent-tab-settings'));
    expect(screen.queryByTestId('agent-customargs-input')).toBeNull();
    expect(screen.getByTestId('agent-customargs-unavailable')).toHaveTextContent('能力尚未确认');
  });

  it('历史 customArgs 仅可在确认后单独清除，不会随其它设置静默保存', async () => {
    mocks.runtimeCatalog = {
      runtimes: [
        { id: 'opencode', supportsMcpConfig: false, supportsCustomArgs: false },
      ],
    };
    mocks.confirmDialog.mockResolvedValue(true);
    render(<AgentDetailPage agentId="agent-primary" />);
    fireEvent.click(await screen.findByTestId('agent-tab-settings'));
    fireEvent.click(screen.getByTestId('agent-customargs-clear'));

    await waitFor(() => {
      expect(mocks.confirmDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '清除未消费的自定义参数？',
          variant: 'danger',
        }),
      );
      expect(mocks.updateMutate).toHaveBeenCalledWith(
        { customArgs: [] },
        expect.any(Object),
      );
    });
  });
});

describe('pi-thinking-honest AgentDetail Thinking 门控', () => {
  beforeEach(() => {
    mocks.updateMutate.mockReset();
    mocks.confirmDialog.mockReset();
    mocks.readiness = null;
    mocks.runtimeCatalog = undefined;
    mocks.agent = makeAgent({ runtime: 'pi', thinkingLevel: 'high' });
  });

  afterEach(() => {
    cleanup();
  });

  it('pi catalog → thinking 编辑器不可用，旧值只读 + 可清除', async () => {
    mocks.runtimeCatalog = {
      runtimes: [
        { id: 'pi', supportsMcpConfig: false, supportsCustomArgs: true, supportsThinkingLevel: false },
      ],
    };
    render(<AgentDetailPage agentId="agent-primary" />);

    expect(screen.queryByTestId('agent-thinking-select')).toBeNull();
    expect(screen.queryByTestId('agent-thinking-input')).toBeNull();
    expect(screen.getByTestId('agent-thinking-unavailable')).toHaveTextContent(
      '此 runtime 不消费 Thinking/Effort',
    );
    expect(screen.getByTestId('agent-thinking-readonly')).toHaveValue('high');

    mocks.confirmDialog.mockResolvedValue(true);
    fireEvent.click(screen.getByTestId('agent-thinking-clear'));
    await waitFor(() => {
      expect(mocks.updateMutate).toHaveBeenCalledWith(
        { thinkingLevel: null },
        expect.any(Object),
      );
    });
  });

  it('catalog 声明 supportsThinkingLevel 时仍可编辑', async () => {
    mocks.agent = makeAgent({ runtime: 'claude-code', thinkingLevel: 'medium' });
    mocks.runtimeCatalog = {
      runtimes: [
        {
          id: 'claude-code',
          supportsMcpConfig: true,
          supportsCustomArgs: true,
          supportsThinkingLevel: true,
        },
      ],
    };
    render(<AgentDetailPage agentId="agent-primary" />);

    expect(screen.getByTestId('agent-thinking-select')).toBeInTheDocument();
    expect(screen.getByTestId('agent-thinking-input')).toHaveValue('medium');
    expect(screen.queryByTestId('agent-thinking-unavailable')).toBeNull();
  });
});
