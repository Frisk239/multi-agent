'use client';

import React, { useRef } from 'react';
import type { AgentReadiness, Issue, IssueStatus } from '@ma/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { IssueCard } from './IssueCard';
import { ErrorBoundary } from './ErrorBoundary';
import { Icon } from './Icon';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDensity } from '@/lib/density';
import {
  KANBAN_COLUMN_OVERSCAN,
  estimateKanbanCardGap,
  estimateKanbanCardHeight,
  shouldVirtualizeKanbanColumn,
} from '@/lib/kanban-column-virtual';

interface Props {
  title: string;
  status: IssueStatus;
  color: string;
  issues: Issue[];
  onDragStart?: (id: string) => void;
  /** DS2：落到列（可带 beforeId 表示插到该卡之前；null=列末） */
  onDrop?: (status: IssueStatus, beforeId: string | null) => void;
  readinessByAgentId?: Record<string, AgentReadiness | null>;
  failedIssueIds?: Set<string>;
  /** queued/running run 覆盖的 issue */
  activeIssueIds?: Set<string>;
  /** issueId → agentId（用于 squad 时已解析为 leader） */
  assigneeAgentByIssueId?: Record<string, string | undefined>;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, checked: boolean) => void;
  /** Slice 32：卡片主链 → 侧滑 */
  getDetailHref?: (issue: Issue) => string;
  onOpenDetail?: (issueId: string, e?: React.MouseEvent) => void;
  /** F2：列头「+」→ 请求在指定状态列新建（打开 NewIssueForm 并预填 status） */
  onQuickCreate?: (status: IssueStatus) => void;
}

function renderCard(
  iss: Issue,
  props: Pick<
    Props,
    | 'onDragStart'
    | 'readinessByAgentId'
    | 'failedIssueIds'
    | 'activeIssueIds'
    | 'assigneeAgentByIssueId'
    | 'selectedIds'
    | 'onToggleSelect'
    | 'getDetailHref'
    | 'onOpenDetail'
  >,
) {
  const agentId = props.assigneeAgentByIssueId?.[iss.id];
  const rd = agentId ? props.readinessByAgentId?.[agentId] : null;
  return (
    <IssueCard
      issue={iss}
      onDragStart={props.onDragStart}
      readiness={rd}
      lastRunFailed={props.failedIssueIds?.has(iss.id)}
      runActive={props.activeIssueIds?.has(iss.id)}
      selected={props.selectedIds?.has(iss.id)}
      onToggleSelect={props.onToggleSelect}
      detailHref={props.getDetailHref?.(iss)}
      onOpenDetail={props.onOpenDetail}
    />
  );
}

/**
 * Multica board-column：列 tint 背景 + 标题计数 + 空列「无 issue」
 * Slice 37：单列 ≥40 时 @tanstack/react-virtual 列内滚动（与 list 阈值对齐）。
 * 参考 references/repos/multica/packages/views/issues/components/board-column.tsx
 */
export const KanbanColumn = React.memo(function KanbanColumn({
  title,
  color,
  issues,
  onDragStart,
  onDrop: _onDrop,
  status,
  readinessByAgentId,
  failedIssueIds,
  activeIssueIds,
  assigneeAgentByIssueId,
  selectedIds,
  onToggleSelect,
  getDetailHref,
  onOpenDetail,
  onQuickCreate,
}: Props) {
  const { setNodeRef } = useDroppable({
    id: status,
    data: { type: 'Column', status },
  });
  const { density } = useDensity();
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualize = shouldVirtualizeKanbanColumn(issues.length);
  const estimateSize = estimateKanbanCardHeight(density);
  const gap = estimateKanbanCardGap(density);

  const cardVirtualizer = useVirtualizer({
    count: virtualize ? issues.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: KANBAN_COLUMN_OVERSCAN,
    gap,
    getItemKey: (index) => issues[index]?.id ?? index,
    enabled: virtualize,
  });

  const virtualItems = virtualize ? cardVirtualizer.getVirtualItems() : [];
  const cardProps = {
    onDragStart,
    readinessByAgentId,
    failedIssueIds,
    activeIssueIds,
    assigneeAgentByIssueId,
    selectedIds,
    onToggleSelect,
    getDetailHref,
    onOpenDetail,
  };

  return (
    <section
      ref={setNodeRef}
      className="kanban-column"
      data-status={status}
      data-testid="kanban-column"
      data-virtualized={virtualize ? '1' : '0'}
      data-virtual-count={issues.length}
      data-virtual-rendered={virtualize ? virtualItems.length : issues.length}
    >
      <header className="kanban-column-header">
        <div className="kanban-column-heading">
          <span className="kanban-column-dot" style={{ background: color }} />
          <strong className="kanban-column-title">{title}</strong>
          <span className="kanban-column-count">{issues.length}</span>
        </div>
        <div className="kanban-column-actions">
          <button
            type="button"
            className="kanban-column-add"
            data-testid="kanban-column-add"
            data-status={status}
            title={`在「${title}」列新建 Issue`}
            aria-label={`在「${title}」列新建 Issue`}
            onClick={(e) => {
              e.stopPropagation();
              onQuickCreate?.(status);
            }}
          >
            <Icon name="plus" size={12} />
          </button>
          <a
            href={`/?status=${encodeURIComponent(status)}`}
            className="kanban-column-focus"
            data-testid="kanban-column-focus"
            data-status={status}
            title={`仅显示 ${title} 列`}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            聚焦
          </a>
        </div>
      </header>
      <div
        ref={parentRef}
        className="kanban-column-body"
        data-testid="kanban-column-body"
      >
        {issues.length === 0 ? (
          <div className="kanban-column-empty" data-testid="kanban-column-empty">
            无 issue
          </div>
        ) : (
          <ErrorBoundary
            fallback={
              <div className="kanban-column-error" data-testid="kanban-column-error">
                <span>该列加载失败</span>
              </div>
            }
          >
            <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {virtualize ? (
              <div
                className="kanban-column-virtual-inner"
                data-testid="kanban-column-virtual-inner"
                style={{
                  height: `${cardVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const iss = issues[virtualRow.index];
                  if (!iss) return null;
                  return (
                    <div
                      key={iss.id}
                      className="kanban-card-slot kanban-card-slot--virtual"
                      data-testid="kanban-card-slot"
                      data-issue-id={iss.id}
                      data-index={virtualRow.index}
                      ref={cardVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {renderCard(iss, cardProps)}
                    </div>
                  );
                })}
              </div>
            ) : (
              issues.map((iss) => (
                <div
                  key={iss.id}
                  className="kanban-card-slot"
                  data-testid="kanban-card-slot"
                  data-issue-id={iss.id}
                >
                  {renderCard(iss, cardProps)}
                </div>
              ))
            )}
          </SortableContext>
          </ErrorBoundary>
        )}
      </div>
    </section>
  );
});
