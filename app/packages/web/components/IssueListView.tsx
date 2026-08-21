'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Issue, IssueStatus, Priority } from '@ma/shared';
import type { Density } from '@/lib/density';
import { dueModifierClass, dueState } from '@/lib/due';
import {
  ISSUE_LIST_OVERSCAN,
  ISSUE_LIST_VIEWPORT_MAX_HEIGHT,
  computeVirtualTableSpacers,
  estimateIssueListRowHeight,
} from '@/lib/issue-list-virtual';
import type { IssueListGroupMode } from './KanbanBoard.shared';
import { Select } from './Select';

const PRIORITY_OPTIONS: { value: '' | Priority; label: string }[] = [
  { value: '', label: '全部优先级' },
  { value: 'urgent', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
  { value: 'none', label: '无' },
];

const STATUS_COLUMNS: { title: string; status: IssueStatus }[] = [
  { title: '待规划', status: 'backlog' },
  { title: '待办', status: 'todo' },
  { title: '进行中', status: 'in_progress' },
  { title: '审核中', status: 'in_review' },
  { title: '已完成', status: 'done' },
  { title: '已阻塞', status: 'blocked' },
  { title: '已取消', status: 'cancelled' },
];

// —— 列表表格二阶：列选择 ——
// 可隐藏列（按显示顺序）。spec 候选含「标签」，但现网列表无标签列，按拍板不纳入。
const OPTIONAL_COLUMNS: { key: IssueListOptionalColumn; label: string }[] = [
  { key: 'identifier', label: '标识' },
  { key: 'priority', label: '优先级' },
  { key: 'updatedAt', label: '更新时间' },
  { key: 'dueDate', label: '截止' },
  { key: 'project', label: '项目' },
];

const HIDDEN_COLS_STORAGE_KEY = 'issue-list-hidden-cols';

/** 分组模式下行数超过该值时 console.warn（仍全量渲染，不阻塞） */
const GROUP_RENDER_WARN_THRESHOLD = 500;

export type IssueListOptionalColumn =
  | 'identifier'
  | 'priority'
  | 'updatedAt'
  | 'dueDate'
  | 'project';

/** 表格完整列序（表头与行单元格共用同一份顺序，保证永不错位） */
type TableCellColumn =
  | 'select'
  | 'title'
  | 'status'
  | 'assignee'
  | 'actions'
  | IssueListOptionalColumn;

const TABLE_COLUMN_ORDER: TableCellColumn[] = [
  'select',
  'identifier',
  'title',
  'status',
  'priority',
  'assignee',
  'updatedAt',
  'dueDate',
  'project',
  'actions',
];

/** localStorage 隐藏列解析：非 JSON 数组 / 含未知列 → 容错为空集（全部显示） */
export function parseHiddenColumns(raw: string | null): Set<IssueListOptionalColumn> {
  if (!raw) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (!Array.isArray(parsed)) return new Set();
  const valid = OPTIONAL_COLUMNS.map((c) => c.key as string);
  if (!parsed.every((v) => typeof v === 'string' && valid.includes(v))) {
    return new Set();
  }
  return new Set(parsed as IssueListOptionalColumn[]);
}

export type IssueListGroup = {
  key: string;
  label: string;
  issues: Issue[];
};

/**
 * 分组计算（纯函数）：组内保持传入顺序（调用方已排序）；组间——
 * 状态用既有 STATUS_COLUMNS 列序（未知状态排后按名稳定），指派/项目按组名排序。
 * 未指派 → 「未指派」；无项目 → 「无项目」。
 */
export function groupIssuesForList(
  issues: Issue[],
  groupBy: IssueListGroupMode,
  projectTitleById: Map<string, string>,
): IssueListGroup[] {
  if (groupBy === 'none') return [];
  const buckets = new Map<string, { label: string; issues: Issue[] }>();
  for (const iss of issues) {
    let key: string;
    let label: string;
    if (groupBy === 'status') {
      key = iss.status;
      label = STATUS_COLUMNS.find((c) => c.status === iss.status)?.title ?? iss.status;
    } else if (groupBy === 'assignee') {
      if (!iss.assignee) {
        key = '__unassigned__';
        label = '未指派';
      } else {
        // 与行内指派列同一解析口径
        label =
          iss.assignee.label ??
          `${iss.assignee.type}:${iss.assignee.id.slice(0, 6)}`;
        key = label;
      }
    } else {
      if (!iss.projectId) {
        key = '__noproject__';
        label = '无项目';
      } else {
        key = iss.projectId;
        label =
          iss.projectTitle ?? projectTitleById.get(iss.projectId) ?? iss.projectId;
      }
    }
    const bucket = buckets.get(key) ?? { label, issues: [] };
    bucket.issues.push(iss);
    buckets.set(key, bucket);
  }
  const entries = [...buckets.entries()];
  if (groupBy === 'status') {
    const order = new Map(STATUS_COLUMNS.map((c, i) => [c.status as string, i]));
    entries.sort((a, b) => {
      const ia = order.get(a[0]) ?? STATUS_COLUMNS.length;
      const ib = order.get(b[0]) ?? STATUS_COLUMNS.length;
      if (ia !== ib) return ia - ib;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    });
  } else {
    entries.sort(
      (a, b) =>
        a[1].label.localeCompare(b[1].label, 'zh-Hans-CN') ||
        (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
    );
  }
  return entries.map(([key, bucket]) => ({
    key,
    label: bucket.label,
    issues: bucket.issues,
  }));
}

export type IssueListSortCol =
  | 'identifier'
  | 'title'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'updatedAt'
  | 'dueDate';

/** W3：可排序表头元数据（7 列）——统一 aria-sort / 键盘 / aria-label */
const SORTABLE_COLUMNS: {
  col: IssueListSortCol;
  label: string;
  sortLabel: string;
  testId: string;
}[] = [
  { col: 'identifier', label: '标识', sortLabel: '按标识排序', testId: 'issue-list-sort-header-identifier' },
  { col: 'title', label: '标题', sortLabel: '按标题排序', testId: 'issue-list-sort-header-title' },
  { col: 'status', label: '状态', sortLabel: '按状态排序', testId: 'issue-list-sort-header-status' },
  { col: 'priority', label: '优先级', sortLabel: '按优先级排序', testId: 'issue-list-sort-header-priority' },
  { col: 'assignee', label: '指派', sortLabel: '按指派排序', testId: 'issue-list-sort-header-assignee' },
  { col: 'updatedAt', label: '更新时间', sortLabel: '按更新时间排序', testId: 'issue-list-sort-header-updatedAt' },
  { col: 'dueDate', label: '截止', sortLabel: '按截止日期排序', testId: 'issue-list-sort-header-dueDate' },
];

/** W3：可排序表头——aria-sort + tabIndex=0 + Enter/Space 与点击同逻辑 */
function SortableTh({
  col,
  label,
  sortLabel,
  testId,
  sortCol,
  sortDir,
  onSort,
}: {
  col: IssueListSortCol;
  label: string;
  sortLabel: string;
  testId: string;
  sortCol: IssueListSortCol | null;
  sortDir: 'asc' | 'desc';
  onSort: (col: IssueListSortCol) => void;
}) {
  const active = sortCol === col;
  const ariaSort: 'ascending' | 'descending' | 'none' = active
    ? sortDir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  const ariaLabel = active
    ? `${label}，可排序，当前${sortDir === 'asc' ? '升序' : '降序'}`
    : `${label}，可排序`;
  return (
    <th
      scope="col"
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onSort(col)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSort(col);
        }
      }}
      tabIndex={0}
      aria-sort={ariaSort}
      aria-label={ariaLabel}
      data-testid={testId}
      title={sortLabel}
    >
      {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );
}

