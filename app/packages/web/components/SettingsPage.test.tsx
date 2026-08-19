import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SettingsPage 组件测试
 * Mock next/navigation + @/lib/api hooks + @/lib/use-shortcuts
 */

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

const openHelp = vi.fn();
let liveProbesData: any = undefined;

vi.mock('@/lib/use-shortcuts', () => ({
  useShortcuts: () => ({ isHelpOpen: false, openHelp, closeHelp: vi.fn() }),
}));

const statusData = {
  overall: 'ok' as const,
  summary: { errors: 0, warnings: 0 },
  checks: [],
  secrets: { wikiLlmConfigured: false, embeddingConfigured: false },
  server: {},
};

vi.mock('@/lib/api', () => ({
  useSettingsStatus: () => ({
    data: statusData,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useUserProfile: () => ({ data: { name: '林远', about: '测试' } }),
  useUpdateUserProfile: () => ({ mutate: vi.fn(), isPending: false }),
  useRecoverStuckRuns: () => ({ mutate: vi.fn(), isPending: false }),
  useRetryAllDeadWikiJobs: () => ({ mutate: vi.fn(), isPending: false }),
  useSetWorkspaceCwd: () => ({ mutate: vi.fn(), isPending: false }),
  useIsolatedWorkspaces: () => ({
    data: { rootHint: '', count: 0, entries: [] },
    refetch: vi.fn(),
  }),
  useCleanupIsolatedWorkspaces: () => ({ mutate: vi.fn(), isPending: false }),
  useInboxPrefs: () => ({ data: undefined }),
  useSetInboxPrefs: () => ({ mutate: vi.fn(), isPending: false }),
  useOpsSnapshot: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useSnapshots: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useCreateSnapshot: () => ({ mutate: vi.fn(), isPending: false }),
  useValidateSnapshot: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  useDryRunSnapshotRestore: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  useStageSnapshotRestore: () => ({
    mutate: vi.fn(),
    isPending: false,
    data: undefined,
    reset: vi.fn(),
  }),
  useDeleteSnapshotStage: () => ({ mutate: vi.fn(), isPending: false }),
  usePreviewSnapshotRestore: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  useConfirmSnapshotRestore: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  useSecretSafetyScan: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, data: undefined }),
  useApplySecretSafety: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, data: undefined }),
  useSettingsLiveProbes: () => ({
    data: liveProbesData,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useSettingsDiagnostics: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { SettingsPage } from './SettingsPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    liveProbesData = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a keyboard-focusable 快捷键 entry in the nav account group', () => {
    renderPage();

    const shortcutsBtn = screen.getByTestId('settings-nav-shortcuts');
    expect(shortcutsBtn).toBeTruthy();
    expect(shortcutsBtn).toHaveTextContent('快捷键');
    // 沿用现有 nav-item 样式与 button 语义（原生 button 天然可聚焦）
    expect(shortcutsBtn).toHaveClass('settings-nav-item');
    expect(shortcutsBtn.tagName).toBe('BUTTON');

    // 位于「我的账号」组内、个人资料之后：nav 内 button 顺序 profile → shortcuts
    const navItems = Array.from(
      screen.getByTestId('settings-nav').querySelectorAll('button.settings-nav-item'),
    );
    const order = navItems.map((el) => el.getAttribute('data-testid'));
    expect(order).toEqual([
      'settings-nav-profile',
      'settings-nav-shortcuts',
      'settings-nav-workspace',
      'settings-nav-health',
    ]);
    expect(screen.getByTestId('settings-nav')).toHaveTextContent('我的账号');
  });

  it('opens the global shortcuts modal via openHelp without switching tab', () => {
    renderPage();

    expect(screen.getByTestId('settings-profile-section')).toBeTruthy();
    fireEvent.click(screen.getByTestId('settings-nav-shortcuts'));

    // 弹层全局已挂（app/layout.tsx），此处只验证触发了全局 openHelp
    expect(openHelp).toHaveBeenCalledTimes(1);
    // 不应切换 Settings tab / 高亮快捷键项
    expect(screen.getByTestId('settings-profile-section')).toBeTruthy();
    expect(screen.getByTestId('settings-nav-shortcuts')).not.toHaveClass('is-active');
    expect(screen.getByTestId('settings-nav-profile')).toHaveClass('is-active');
  });

  it('运行健康卡显示「在途 x / 上限 y」比例（G2-5 收尾）', () => {
    (statusData as any).runHealth = {
      active: { total: 3, queued: 1, waitingLocalDirectory: 0, running: 2 },
      oldestQueuedAgeMs: 0,
      oldestWaitingLocalDirectoryAgeMs: 0,
      oldestRunningAgeMs: 0,
      oldestRunningHeartbeatAgeMs: 0,
      thresholds: {
        staleRunningMs: 60_000,
        staleQueuedMs: 60_000,
        waitingLocalMaxMs: 600_000,
        sweepIntervalMs: 5_000,
      },
      atRisk: { runningNearStale: 0, queuedNearStale: 0, waitingLocalNearStale: 0 },
      maxConcurrentRuns: 5,
    };
    renderPage();
    fireEvent.click(screen.getByTestId('settings-nav-health'));

    const inflight = screen.getByTestId('settings-run-health-inflight');
    expect(inflight.textContent).toContain('在途 3 / 5');
    // 上限来源 title 提示
    expect(inflight.getAttribute('title')).toContain('上限 5');
  });

  it('未设上限（maxConcurrentRuns=null）→ 只显示在途数', () => {
    (statusData as any).runHealth = {
      active: { total: 2, queued: 0, waitingLocalDirectory: 0, running: 2 },
      oldestQueuedAgeMs: 0,
      oldestWaitingLocalDirectoryAgeMs: 0,
      oldestRunningAgeMs: 0,
      oldestRunningHeartbeatAgeMs: 0,
      thresholds: {
        staleRunningMs: 60_000,
        staleQueuedMs: 60_000,
        waitingLocalMaxMs: 600_000,
        sweepIntervalMs: 5_000,
      },
      atRisk: { runningNearStale: 0, queuedNearStale: 0, waitingLocalNearStale: 0 },
      maxConcurrentRuns: null,
    };
    renderPage();
    fireEvent.click(screen.getByTestId('settings-nav-health'));

    const inflight = screen.getByTestId('settings-run-health-inflight');
    expect(inflight.textContent).toContain('在途 2');
    expect(inflight.textContent).not.toContain(' / ');
  });

  it('密钥安全检查默认不扫描、不回显密钥，并提供显式扫描入口', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('settings-nav-health'));

    expect(screen.getByTestId('settings-secret-safety')).toHaveTextContent('密钥安全检查');
    expect(screen.getByTestId('settings-secret-safety-status')).toHaveTextContent('尚未扫描');
    expect(screen.getByTestId('settings-secret-safety-remediation')).toHaveTextContent('扫描不会修改数据库');
    expect(screen.getByTestId('settings-secret-safety-scan')).toHaveTextContent('扫描历史配置');
    expect(screen.queryByTestId('settings-secret-safety-apply')).toBeNull();
  });

  it('Live Probes 将 CLI 发现与安全预检分开呈现，并兼容 future passed/failed 状态', () => {
    liveProbesData = {
      ts: Date.now(),
      pid: 42,
      activeCount: 0,
      activeRuns: 0,
      inProcessCount: 0,
      probes: [],
      runtimes: [
        {
          id: 'opencode',
          label: 'OpenCode',
          installed: true,
          version: '1.2.3',
          path: '/usr/local/bin/opencode',
          ready: true,
          runtimeVerification: 'unverified',
          executionImplemented: true,
          supportsSessionResume: false,
        },
        {
          id: 'claude-code',
          label: 'Claude Code',
          installed: true,
          version: '2.0.0',
          path: '/usr/local/bin/claude',
          ready: true,
          runtimeVerification: 'verified',
          preflightStatus: 'passed',
          executionImplemented: true,
          supportsSessionResume: false,
        },
        {
          id: 'grok',
          label: 'Grok',
          installed: true,
          version: '0.1.0',
          path: '/usr/local/bin/grok',
          ready: false,
          runtimeVerification: 'unverified',
          preflightStatus: 'failed',
          executionImplemented: true,
          supportsSessionResume: false,
        },
        {
          id: 'pi',
          label: 'Pi',
          installed: true,
          version: '0.43.0',
          path: '/usr/local/bin/pi',
          ready: true,
          runtimeVerification: 'unverified',
          preflightStatus: 'not_available',
          executionImplemented: true,
          supportsSessionResume: false,
        },
      ],
    };
    renderPage();
    fireEvent.click(screen.getByTestId('settings-nav-health'));

    expect(screen.getByTestId('settings-live-probes-summary')).toHaveTextContent(
      'runtime 已安装 4/4',
    );
    expect(screen.getByTestId('settings-live-runtime-opencode')).toHaveTextContent(
      '已安装 · 尚未安全预检',
    );
    expect(screen.getByTestId('settings-live-runtime-claude-code')).toHaveTextContent(
      '已安装 · 安全预检通过',
    );
    expect(screen.getByTestId('settings-live-runtime-grok')).toHaveTextContent(
      '已安装 · 安全预检失败',
    );
    expect(screen.getByTestId('settings-live-runtime-pi')).toHaveTextContent(
      '已安装 · 未提供安全预检',
    );
    expect(screen.getByTestId('settings-live-probes')).toHaveTextContent(
      'detect 只确认命令可发现，不验证认证、模型或 MCP',
    );
  });
});
