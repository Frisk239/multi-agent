import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Issue } from '@ma/shared';
import { IssueListView, type IssueListSortCol } from './IssueListView';

/**
 * IssueListView 表头 a11y 测试（W3）
 * aria-sort / tabIndex=0 / Enter+Space 键盘排序 / aria-label 注明可排序
 * react-virtual 在 jsdom 无滚动容器 → mock 为「全部行可见」，行级断言可用。
 */

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: opts.count }, (_, i) => ({
        index: i,
        key: i,
        start: i * 32,
        size: 32,
      })),
    getTotalSize: () => opts.count * 32,
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

function makeIssue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    workspaceId: 'ws-1',
    identifier: `ISS-${id}`,
    title: `Issue ${id}`,
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

function renderList({
  sortCol = null,
  sortDir = 'asc',
  onHeaderSort = vi.fn(),
  issues = [makeIssue('1')],
}: {
  sortCol?: IssueListSortCol | null;
  sortDir?: 'asc' | 'desc';
  onHeaderSort?: (col: IssueListSortCol) => void;
  issues?: Issue[];
} = {}) {
  return render(
    <IssueListView
      issues={issues}
      density="default"
      selectedIds={new Set()}
      failedIssueIds={new Set()}
      activeIssueIds={new Set()}
      projectTitleById={new Map()}
      sortCol={sortCol}
      sortDir={sortDir}
      onHeaderSort={onHeaderSort}
      onToggleSelect={vi.fn()}
      onSelectAll={vi.fn()}
      onClearSelection={vi.fn()}
      onStatusChange={vi.fn()}
    />,
  );
}

describe('IssueListView 可排序表头 a11y', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  const HEADER_TEST_IDS = [
    'issue-list-sort-header-identifier',
    'issue-list-sort-header-title',
    'issue-list-sort-header-status',
    'issue-list-sort-header-priority',
    'issue-list-sort-header-assignee',
    'issue-list-sort-header-updatedAt',
    'issue-list-sort-header-dueDate',
  ];

  it('7 个排序列均带 aria-sort="none" + tabIndex=0 + 可排序 aria-label', () => {
    renderList();
    for (const tid of HEADER_TEST_IDS) {
      const th = screen.getByTestId(tid);
      expect(th.tagName).toBe('TH');
      expect(th).toHaveAttribute('aria-sort', 'none');
      expect(th).toHaveAttribute('tabindex', '0');
      expect(th.getAttribute('aria-label')).toContain('可排序');
      expect(th).toHaveAttribute('scope', 'col');
    }
  });

  it('激活列 aria-sort=ascending/descending', () => {
    renderList({ sortCol: 'priority', sortDir: 'asc' });
    expect(screen.getByTestId('issue-list-sort-header-priority')).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    cleanup();
    renderList({ sortCol: 'priority', sortDir: 'desc' });
    expect(screen.getByTestId('issue-list-sort-header-priority')).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('激活列 aria-label 包含当前方向，非激活列不含', () => {
    renderList({ sortCol: 'title', sortDir: 'asc' });
    expect(screen.getByTestId('issue-list-sort-header-title').getAttribute('aria-label')).toContain('升序');
    expect(screen.getByTestId('issue-list-sort-header-status').getAttribute('aria-label')).not.toContain('升序');
  });

  it('Enter 触发排序（与点击同列参数）', () => {
    const onHeaderSort = vi.fn();
    renderList({ onHeaderSort });
    fireEvent.keyDown(screen.getByTestId('issue-list-sort-header-identifier'), {
      key: 'Enter',
    });
    expect(onHeaderSort).toHaveBeenCalledWith('identifier');
  });

  it('Space 触发排序（与点击同列参数）', () => {
    const onHeaderSort = vi.fn();
    renderList({ onHeaderSort });
    fireEvent.keyDown(screen.getByTestId('issue-list-sort-header-updatedAt'), {
      key: ' ',
    });
    expect(onHeaderSort).toHaveBeenCalledWith('updatedAt');
  });

  it('点击仍可排序（回归）', () => {
    const onHeaderSort = vi.fn();
    renderList({ onHeaderSort });
    fireEvent.click(screen.getByTestId('issue-list-sort-header-status'));
    expect(onHeaderSort).toHaveBeenCalledWith('status');
  });

  it('非排序列（项目/操作）不可聚焦', () => {
    renderList();
    const table = screen.getByTestId('issue-list-table');
    const plainThs = Array.from(table.querySelectorAll('th')).filter(
      (th) => !th.hasAttribute('aria-sort'),
    );
    expect(plainThs.length).toBeGreaterThanOrEqual(2);
    for (const th of plainThs) {
      expect(th).not.toHaveAttribute('tabindex');
    }
  });
});

describe('IssueListView 截止列（issue-due-date）', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('截止表头可点击/键盘排序，触发 onHeaderSort("dueDate")', () => {
    const onHeaderSort = vi.fn();
    renderList({ onHeaderSort });
    const th = screen.getByTestId('issue-list-sort-header-dueDate');
    expect(th.textContent).toContain('截止');
    fireEvent.click(th);
    expect(onHeaderSort).toHaveBeenCalledWith('dueDate');
    fireEvent.keyDown(th, { key: 'Enter' });
    expect(onHeaderSort).toHaveBeenCalledTimes(2);
  });

  it('行内显示日期并带三态 class；无日期显示 —', () => {
    vi.useFakeTimers({ now: new Date(2026, 7, 20, 10, 0, 0), shouldAdvanceTime: true });
    try {
      renderList({
        issues: [
          makeIssue('1', { dueDate: '2026-08-19' }),
          makeIssue('2', { dueDate: '2026-08-21' }),
          makeIssue('3', { dueDate: '2026-09-30' }),
          makeIssue('4'),
        ],
      });
      const cells = screen.getAllByTestId('issue-list-due');
      expect(cells).toHaveLength(3);
      expect(cells[0].className).toContain('issue-card-due--overdue');
      expect(cells[0].getAttribute('data-due-state')).toBe('overdue');
      expect(cells[1].className).toContain('issue-card-due--soon');
      expect(cells[2].className).toBe('');
      expect(cells[2].textContent).toBe('2026-09-30');
      // 无日期行：单元格为 —（不渲染 span）
      const row4 = screen
        .getAllByTestId('issue-list-row')
        .find((tr) => tr.getAttribute('data-issue-id') === '4');
      expect(row4?.textContent).toContain('—');
      expect(row4?.querySelector('[data-testid="issue-list-due"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
