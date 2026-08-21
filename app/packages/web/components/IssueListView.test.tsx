import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Issue } from '@ma/shared';
import {
  IssueListView,
  parseHiddenColumns,
  type IssueListSortCol,
} from './IssueListView';
import { parseIssueListGroup } from './KanbanBoard.shared';

/**
 * IssueListView 表头 a11y 测试（W3）
 * aria-sort / tabIndex=0 / Enter+Space 键盘排序 / aria-label 注明可排序
 * react-virtual 在 jsdom 无滚动容器 → mock 为「全部行可见」，行级断言可用。
 * 列表表格二阶：列选择（localStorage 持久化）+ 分组行（虚拟化降级）。
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

const HIDDEN_COLS_KEY = 'issue-list-hidden-cols';

function getRow(idx = 0): HTMLTableRowElement {
  return screen.getAllByTestId('issue-list-row')[idx] as HTMLTableRowElement;
}

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
  groupBy,
  onGroupChange,
  projectTitleById = new Map<string, string>(),
}: {
  sortCol?: IssueListSortCol | null;
  sortDir?: 'asc' | 'desc';
  onHeaderSort?: (col: IssueListSortCol) => void;
  issues?: Issue[];
  groupBy?: 'none' | 'status' | 'assignee' | 'project';
  onGroupChange?: (mode: 'none' | 'status' | 'assignee' | 'project') => void;
  projectTitleById?: Map<string, string>;
} = {}) {
  return render(
    <IssueListView
      issues={issues}
      density="default"
      selectedIds={new Set()}
      failedIssueIds={new Set()}
      activeIssueIds={new Set()}
      projectTitleById={projectTitleById}
      sortCol={sortCol}
      sortDir={sortDir}
      onHeaderSort={onHeaderSort}
      onToggleSelect={vi.fn()}
      onSelectAll={vi.fn()}
      onClearSelection={vi.fn()}
      onStatusChange={vi.fn()}
      groupBy={groupBy}
      onGroupChange={onGroupChange}
    />,
  );
}

describe('IssueListView 可排序表头 a11y', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
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
    window.localStorage.clear();
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

describe('IssueListView 列选择（列表表格二阶）', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('parseHiddenColumns：非法值（非 JSON / 非数组 / 含未知列）容错为空集', () => {
    expect(parseHiddenColumns(null).size).toBe(0);
    expect(parseHiddenColumns('').size).toBe(0);
    expect(parseHiddenColumns('not-json{').size).toBe(0);
    expect(parseHiddenColumns('{"a":1}').size).toBe(0);
    expect(parseHiddenColumns('["priority","nope"]').size).toBe(0);
    expect([...parseHiddenColumns('["priority","dueDate"]')].sort()).toEqual([
      'dueDate',
      'priority',
    ]);
  });

  it('列面板默认关闭；点「列」按钮开启，5 个可选列默认全勾选', () => {
    renderList();
    expect(
      screen.queryByTestId('issue-list-column-panel'),
    ).toBeNull();
    fireEvent.click(screen.getByTestId('issue-list-column-picker'));
    const panel = screen.getByTestId('issue-list-column-panel');
    const boxes = panel.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(5);
    for (const b of boxes) expect((b as HTMLInputElement).checked).toBe(true);
  });

  it('取消勾选「优先级」：表头消失、行单元格同步少一列、写入 localStorage', () => {
    renderList({ issues: [makeIssue('1')] });
    fireEvent.click(screen.getByTestId('issue-list-column-picker'));
    fireEvent.click(screen.getByTestId('issue-list-column-opt-priority'));
    expect(
      screen.queryByTestId('issue-list-sort-header-priority'),
    ).toBeNull();
    const row = getRow();
    // 10 列 - 隐藏 1 列 = 9（表头与行共用同一顺序，不会错位）
    expect(row.cells).toHaveLength(9);
    expect(row.querySelector('.priority-badge')).toBeNull();
    expect(window.localStorage.getItem(HIDDEN_COLS_KEY)).toBe('["priority"]');
  });

  it('隐藏列刷新保持：localStorage 预置后重新渲染仍隐藏', () => {
    window.localStorage.setItem(HIDDEN_COLS_KEY, '["priority"]');
    renderList({ issues: [makeIssue('1')] });
    expect(
      screen.queryByTestId('issue-list-sort-header-priority'),
    ).toBeNull();
    expect(getRow().cells).toHaveLength(9);
  });

  it('恢复：重新勾选隐藏列后列回来，localStorage 同步清空', () => {
    window.localStorage.setItem(HIDDEN_COLS_KEY, '["priority"]');
    renderList({ issues: [makeIssue('1')] });
    fireEvent.click(screen.getByTestId('issue-list-column-picker'));
    fireEvent.click(screen.getByTestId('issue-list-column-opt-priority'));
    expect(
      screen.getByTestId('issue-list-sort-header-priority'),
    ).toBeInTheDocument();
    expect(getRow().cells).toHaveLength(10);
    expect(window.localStorage.getItem(HIDDEN_COLS_KEY)).toBe('[]');
  });

  it('隐藏「截止 + 项目」：表头只剩 8 列且不含对应文案', () => {
    renderList({ issues: [makeIssue('1')] });
    fireEvent.click(screen.getByTestId('issue-list-column-picker'));
    fireEvent.click(screen.getByTestId('issue-list-column-opt-dueDate'));
    fireEvent.click(screen.getByTestId('issue-list-column-opt-project'));
    const thead = screen
      .getByTestId('issue-list-table')
      .querySelector('thead');
    expect(thead?.querySelectorAll('th')).toHaveLength(8);
    expect(thead?.textContent).not.toContain('截止');
    expect(thead?.textContent).not.toContain('项目');
    expect(getRow().cells).toHaveLength(8);
  });

  it('点击面板外部关闭列面板（偏好保持）', () => {
    renderList({ issues: [makeIssue('1')] });
    fireEvent.click(screen.getByTestId('issue-list-column-picker'));
    fireEvent.click(screen.getByTestId('issue-list-column-opt-identifier'));
    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByTestId('issue-list-column-panel'),
    ).toBeNull();
    expect(
      screen.queryByTestId('issue-list-sort-header-identifier'),
    ).toBeNull();
  });
});

describe('IssueListView 分组行（列表表格二阶）', () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('parseIssueListGroup：URL 参数解析（status/assignee/project/缺省/垃圾值）', () => {
    expect(parseIssueListGroup('status')).toBe('status');
    expect(parseIssueListGroup('assignee')).toBe('assignee');
    expect(parseIssueListGroup('project')).toBe('project');
    expect(parseIssueListGroup('none')).toBe('none');
    expect(parseIssueListGroup(null)).toBe('none');
    expect(parseIssueListGroup('garbage')).toBe('none');
  });

  it('分组下拉：默认无分组；选择写回 onGroupChange', () => {
    const onGroupChange = vi.fn();
    renderList({ issues: [makeIssue('1')], groupBy: 'none', onGroupChange });
    const select = screen.getByTestId('issue-list-group-select') as HTMLSelectElement;
    expect(select.value).toBe('none');
    expect(select.textContent).toContain('按状态');
    fireEvent.change(select, { target: { value: 'status' } });
    expect(onGroupChange).toHaveBeenCalledWith('status');
  });

  it('按状态分组：组行用中文标签+计数，组间按既有列序（待办→进行中→审核中）', () => {
    renderList({
      groupBy: 'status',
      issues: [
        makeIssue('1', { status: 'in_progress' }),
        makeIssue('2', { status: 'todo' }),
        makeIssue('3', { status: 'in_review' }),
        makeIssue('4', { status: 'todo' }),
      ],
    });
    const groupRows = screen.getAllByTestId('issue-list-group-row');
    const labels = groupRows.map(
      (tr) => tr.querySelector('.issue-list-group-label')?.textContent,
    );
    // 列序（非插入序）：待规划…待办→进行中→审核中
    expect(labels).toEqual(['待办', '进行中', '审核中']);
    const counts = groupRows.map(
      (tr) => tr.querySelector('[data-testid="issue-list-group-count"]')?.textContent,
    );
    expect(counts).toEqual(['2', '1', '1']);
    // 组内行归属正确（每组独立 tbody，组行与组内行同组）
    const todoGroup = groupRows[0];
    expect(
      todoGroup.closest('tbody')?.querySelector('[data-issue-id="2"]'),
    ).not.toBeNull();
    // 4 个 issue + 3 个组行
    expect(screen.getAllByTestId('issue-list-row')).toHaveLength(4);
  });

  it('按指派分组：agent 名成组、未指派归「未指派」', () => {
    renderList({
      groupBy: 'assignee',
      issues: [
        makeIssue('1', { assignee: { type: 'agent', id: 'ag-1', label: 'Alpha' } }),
        makeIssue('2'),
        makeIssue('3', { assignee: { type: 'agent', id: 'ag-2', label: 'Beta' } }),
        makeIssue('4', { assignee: { type: 'agent', id: 'ag-1', label: 'Alpha' } }),
      ],
    });
    const labels = screen
      .getAllByTestId('issue-list-group-row')
      .map((tr) => tr.querySelector('.issue-list-group-label')?.textContent);
    expect(new Set(labels)).toEqual(new Set(['Alpha', 'Beta', '未指派']));
    const alphaRow = screen
      .getAllByTestId('issue-list-group-row')
      .find(
        (tr) => tr.querySelector('.issue-list-group-label')?.textContent === 'Alpha',
      );
    expect(
      alphaRow?.closest('tbody')?.querySelectorAll('[data-testid="issue-list-row"]'),
    ).toHaveLength(2);
  });

  it('按项目分组：projectTitleById 解析项目名、无项目归「无项目」', () => {
    renderList({
      groupBy: 'project',
      projectTitleById: new Map([['p-1', '官网改版']]),
      issues: [
        makeIssue('1', { projectId: 'p-1' }),
        makeIssue('2', { projectId: 'p-2', projectTitle: '移动端' }),
        makeIssue('3'),
      ],
    });
    const labels = screen
      .getAllByTestId('issue-list-group-row')
      .map((tr) => tr.querySelector('.issue-list-group-label')?.textContent);
    expect(new Set(labels)).toEqual(new Set(['官网改版', '移动端', '无项目']));
  });

  it('分组模式禁用行虚拟化：spacer 不渲染、行无 data-index、全量渲染', () => {
    renderList({
      groupBy: 'status',
      issues: [
        makeIssue('1', { status: 'todo' }),
        makeIssue('2', { status: 'in_progress' }),
      ],
    });
    const view = screen.getByTestId('issue-list-view');
    expect(view.getAttribute('data-virtualized')).toBe('0');
    expect(view.getAttribute('data-virtual-rendered')).toBe('2');
    expect(screen.queryByTestId('issue-list-virtual-pad-top')).toBeNull();
    expect(screen.queryByTestId('issue-list-virtual-pad-bottom')).toBeNull();
    for (const row of screen.getAllByTestId('issue-list-row')) {
      expect(row.hasAttribute('data-index')).toBe(false);
    }
  });

  it('组合：隐藏「优先级」+ 按状态分组 → 组行 colSpan=9，行单元格=9', () => {
    window.localStorage.setItem(HIDDEN_COLS_KEY, '["priority"]');
    renderList({
      groupBy: 'status',
      issues: [
        makeIssue('1', { status: 'todo' }),
        makeIssue('2', { status: 'in_progress' }),
      ],
    });
    expect(
      screen.queryByTestId('issue-list-sort-header-priority'),
    ).toBeNull();
    const groupTh = screen
      .getAllByTestId('issue-list-group-row')[0]
      .querySelector('th');
    expect(groupTh?.getAttribute('colspan')).toBe('9');
    expect(getRow().cells).toHaveLength(9);
  });

  it('分组行数 > 500：console.warn 提示（不阻塞渲染）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const many = Array.from({ length: 501 }, (_, i) =>
        makeIssue(String(i), { status: i % 2 ? 'todo' : 'done' }),
      );
      renderList({ groupBy: 'status', issues: many });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('全量渲染'),
      );
      expect(screen.getAllByTestId('issue-list-row')).toHaveLength(501);
    } finally {
      warn.mockRestore();
    }
  });

  it('默认零回归：不传分组 → 无组行/无分组下拉，10 列，虚拟化保持', () => {
    renderList({ issues: [makeIssue('1')] });
    expect(screen.queryByTestId('issue-list-group-row')).toBeNull();
    expect(screen.queryByTestId('issue-list-group-select')).toBeNull();
    expect(screen.getByTestId('issue-list-view').getAttribute('data-virtualized')).toBe('1');
    expect(
      screen.getByTestId('issue-list-table').querySelectorAll('thead th'),
    ).toHaveLength(10);
    expect(getRow().cells).toHaveLength(10);
  });
});
