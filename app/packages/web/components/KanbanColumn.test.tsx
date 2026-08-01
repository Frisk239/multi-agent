import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * F2 · KanbanColumn 列头「+」快速建卡：
 * - 按钮在「聚焦」旁渲染，带 data-status
 * - 点击触发 onQuickCreate(status)
 * 依赖（dnd-kit / virtualizer / density）全部 mock。
 */

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
    measureElement: vi.fn(),
  }),
}));

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn() }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  verticalListSortingStrategy: {},
}));

vi.mock('@/lib/density', () => ({
  useDensity: () => ({ density: 'comfortable' }),
}));

vi.mock('@/lib/kanban-column-virtual', () => ({
  KANBAN_COLUMN_OVERSCAN: 10,
  estimateKanbanCardGap: () => 4,
  estimateKanbanCardHeight: () => 100,
  shouldVirtualizeKanbanColumn: () => false,
}));

vi.mock('./IssueCard', () => ({
  IssueCard: () => <div data-testid="mock-card" />,
}));

vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { KanbanColumn } from './KanbanColumn';

function renderColumn(
  props: Partial<Parameters<typeof KanbanColumn>[0]> = {},
) {
  return render(
    <KanbanColumn
      title="待办"
      status="todo"
      color="var(--status-todo)"
      issues={[]}
      {...props}
    />,
  );
}

describe('KanbanColumn F2 列头「+」', () => {
  afterEach(() => {
    cleanup();
  });

  it('「+」在「聚焦」旁渲染并带 data-status', () => {
    renderColumn({ status: 'done', title: '已完成' });
    const add = screen.getByTestId('kanban-column-add');
    expect(add).toBeTruthy();
    expect(add.getAttribute('data-status')).toBe('done');
    expect(screen.getByTestId('kanban-column-focus')).toBeTruthy();
  });

  it('点击「+」触发 onQuickCreate 并携带该列 status', () => {
    const onQuickCreate = vi.fn();
    renderColumn({ status: 'in_progress', onQuickCreate });
    fireEvent.click(screen.getByTestId('kanban-column-add'));
    expect(onQuickCreate).toHaveBeenCalledTimes(1);
    expect(onQuickCreate).toHaveBeenCalledWith('in_progress');
  });

  it('未传 onQuickCreate 时点击不报错', () => {
    renderColumn();
    expect(() => fireEvent.click(screen.getByTestId('kanban-column-add'))).not.toThrow();
  });
});
