import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Issue } from '@ma/shared';

/**
 * issue-due-date · IssueCard 截止 chip：
 * - 有 dueDate → 渲染 chip（overdue 红 / soon 黄 / normal 无修饰）
 * - 无 dueDate → 不渲染
 * - 纯展示（span，非 Link），title 提示「截止：日期」
 * dnd-kit / 菜单 / api hooks 全 mock。
 */

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}));

vi.mock('./IssueCardMenu', () => ({
  IssueCardMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/lib/api', () => ({
  useRerunIssue: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { IssueCard } from './IssueCard';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'iss-1',
    workspaceId: 'ws-1',
    identifier: 'FRI-1',
    title: '带截止的卡片',
    description: null,
    status: 'todo',
    priority: 'none',
    assignee: null,
    creatorType: 'member',
    creatorId: 'u-1',
    position: 0,
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

/** 固定「今天」：chip 三态依赖本地时钟，用 vi.setSystemTime 冻结 */
function freezeAt(date: Date) {
  vi.useFakeTimers({ now: date, shouldAdvanceTime: true });
}

describe('IssueCard 截止 chip（issue-due-date）', () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('过期日期 → issue-card-due--overdue + data-due-state', () => {
    freezeAt(new Date(2026, 7, 20, 10, 0, 0));
    render(<IssueCard issue={makeIssue({ dueDate: '2026-08-19' })} />);
    const chip = screen.getByTestId('issue-card-due');
    expect(chip).toBeTruthy();
    expect(chip.className).toContain('issue-card-due--overdue');
    expect(chip.getAttribute('data-due-state')).toBe('overdue');
    expect(chip.getAttribute('title')).toBe('截止：2026-08-19');
    expect(chip.textContent).toBe('2026-08-19');
  });

  it('明日日期 → issue-card-due--soon；纯展示非链接', () => {
    freezeAt(new Date(2026, 7, 20, 10, 0, 0));
    render(<IssueCard issue={makeIssue({ dueDate: '2026-08-21' })} />);
    const chip = screen.getByTestId('issue-card-due');
    expect(chip.className).toContain('issue-card-due--soon');
    expect(chip.tagName).toBe('SPAN'); // 不参与点击筛选
  });

  it('远期日期 → 无三态修饰（normal）', () => {
    freezeAt(new Date(2026, 7, 20, 10, 0, 0));
    render(<IssueCard issue={makeIssue({ dueDate: '2026-09-30' })} />);
    const chip = screen.getByTestId('issue-card-due');
    expect(chip.className).toBe('issue-card-due');
    expect(chip.getAttribute('data-due-state')).toBe('normal');
  });

  it('无 dueDate / null → 不渲染 chip（零视觉变化）', () => {
    const { rerender } = render(<IssueCard issue={makeIssue()} />);
    expect(screen.queryByTestId('issue-card-due')).toBeNull();
    rerender(<IssueCard issue={makeIssue({ dueDate: null })} />);
    expect(screen.queryByTestId('issue-card-due')).toBeNull();
  });
});
