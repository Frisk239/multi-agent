import { describe, it, expect } from 'vitest';
import { computeDragReorder } from './KanbanBoard.dnd';
import type { Issue } from '@ma/shared';

/**
 * O4 · 看板拖拽纯逻辑（原 handleDragEnd 提取）：
 * - over 列 / over 卡片（beforeId 插入）→ 目标列 + 新顺序
 * - 无变更场景（over 空 / 类型未知 / 源丢失 / 同列顺序未变 / beforeId==activeId）→ null
 */

function mkIssue(id: string, status: Issue['status'], position = 0, createdAt = '2026-01-01T00:00:00.000Z'): Issue {
  return {
    id,
    workspaceId: 'ws-1',
    identifier: `MA-${id}`,
    title: id,
    description: '',
    status,
    priority: 'medium',
    assignee: null,
    creatorType: 'agent',
    creatorId: 'ag-1',
    position,
    labels: [],
    createdAt,
    updatedAt: createdAt,
  } as unknown as Issue;
}

const issues = [
  mkIssue('a', 'todo', 0),
  mkIssue('b', 'todo', 1),
  mkIssue('c', 'done', 0),
];

describe('computeDragReorder', () => {
  it('over 列 → 目标列尾部', () => {
    const r = computeDragReorder(
      {
        active: { id: 'a' },
        over: { id: 'col-done', data: { current: { type: 'Column', status: 'done' } } },
      },
      issues,
    );
    expect(r).toEqual({ status: 'done', orderedIds: ['c', 'a'] });
  });

  it('over 卡片 → 插入 before 目标', () => {
    const r = computeDragReorder(
      {
        active: { id: 'a' },
        over: {
          id: 'c',
          data: { current: { type: 'Issue', status: 'done', issue: { status: 'done' } } },
        },
      },
      issues,
    );
    expect(r).toEqual({ status: 'done', orderedIds: ['a', 'c'] });
  });

  it('over 为空 → null', () => {
    expect(computeDragReorder({ active: { id: 'a' }, over: null }, issues)).toBeNull();
  });

  it('over 类型未知 → null', () => {
    expect(
      computeDragReorder({ active: { id: 'a' }, over: { id: 'x', data: { current: null } } }, issues),
    ).toBeNull();
  });

  it('源 issue 不存在 → null', () => {
    expect(
      computeDragReorder(
        { active: { id: 'ghost' }, over: { id: 'c', data: { current: { type: 'Issue', status: 'done', issue: { status: 'done' } } } } },
        issues,
      ),
    ).toBeNull();
  });

  it('beforeId === activeId → null', () => {
    expect(
      computeDragReorder(
        { active: { id: 'a' }, over: { id: 'a', data: { current: { type: 'Issue', status: 'todo', issue: { status: 'todo' } } } } },
        issues,
      ),
    ).toBeNull();
  });

  it('同列顺序未变 → null', () => {
    expect(
      computeDragReorder(
        { active: { id: 'b' }, over: { id: 'col-todo', data: { current: { type: 'Column', status: 'todo' } } } },
        issues,
      ),
    ).toBeNull();
  });

  it('同列有变化 → 新顺序（插入 before）', () => {
    const r = computeDragReorder(
      {
        active: { id: 'b' },
        over: { id: 'a', data: { current: { type: 'Issue', status: 'todo', issue: { status: 'todo' } } } },
      },
      issues,
    );
    expect(r).toEqual({ status: 'todo', orderedIds: ['b', 'a'] });
  });
});
