import { describe, it, expect } from 'vitest';
import type { IssueStatus } from '@ma/shared';
import {
  resolveSwimlaneDrop,
  swimlaneDroppableId,
  swimlaneLaneDroppableId,
  type SwimlaneLaneInput,
} from './kanban-swimlane-dnd';

/**
 * 泳道跨道拖拽改派纯逻辑（spec .scratch/swimlane-drag-reassign/spec.md Must 1/2/5）：
 * - 跨道 → reassign（agent/squad/未指派 null）
 * - 同道跨列 → status；同道同列 → none
 * - 落到卡片 → 该卡所在道 + 该卡状态；over 为空/未知 → none
 */

const LANES: SwimlaneLaneInput[] = [
  {
    key: 'agent:agt-a',
    kind: 'agent',
    agentId: 'agt-a',
    issues: [
      { id: 'iss-1', status: 'todo' },
      { id: 'iss-2', status: 'in_progress' },
      { id: 'iss-6', status: 'todo' },
    ],
  },
  {
    key: 'agent:agt-b',
    kind: 'agent',
    agentId: 'agt-b',
    issues: [{ id: 'iss-3', status: 'done' }],
  },
  {
    key: 'squad:sqd-1',
    kind: 'squad',
    squadId: 'sqd-1',
    issues: [{ id: 'iss-4', status: 'todo' }],
  },
  {
    key: 'unassigned',
    kind: 'unassigned',
    issues: [{ id: 'iss-5', status: 'backlog' }],
  },
];

describe('resolveSwimlaneDrop', () => {
  it('跨道拖到 agent 道列 → reassign agent + 目标列状态', () => {
    expect(
      resolveSwimlaneDrop('iss-1', swimlaneDroppableId('agent:agt-b', 'in_progress'), LANES),
    ).toEqual({
      kind: 'reassign',
      assigneeType: 'agent',
      assigneeId: 'agt-b',
      status: 'in_progress',
    });
  });

  it('跨道拖到 squad 道列 → reassign squad', () => {
    expect(
      resolveSwimlaneDrop('iss-1', swimlaneDroppableId('squad:sqd-1', 'todo'), LANES),
    ).toEqual({
      kind: 'reassign',
      assigneeType: 'squad',
      assigneeId: 'sqd-1',
      status: 'todo',
    });
  });

  it('跨道拖到未指派道列 → reassign null/null（清空指派）', () => {
    expect(
      resolveSwimlaneDrop('iss-1', swimlaneDroppableId('unassigned', 'backlog'), LANES),
    ).toEqual({
      kind: 'reassign',
      assigneeType: null,
      assigneeId: null,
      status: 'backlog',
    });
  });

  it('同道跨列 → status 变更；同道同列 → none', () => {
    expect(resolveSwimlaneDrop('iss-1', swimlaneDroppableId('agent:agt-a', 'done'), LANES)).toEqual({
      kind: 'status',
      status: 'done',
    });
    expect(resolveSwimlaneDrop('iss-1', swimlaneDroppableId('agent:agt-a', 'todo'), LANES)).toEqual({
      kind: 'none',
    });
  });

  it('落到目标道卡片上 → 该卡所在道 + 该卡状态（useSortable 卡片也是 droppable）', () => {
    // iss-1（agt-a todo）拖到 iss-3（agt-b done）上 → 改派 agt-b + done
    expect(resolveSwimlaneDrop('iss-1', 'iss-3', LANES)).toEqual({
      kind: 'reassign',
      assigneeType: 'agent',
      assigneeId: 'agt-b',
      status: 'done',
    });
    // 落到同道其它列的卡片（iss-2 in_progress）→ 同道跨列 status
    expect(resolveSwimlaneDrop('iss-1', 'iss-2', LANES)).toEqual({
      kind: 'status',
      status: 'in_progress',
    });
    // 落到同道同列的卡片（iss-6 todo）→ none
    expect(resolveSwimlaneDrop('iss-1', 'iss-6', LANES)).toEqual({ kind: 'none' });
  });

  it('over 为空 / 未知 id / active 不在任何道 → none', () => {
    expect(resolveSwimlaneDrop('iss-1', null, LANES)).toEqual({ kind: 'none' });
    expect(resolveSwimlaneDrop('iss-1', 'unknown-droppable', LANES)).toEqual({ kind: 'none' });
    expect(
      resolveSwimlaneDrop('iss-ghost', swimlaneDroppableId('agent:agt-b', 'todo'), LANES),
    ).toEqual({ kind: 'none' });
  });

  it('laneKey 含冒号（agent:<id>）时 droppable id 从右解析不串道', () => {
    // 故意用与前缀同形的 id：swimlane:agent:agt-b:todo 只能解析为 lane=agent:agt-b, status=todo
    expect(resolveSwimlaneDrop('iss-1', 'swimlane:agent:agt-b:todo', LANES)).toEqual({
      kind: 'reassign',
      assigneeType: 'agent',
      assigneeId: 'agt-b',
      status: 'todo' as IssueStatus,
    });
  });

  it('空道两段 drop zone（swimlane:<laneKey>）→ 改派并保持源卡状态', () => {
    expect(resolveSwimlaneDrop('iss-1', swimlaneLaneDroppableId('agent:agt-b'), LANES)).toEqual({
      kind: 'reassign',
      assigneeType: 'agent',
      assigneeId: 'agt-b',
      status: 'todo' as IssueStatus,
    });
    expect(resolveSwimlaneDrop('iss-1', swimlaneLaneDroppableId('squad:sqd-1'), LANES)).toEqual({
      kind: 'reassign',
      assigneeType: 'squad',
      assigneeId: 'sqd-1',
      status: 'todo' as IssueStatus,
    });
  });
});
