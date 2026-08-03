'use client';
import type { IssueStatus, Priority, Issue } from '@ma/shared';
import { KeyboardCode } from '@dnd-kit/core';
import type { KeyboardCoordinateGetter } from '@dnd-kit/core';

/**
 * O4 拆分：看板共享常量 / 类型 / 纯工具（原 KanbanBoard.tsx 63-193 行搬移）。
 * Column/Card 已是独立组件（KanbanColumn.tsx / IssueCard.tsx），本模块承载
 * 列定义、优先级、URL 参数解析、DnD 键盘坐标。
 */

export const PRIORITY_OPTIONS: { value: '' | Priority; label: string }[] = [
  { value: '', label: '全部优先级' },
  { value: 'urgent', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
  { value: 'none', label: '无' },
];

// Multica 真站 7 列：backlog…cancelled（STATUS_ORDER）
// G5：展示名对齐 Multica 中文产品列；status 枚举不变
export const COLUMNS: { title: string; status: IssueStatus; color: string }[] = [
  { title: '待规划', status: 'backlog', color: 'var(--status-backlog)' },
  { title: '待办', status: 'todo', color: 'var(--status-todo)' },
  { title: '进行中', status: 'in_progress', color: 'var(--status-in-progress)' },
  { title: '审核中', status: 'in_review', color: 'var(--status-in-review)' },
  { title: '已完成', status: 'done', color: 'var(--status-done)' },
  { title: '已阻塞', status: 'blocked', color: 'var(--status-blocked)' },
  { title: '已取消', status: 'cancelled', color: 'var(--status-cancelled)' },
];

function boardDirection(code: string): BoardDirection | null {
  switch (code) {
    case KeyboardCode.Down:
      return 'down';
    case KeyboardCode.Up:
      return 'up';
    case KeyboardCode.Left:
      return 'left';
    case KeyboardCode.Right:
      return 'right';
    default:
      return null;
  }
}

type BoardDirection = 'up' | 'down' | 'left' | 'right';

/**
 * G3-2：看板键盘坐标（dnd-kit 多容器官方模式的自定义 getter）。
 * sortableKeyboardCoordinates 只支持「列内相邻卡片」；看板是横向 7 列，
 * 需要左右跨列：
 * - 左右 → 目标相邻「列」（type=Column droppable）内侧点
 * - 上下 → 当前列内相邻「卡片」（type=Issue droppable）中心点
 * Space/Enter 仍由 KeyboardSensor 默认处理（拾起/放下）。
 */
export const kanbanKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { active, droppableRects, droppableContainers, collisionRect } },
) => {
  const direction = boardDirection(event.code);
  if (!direction || !active) return undefined;

  const cur = active.rect.current;
  const translated = cur && 'translated' in cur ? cur.translated : null;
  const activeRect =
    collisionRect ?? translated ?? (cur && 'translated' in cur ? cur.initial : cur);
  if (!activeRect) return undefined;

  const containers = [...droppableContainers.values()]
    .map((c) => ({ id: c.id, data: c.data?.current, rect: droppableRects.get(c.id) }))
    .filter((c) => c.rect != null) as Array<{
    id: unknown;
    data: { type?: string } | undefined;
    rect: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  }>;

  const columns = containers.filter((c) => c.data?.type === 'Column');
  const items = containers.filter((c) => c.data?.type === 'Issue');
  if (columns.length < 2) return undefined;

  const cx = activeRect.left + activeRect.width / 2;
  const cy = activeRect.top + activeRect.height / 2;

  if (direction === 'left' || direction === 'right') {
    // 当前所在列 = 包含活动元素中心的列；取左右相邻列
    const current =
      columns.find(
        (c) => c.rect.left <= cx && cx <= c.rect.right && c.rect.top <= cy && cy <= c.rect.bottom,
      ) ?? columns[0];
    const sorted = [...columns].sort((a, b) => a.rect.left - b.rect.left);
    const idx = sorted.findIndex((c) => c.id === current.id);
    const target = direction === 'right' ? sorted[idx + 1] : sorted[idx - 1];
    if (!target) return undefined;
    return {
      x: direction === 'right' ? target.rect.left + 20 : target.rect.right - 20,
      y: Math.min(Math.max(cy, target.rect.top + 10), target.rect.bottom - 10),
    };
  }

  // 上下：当前列内卡片按 y 排序，取相邻卡片中心
  const currentColumn = columns.find(
    (c) => c.rect.left <= cx && cx <= c.rect.right && c.rect.top <= cy && cy <= c.rect.bottom,
  );
  const inColumn = currentColumn
    ? items.filter(
        (i) => i.rect.left >= currentColumn.rect.left - 4 && i.rect.right <= currentColumn.rect.right + 4,
      )
    : [];
  const sorted = [...inColumn].sort((a, b) => a.rect.top - b.rect.top);
  const idx = sorted.findIndex((i) => String(i.id) === String(active.id));
  const target = direction === 'down' ? sorted[idx + 1] : sorted[idx - 1];
  if (!target) return undefined;
  return { x: target.rect.left + target.rect.width / 2, y: target.rect.top + target.rect.height / 2 };
};


/** URL 参数 → assignee 过滤器值（/issues?assignee=…） */
export function parseAssigneeParam(raw: string | null): {
  assigneeType?: 'agent' | 'squad';
  assigneeId?: string;
  unassigned?: boolean;
  assigned?: boolean;
} {
  if (!raw) return {};
  if (raw === 'none') return { unassigned: true };
  if (raw === 'any') return { assigned: true };
  if (raw.startsWith('agent:')) {
    const id = raw.slice('agent:'.length);
    return id ? { assigneeType: 'agent', assigneeId: id } : {};
  }
  if (raw.startsWith('squad:')) {
    const id = raw.slice('squad:'.length);
    return id ? { assigneeType: 'squad', assigneeId: id } : {};
  }
  return {};
}

export type KanbanScopeFilter = (issue: Issue) => boolean;
