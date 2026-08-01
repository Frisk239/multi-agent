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
  useSettingsLiveProbes: () => ({
    data: undefined,
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
});