export type IssueListViewProps = {
  issues: Issue[];
  density: Density;
  selectedIds: Set<string>;
  failedIssueIds: Set<string>;
  activeIssueIds: Set<string>;
  projectTitleById: Map<string, string>;
  sortCol: IssueListSortCol | null;
  sortDir: 'asc' | 'desc';
  onHeaderSort: (col: IssueListSortCol) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onStatusChange: (id: string, status: IssueStatus) => void;
  /** Slice 32：行点进侧滑；不传则仍走 `/issues/[id]` 全页 */
  getDetailHref?: (issue: Issue) => string;
  onOpenDetail?: (issueId: string, e?: React.MouseEvent) => void;
  /** S1：挂载后要滚到的行号（来自锚点恢复）；null = 不滚 */
  restoreToIndex?: number | null;
  /** S1：顶部可见行变化时上报，供调用方保存锚点 */
  onTopRowChange?: (issueId: string | null, index: number) => void;
  /** 列表表格二阶：分组维度（URL `?group=` 由调用方 KanbanBoard 持有） */
  groupBy?: IssueListGroupMode;
  /** 列表表格二阶：分组下拉写回（不传则不渲染分组下拉） */
  onGroupChange?: (mode: IssueListGroupMode) => void;
};

export function IssueListView({
  issues,
  density,
  selectedIds,
  failedIssueIds,
  activeIssueIds,
  projectTitleById,
  sortCol,
  sortDir,
  onHeaderSort,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onStatusChange,
  getDetailHref,
  onOpenDetail,
  restoreToIndex,
  onTopRowChange,
  groupBy = 'none',
  onGroupChange,
}: IssueListViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const estimateSize = estimateIssueListRowHeight(density);

  // —— 列选择：隐藏集合（localStorage 持久化，首载读取，非法容错为空集）——
  const [hiddenCols, setHiddenCols] = useState<Set<IssueListOptionalColumn>>(
    () => new Set(),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // mount 后读（SSR/水合安全：首帧与现网一致，读到的偏好再应用）
    try {
      setHiddenCols(
        parseHiddenColumns(window.localStorage.getItem(HIDDEN_COLS_STORAGE_KEY)),
      );
    } catch {
      // localStorage 不可用（隐私模式等）→ 忽略，保持全列
    }
  }, []);

  const toggleColumn = (key: IssueListOptionalColumn) => {
    const next = new Set(hiddenCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHiddenCols(next);
    try {
      window.localStorage.setItem(
        HIDDEN_COLS_STORAGE_KEY,
        JSON.stringify([...next]),
      );
    } catch {
      // 持久化失败不影响本次会话
    }
  };

  // 列面板：Esc / 点击外部关闭（对齐 IssueCardMenu 的关闭模式）
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (pickerRootRef.current?.contains(t)) return;
      setPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [pickerOpen]);

  const visibleColumns = useMemo(
    () =>
      TABLE_COLUMN_ORDER.filter(
        (key) =>
          !OPTIONAL_COLUMNS.some((c) => c.key === key) || !hiddenCols.has(
            key as IssueListOptionalColumn,
          ),
      ),
    [hiddenCols],
  );
  // COL_COUNT 动态化：固定列（选择框/标题/状态/指派/操作）+ 可见可选列
  const colCount = visibleColumns.length;

  // —— 分组：group≠none 时禁用行虚拟化（全量渲染，spacer 不出）——
  const grouping = groupBy !== 'none';
  const groups = useMemo(
    () => groupIssuesForList(issues, groupBy, projectTitleById),
    [issues, groupBy, projectTitleById],
  );

  useEffect(() => {
    if (grouping && issues.length > GROUP_RENDER_WARN_THRESHOLD) {
      // 行数较大仍全量渲染：仅提示，不阻塞
      console.warn(
        `[IssueListView] 分组视图已禁用虚拟化，当前全量渲染 ${issues.length} 行`,
      );
    }
  }, [grouping, issues.length]);

  const rowVirtualizer = useVirtualizer({
    count: grouping ? 0 : issues.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: ISSUE_LIST_OVERSCAN,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // S1：只在挂载后恢复一次，之后用户自己的滚动不该被再次劫持
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    if (issues.length === 0) return;
    if (grouping) {
      // 分组模式无虚拟化/锚点语义：消耗掉本次恢复，避免切回时劫持滚动
      restoredRef.current = true;
      return;
    }
    if (restoreToIndex == null || restoreToIndex <= 0) {
      restoredRef.current = true;
      return;
    }
    const target = Math.min(restoreToIndex, issues.length - 1);
    rowVirtualizer.scrollToIndex(target, { align: 'start' });
    restoredRef.current = true;
  }, [restoreToIndex, issues.length, rowVirtualizer, grouping]);

  // S1：上报当前顶部可见行，供调用方存锚点（离开时才写存储，这里只回调）
  const firstVisibleIndex = virtualItems[0]?.index ?? -1;
  const lastReportedRef = useRef<number>(-1);
  useEffect(() => {
    if (!onTopRowChange) return;
    if (firstVisibleIndex < 0) return;
    if (lastReportedRef.current === firstVisibleIndex) return;
    lastReportedRef.current = firstVisibleIndex;
    onTopRowChange(issues[firstVisibleIndex]?.id ?? null, firstVisibleIndex);
  }, [firstVisibleIndex, issues, onTopRowChange]);
  const { paddingTop, paddingBottom } = computeVirtualTableSpacers(
    grouping ? 0 : issues.length,
    virtualItems,
    estimateSize,
    rowVirtualizer.getTotalSize(),
  );

  const allSelected = issues.length > 0 && selectedIds.size === issues.length;

  // —— 行渲染（表头/单元格共用 visibleColumns 顺序，天然对齐）——
  const renderRowCells = (iss: Issue) =>
    visibleColumns.map((key) => {
      switch (key) {
        case 'select':
          return (
            <td key={key}>
              <input
                type="checkbox"
                checked={selectedIds.has(iss.id)}
                onChange={(e) => onToggleSelect(iss.id, e.target.checked)}
                aria-label={`选择 ${iss.identifier}`}
              />
            </td>
          );
        case 'identifier':
          return (
            <td key={key}>
              <Link
                href={getDetailHref?.(iss) ?? `/issues/${iss.id}`}
                className="issue-list-id"
                data-testid="issue-list-id-link"
                onClick={(e) => {
                  if (!onOpenDetail) return;
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                    return;
                  }
                  e.preventDefault();
                  onOpenDetail(iss.id);
                }}
              >
                {iss.identifier}
              </Link>
            </td>
          );
        case 'title':
          return (
            <td key={key} className="issue-list-title">
              <Link
                href={getDetailHref?.(iss) ?? `/issues/${iss.id}`}
                data-testid="issue-list-title-link"
                onClick={(e) => {
                  if (!onOpenDetail) return;
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                    return;
                  }
                  e.preventDefault();
                  onOpenDetail(iss.id);
                }}
              >
                {iss.title}
              </Link>
            </td>
          );
        case 'status':
          return (
            <td key={key}>
              <Select
                className="btn-ghost btn-xs"
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: '12px',
                  fontWeight: 500,
                }}
                value={iss.status}
                onChange={(e) =>
                  onStatusChange(iss.id, e.target.value as IssueStatus)
                }
                data-testid="issue-list-status-select"
                aria-label={`修改 ${iss.identifier} 状态`}
              >
                {STATUS_COLUMNS.map((col) => (
                  <option key={col.status} value={col.status}>
                    {col.title}
                  </option>
                ))}
              </Select>
            </td>
          );
        case 'priority': {
          const pri =
            PRIORITY_OPTIONS.find((p) => p.value === iss.priority)?.label ??
            iss.priority ??
            '—';
          return (
            <td key={key} className="text-sm">
              <span
                className={`priority-badge priority-${iss.priority || 'none'}`}
                style={{ fontSize: '11px', padding: '2px 6px', borderRadius: 4 }}
              >
                {pri}
              </span>
            </td>
          );
        }
        case 'assignee': {
          const assignee =
            iss.assignee?.label ??
            (iss.assignee ? `${iss.assignee.type}:${iss.assignee.id.slice(0, 6)}` : '未指派');
          return <td key={key} className="text-sm text-dim">{assignee}</td>;
        }
        case 'updatedAt':
          return (
            <td key={key} className="text-dim text-sm" style={{ whiteSpace: 'nowrap' }}>
              {iss.updatedAt
                ? new Date(iss.updatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </td>
          );
        // issue-due-date：截止列（三态文本+颜色；无日期 —）
        case 'dueDate':
          return (
            <td key={key} className="text-sm" style={{ whiteSpace: 'nowrap' }}>
              {iss.dueDate ? (
                <span
                  className={dueModifierClass(dueState(iss.dueDate))}
                  data-testid="issue-list-due"
                  data-due-state={dueState(iss.dueDate) ?? 'normal'}
                >
                  {iss.dueDate}
                </span>
              ) : (
                '—'
              )}
            </td>
          );
        case 'project': {
          const proj =
            iss.projectTitle ??
            (iss.projectId ? projectTitleById.get(iss.projectId) : undefined) ??
            '—';
          return <td key={key} className="text-dim text-sm">{proj}</td>;
        }
        case 'actions':
          return (
            <td key={key}>
              <Link
                href={getDetailHref?.(iss) ?? `/issues/${iss.id}`}
                className="btn-ghost btn-xs"
                style={{ textDecoration: 'none' }}
                data-testid="issue-list-open-detail"
                onClick={(e) => {
                  if (!onOpenDetail) return;
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                    return;
                  }
                  e.preventDefault();
                  onOpenDetail(iss.id);
                }}
              >
                详情
              </Link>
            </td>
          );
        default:
          return null;
      }
    });

  const renderRow = (iss: Issue, virtualRow?: { index: number }) => (
    <tr
      key={iss.id}
      data-testid="issue-list-row"
      data-issue-id={iss.id}
      data-index={virtualRow ? virtualRow.index : undefined}
      ref={virtualRow ? rowVirtualizer.measureElement : undefined}
      className={
        failedIssueIds.has(iss.id)
          ? 'issue-list-row is-failed'
          : activeIssueIds.has(iss.id)
            ? 'issue-list-row is-active'
            : 'issue-list-row'
      }
    >
      {renderRowCells(iss)}
    </tr>
  );

  return (
    <div className="issue-list-shell" data-testid="issue-list-shell">
      {/* 工具行：分组下拉 + 列选择（紧邻表头上方，与筛选区对齐） */}
      <div className="issue-list-toolbar" data-testid="issue-list-toolbar">
        {onGroupChange ? (
          <Select
            className="issue-list-group-select"
            value={groupBy}
            onChange={(e) =>
              onGroupChange(e.target.value as IssueListGroupMode)
            }
            data-testid="issue-list-group-select"
            aria-label="分组"
          >
            <option value="none">无分组</option>
            <option value="status">按状态</option>
            <option value="assignee">按指派</option>
            <option value="project">按项目</option>
          </Select>
        ) : null}
        <div className="issue-list-column-picker-root" ref={pickerRootRef}>
          <button
            type="button"
            className="btn-ghost btn-xs issue-list-column-picker-button"
            data-testid="issue-list-column-picker"
            aria-haspopup="true"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((v) => !v)}
          >
            列
          </button>
          {pickerOpen ? (
            <div
              className="issue-list-column-panel"
              data-testid="issue-list-column-panel"
              role="group"
              aria-label="选择显示的列"
            >
              {OPTIONAL_COLUMNS.map((c) => (
                <label key={c.key} className="issue-list-column-option">
                  <input
                    type="checkbox"
                    checked={!hiddenCols.has(c.key)}
                    onChange={() => toggleColumn(c.key)}
                    data-testid={`issue-list-column-opt-${c.key}`}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div
        ref={parentRef}
        className="issue-list-view"
        data-testid="issue-list-view"
        data-virtualized={grouping ? '0' : issues.length > 0 ? '1' : '0'}
        data-virtual-count={issues.length}
        data-virtual-rendered={grouping ? issues.length : virtualItems.length}
        style={{
          maxHeight: ISSUE_LIST_VIEWPORT_MAX_HEIGHT,
          overflow: 'auto',
        }}
      >
        <table className="issue-list-table" data-testid="issue-list-table">
          <thead>
            <tr>
              {visibleColumns.map((key) => {
                if (key === 'select') {
                  return (
                    <th key={key} style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => {
                          if (e.target.checked) onSelectAll(issues.map((i) => i.id));
                          else onClearSelection();
                        }}
                        aria-label="全选 Issue"
                      />
                    </th>
                  );
                }
                const sortable = SORTABLE_COLUMNS.find((c) => c.col === key);
                if (sortable) {
                  return (
                    <SortableTh
                      key={key}
                      col={sortable.col}
                      label={sortable.label}
                      sortLabel={sortable.sortLabel}
                      testId={sortable.testId}
                      sortCol={sortCol}
                      sortDir={sortDir}
                      onSort={onHeaderSort}
                    />
                  );
                }
                return (
                  <th key={key}>{key === 'project' ? '项目' : '操作'}</th>
                );
              })}
            </tr>
          </thead>
          {grouping ? (
            groups.map((g) => (
              <tbody key={g.key}>
                <tr
                  data-testid="issue-list-group-row"
                  data-group-key={g.key}
                  className="issue-list-group-row"
                >
                  <th colSpan={colCount} scope="colgroup">
                    <span className="issue-list-group-label">{g.label}</span>
                    <span
                      className="issue-list-group-count"
                      data-testid="issue-list-group-count"
                    >
                      {g.issues.length}
                    </span>
                  </th>
                </tr>
                {g.issues.map((iss) => renderRow(iss))}
              </tbody>
            ))
          ) : (
            <tbody>
              {paddingTop > 0 ? (
                <tr aria-hidden="true" data-testid="issue-list-virtual-pad-top">
                  <td colSpan={colCount} style={{ height: paddingTop, padding: 0, border: 0 }} />
                </tr>
              ) : null}
              {virtualItems.map((virtualRow) => {
                const iss = issues[virtualRow.index];
                if (!iss) return null;
                return renderRow(iss, virtualRow);
              })}
              {paddingBottom > 0 ? (
                <tr aria-hidden="true" data-testid="issue-list-virtual-pad-bottom">
                  <td colSpan={colCount} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                </tr>
              ) : null}
            </tbody>
          )}
        </table>
        {issues.length === 0 ? (
          <div style={{ padding: 24 }} data-testid="issue-list-empty">
            <p className="text-dim" style={{ margin: 0, textAlign: 'center' }}>
              列表中无符合条件的 Issue
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

