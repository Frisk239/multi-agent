'use client';
import type { Issue, IssueStatus } from '@ma/shared';

/**
 * O4 拆分：看板拖拽纯逻辑（原 KanbanBoard.tsx handleDragEnd 提取）。
 * 输入拖拽事件 + 全量 issues → 输出「目标列 + 新顺序」；返回 null = 无变更
 * （over 为空 / 类型未知 / 拖动源丢失 / 同列顺序未变）。副作用（reorder
 * mutation、清 dragId）由组件承担。
 */

export interface DragReorderResult {
  status: IssueStatus;
  orderedIds: string[];
}

export function computeDragReorder(
  event: {
    active: { id: unknown };
    over: { id: unknown; data?: { current?: { type?: string; status?: IssueStatus; issue?: { status: IssueStatus } } | null } } | null;
  },
  issues: Issue[],
): DragReorderResult | null {
  const { active, over } = event;
  if (!over) return null;

  const activeId = active.id;
  const overId = over.id;

  let status: IssueStatus;
  let beforeId: string | null = null;

  const overData = over.data?.current;
  if (overData?.type === 'Column') {
    status = overData.status as IssueStatus;
  } else if (overData?.type === 'Issue') {
    status = overData.issue!.status;
    beforeId = String(overId);
  } else {
    return null;
  }

  const dragged = issues.find((i) => i.id === activeId);
  if (!dragged) return null;
  if (beforeId === String(activeId)) return null;

  const columnIds = issues
    .filter((i) => i.status === status && i.id !== activeId)
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .map((i) => i.id);

  let orderedIds: string[];
  if (beforeId && columnIds.includes(beforeId)) {
    const idx = columnIds.indexOf(beforeId);
    orderedIds = [...columnIds.slice(0, idx), String(activeId), ...columnIds.slice(idx)];
  } else {
    orderedIds = [...columnIds, String(activeId)];
  }

  // 同列且顺序未变 → 跳过
  if (dragged.status === status) {
    const prevIds = issues
      .filter((i) => i.status === status)
      .sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return a.createdAt < b.createdAt ? 1 : -1;
      })
      .map((i) => i.id);
    if (prevIds.length === orderedIds.length && prevIds.every((id, i) => id === orderedIds[i])) {
      return null;
    }
  }

  return { status, orderedIds };
}
