import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RuntimesResponse } from '@ma/shared';

/**
 * RuntimesPage 死按钮修复测试
 * - 「全部 / 已安装」筛选真实生效（已安装 = installed true）
 * - aria-pressed 状态正确切换
 * - 「添加运行时」入口指向设置页环境诊断
 */

const data: RuntimesResponse = {
  machine: {
    id: 'machine-local',
    name: '本机',
    status: 'online',
    cwd: 'D:/code/multi-agent',
  },
  runtimes: [
    {
      id: 'claude-code',
      label: 'Claude Code',
      installed: true,
      version: '2.0.0',
      path: '/usr/local/bin/claude',
      agentIds: [],
    },
    {
      id: 'opencode',
      label: 'opencode',
      installed: true,
      version: null,
      path: null,
      agentIds: [],
    },
    {
      id: 'cursor',
      label: 'Cursor',
      installed: false,
      version: null,
      path: null,
      agentIds: [],
    },
  ],
};

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/api', () => ({
  useRuntimes: () => ({ data, refetch: vi.fn(), isFetching: false }),
}));

import { RuntimesPage } from './RuntimesPage';

function rowCount() {
  return screen.queryAllByTestId('runtime-row').length;
}

function rowIds(): (string | null)[] {
  return screen
    .queryAllByTestId('runtime-row')
    .map((r) => r.getAttribute('data-runtime'));
}

function renderPage() {
  return render(<RuntimesPage />);
}

describe('RuntimesPage 筛选', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('默认「全部」：显示全部运行时，按钮 aria-pressed 状态正确', () => {
    renderPage();
    expect(rowCount()).toBe(3);

    const allBtn = screen.getByTestId('runtimes-filter-all');
    const installedBtn = screen.getByTestId('runtimes-filter-installed');
    expect(allBtn).toHaveAttribute('aria-pressed', 'true');
    expect(installedBtn).toHaveAttribute('aria-pressed', 'false');
    expect(allBtn.textContent).toContain('3');
    expect(installedBtn.textContent).toContain('2');
  });

  it('点击「已安装」：只显示 installed 的运行时，aria-pressed 切换', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('runtimes-filter-installed'));

    expect(rowCount()).toBe(2);
    expect(rowIds()).toEqual(['claude-code', 'opencode']);
    expect(screen.getByTestId('runtimes-filter-installed')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('runtimes-filter-all')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('切回「全部」：恢复显示全部运行时', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('runtimes-filter-installed'));
    expect(rowCount()).toBe(2);

    fireEvent.click(screen.getByTestId('runtimes-filter-all'));
    expect(rowCount()).toBe(3);
    expect(screen.getByTestId('runtimes-filter-all')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('「添加运行时」入口指向设置页环境诊断', () => {
    renderPage();
    const add = screen.getByTestId('runtimes-add');
    expect(add).toHaveAttribute('href', '/settings?tab=health');
    expect(add.textContent).toContain('添加运行时');
  });
});
