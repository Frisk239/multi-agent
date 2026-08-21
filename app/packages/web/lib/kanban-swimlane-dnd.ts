'use client';
import type { IssueStatus } from '@ma/shared';

/**
 * 泳道跨道拖拽改派纯逻辑（学 KanbanBoard.dnd.ts 的 computeDragReorder 先例）：
 * 输入 DragEndEvent 的 activeId/overId + 泳道结构 → 输出动作对象；副作用
 * （bulk-assign / 状态变更 mutation、toast）由组件与 KanbanBoard 接线承担。
 *
 * 泳道不做同列排序（区别于看板 reorder 语义），只区分：
 * - 跨道（源 lane ≠ 目标 lane）→ 改派 + 状态 = 目标列 status
 * - 同道跨列 → 状态变更（复用 onStatusChange 既有路径）
 * - 同道同列 / 无法解析 → 无操作
 */

/** 泳道 droppable id 前缀：完整形态 `swimlane:<laneKey>:<status>`（laneKey 含 `:`，从右解析） */
export const SWIMLANE_DROPPABLE_PREFIX = 'swimlane';

export type SwimlaneLaneKind = 'agent' | 'squad' | 'unassigned';

/** 泳道 dnd 解析所需的最小道结构（KanbanSwimlaneView 的 Lane 结构兼容） */
export interface SwimlaneLaneInput {
  key: string;
  kind: SwimlaneLaneKind;
  agentId?: string;
  squadId?: string;
  issues: Array<{ id: string; status: IssueStatus }>;
}

export type SwimlaneDropResult =
  | {
      kind: 'reassign';
      assigneeType: 'agent' | 'squad' | null;
      assigneeId: string | null;
      /** 目标列状态（改派后卡片落到目标道的该状态列） */
      status: IssueStatus;
    }
  | { kind: 'status'; status: IssueStatus }
  | { kind: 'none' };

/** 泳道内状态列 droppable id（KanbanColumn droppableIdPrefix + status 拼接结果） */
export function swimlaneDroppableId(laneKey: string, status: IssueStatus): string {
  return `${SWIMLANE_DROPPABLE_PREFIX}:${laneKey}:${status}`;
}

/** 空道整道 drop zone 的 droppable id。独立前缀消歧：laneKey 必含 `:`，
 *  若复用 `swimlane:` 三段形态，两段 id 会被从右解析成 lane=<kind>/status=<id>。 */
export const SWIMLANE_EMPTY_PREFIX = 'swimlane-empty';

/** 空道整道 drop zone 的 droppable id（无 status 段：drop 后改派并保持卡片原状态） */
export function swimlaneLaneDroppableId(laneKey: string): string {
  return `${SWIMLANE_EMPTY_PREFIX}:${laneKey}`;
}

/** 解析 `swimlane:<laneKey>:<status>`（laneKey 自身含 `:` → 从右取最后一段为 status）；
 *  空道 drop zone `swimlane-empty:<laneKey>` → status=null（调用方回退源卡状态）；非该形态返回 null */
function parseSwimlaneDroppableId(
  overId: string,
): { laneKey: string; status: IssueStatus | null } | null {
  if (overId.startsWith(`${SWIMLANE_EMPTY_PREFIX}:`)) {
    return { laneKey: overId.slice(SWIMLANE_EMPTY_PREFIX.length + 1), status: null };
  }
  if (!overId.startsWith(`${SWIMLANE_DROPPABLE_PREFIX}:`)) return null;
  const rest = overId.slice(SWIMLANE_DROPPABLE_PREFIX.length + 1);
  const idx = rest.lastIndexOf(':');
  if (idx <= 0) return null;
  return { laneKey: rest.slice(0, idx), status: rest.slice(idx + 1) as IssueStatus };
}

/**
 * 解析一次泳道 drop：
 * - overId 为列 droppable（`swimlane:<laneKey>:<status>`）→ 目标 = (该道, 该状态)
 * - overId 为某卡片 issue id（useSortable 卡片也是 droppable）→ 目标 = (该卡所在道, 该卡状态)
 * - 其余（null / 未知 id）→ none
 */
export function resolveSwimlaneDrop(
  activeIssueId: string,
  overDroppableId: string | null | undefined,
  lanes: SwimlaneLaneInput[],
): SwimlaneDropResult {
  if (!overDroppableId) return { kind: 'none' };

  // 源：active 卡所在道 + 当前状态
  let sourceLane: SwimlaneLaneInput | undefined;
  let sourceStatus: IssueStatus | undefined;
  for (const lane of lanes) {
    const hit = lane.issues.find((i) => i.id === activeIssueId);
    if (hit) {
      sourceLane = lane;
      sourceStatus = hit.status;
      break;
    }
  }
  if (!sourceLane || !sourceStatus) return { kind: 'none' };

  let targetLaneKey: string;
  let targetStatus: IssueStatus;
  const column = parseSwimlaneDroppableId(overDroppableId);
  if (column) {
    targetLaneKey = column.laneKey;
    // 空道 drop zone（无 status 段）：改派并保持源卡状态
    targetStatus = column.status ?? sourceStatus;
  } else {
    // 落到卡片上：目标 = 该卡所在道 + 该卡状态
    let cardLane: SwimlaneLaneInput | undefined;
    let cardStatus: IssueStatus | undefined;
    for (const lane of lanes) {
      const hit = lane.issues.find((i) => i.id === overDroppableId);
      if (hit) {
        cardLane = lane;
        cardStatus = hit.status;
        break;
      }
    }
    if (!cardLane || !cardStatus) return { kind: 'none' };
    targetLaneKey = cardLane.key;
    targetStatus = cardStatus;
  }

  // 同道：只做状态变更；同列 = 无操作（泳道无排序语义）
  if (targetLaneKey === sourceLane.key) {
    return targetStatus === sourceStatus
      ? { kind: 'none' }
      : { kind: 'status', status: targetStatus };
  }

  // 跨道：改派到目标道 + 状态 = 目标列状态
  const targetLane = lanes.find((l) => l.key === targetLaneKey);
  if (!targetLane) return { kind: 'none' };
  switch (targetLane.kind) {
    case 'agent':
      if (!targetLane.agentId) return { kind: 'none' };
      return {
        kind: 'reassign',
        assigneeType: 'agent',
        assigneeId: targetLane.agentId,
        status: targetStatus,
      };
    case 'squad':
      if (!targetLane.squadId) return { kind: 'none' };
      return {
        kind: 'reassign',
        assigneeType: 'squad',
        assigneeId: targetLane.squadId,
        status: targetStatus,
      };
    default:
      // 未指派道：清空指派（null/null）
      return { kind: 'reassign', assigneeType: null, assigneeId: null, status: targetStatus };
  }
}
