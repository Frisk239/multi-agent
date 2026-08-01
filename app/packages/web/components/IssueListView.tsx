'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Issue, IssueStatus, Priority } from '@ma/shared';
import type { Density } from '@/lib/density';
import {
  ISSUE_LIST_OVERSCAN,
  ISSUE_LIST_VIEWPORT_MAX_HEIGHT,
  computeVirtualTableSpacers,
  estimateIssueListRowHeight,
} from '@/lib/issue-list-virtual';
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

const COL_COUNT = 9;

export type IssueListSortCol =
  | 'identifier'
  | 'title'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'updatedAt';

/** W3：可排序表头元数据（6 列）——统一 aria-sort / 键盘 / aria-label */
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
}: IssueListViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const estimateSize = estimateIssueListRowHeight(density);

  const rowVirtualizer = useVirtualizer({
    count: issues.length,
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
    if (restoreToIndex == null || restoreToIndex <= 0) {
      restoredRef.current = true;
      return;
    }
    const target = Math.min(restoreToIndex, issues.length - 1);
    rowVirtualizer.scrollToIndex(target, { align: 'start' });
    restoredRef.current = true;
  }, [restoreToIndex, issues.length, rowVirtualizer]);

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
    issues.length,
    virtualItems,
    estimateSize,
    rowVirtualizer.getTotalSize(),
  );

  const allSelected = issues.length > 0 && selectedIds.size === issues.length;

  return (
    <div
      ref={parentRef}
      className="issue-list-view overflow-x-auto"
      data-testid="issue-list-view"
      data-virtualized={issues.length > 0 ? '1' : '0'}
      data-virtual-count={issues.length}
      data-virtual-rendered={virtualItems.length}
      style={{
        maxHeight: ISSUE_LIST_VIEWPORT_MAX_HEIGHT,
        overflow: 'auto',
      }}
    >
      <table className="issue-list-table" data-testid="issue-list-table">
        <thead>
          <tr>
            <th style={{ width: 40 }}>
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
            {SORTABLE_COLUMNS.map((c) => (
              <SortableTh
                key={c.col}
                col={c.col}
                label={c.label}
                sortLabel={c.sortLabel}
                testId={c.testId}
                sortCol={sortCol}
                sortDir={sortDir}
                onSort={onHeaderSort}
              />
            ))}
            <th>项目</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 ? (
            <tr aria-hidden="true" data-testid="issue-list-virtual-pad-top">
              <td colSpan={COL_COUNT} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {virtualItems.map((virtualRow) => {
            const iss = issues[virtualRow.index];
            if (!iss) return null;
            const pri =
              PRIORITY_OPTIONS.find((p) => p.value === iss.priority)?.label ??
              iss.priority ??
              '—';
            const assignee =
              iss.assignee?.label ??
              (iss.assignee ? `${iss.assignee.type}:${iss.assignee.id.slice(0, 6)}` : '未指派');
            const proj =
              iss.projectTitle ??
              (iss.projectId ? projectTitleById.get(iss.projectId) : undefined) ??
              '—';
            return (
              <tr
                key={iss.id}
                data-testid="issue-list-row"
                data-issue-id={iss.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className={
                  failedIssueIds.has(iss.id)
                    ? 'issue-list-row is-failed'
                    : activeIssueIds.has(iss.id)
                      ? 'issue-list-row is-active'
                      : 'issue-list-row'
                }
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(iss.id)}
                    onChange={(e) => onToggleSelect(iss.id, e.target.checked)}
                    aria-label={`选择 ${iss.identifier}`}
                  />
                </td>
                <td>
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
                <td className="issue-list-title">
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
                <td>
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
                <td className="text-sm">
                  <span
                    className={`priority-badge priority-${iss.priority || 'none'}`}
                    style={{ fontSize: '11px', padding: '2px 6px', borderRadius: 4 }}
                  >
                    {pri}
                  </span>
                </td>
                <td className="text-sm text-dim">{assignee}</td>
                <td className="text-dim text-sm">{proj}</td>
                <td className="text-dim text-sm" style={{ whiteSpace: 'nowrap' }}>
                  {iss.updatedAt
                    ? new Date(iss.updatedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—'}
                </td>
                <td>
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
              </tr>
            );
          })}
          {paddingBottom > 0 ? (
            <tr aria-hidden="true" data-testid="issue-list-virtual-pad-bottom">
              <td colSpan={COL_COUNT} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
      {issues.length === 0 ? (
        <div style={{ padding: 24 }} data-testid="issue-list-empty">
          <p className="text-dim" style={{ margin: 0, textAlign: 'center' }}>
            列表中无符合条件的 Issue
          </p>
        </div>
      ) : null}
    </div>
  );
}
