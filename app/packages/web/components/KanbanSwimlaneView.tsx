'use client';

import React, { useMemo } from 'react';
import {
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import type {
  AgentReadiness,
  AgentSummary,
  Issue,
  IssueStatus,
  SquadSummary,
} from '@ma/shared';
import { COLUMNS } from './KanbanBoard.shared';
import { KanbanColumn } from './KanbanColumn';
import { Icon } from './Icon';
import {
  SWIMLANE_DROPPABLE_PREFIX,
  resolveSwimlaneDrop,
  swimlaneLaneDroppableId,
} from '@/lib/kanban-swimlane-dnd';

/**
 * 看板泳道视图（学 Multica swimlane 分道形态）：
 * - 按 assignee 分组：agent 道（名字典序）→ squad 道（名字典序）→「未指派」道殿后
 * - 道头：agent 名 + readiness chip / 小队名 + 小队 icon + 计数
 * - 道体横向滚动的状态子列（复用 COLUMNS + KanbanColumn；空列隐藏）
 * - 单层 DndContext 包全部道：跨道拖拽改派 / 同道跨列状态变更
 *   （纯逻辑在 lib/kanban-swimlane-dnd.ts resolveSwimlaneDrop；mutation 在 KanbanBoard 接线）
 * - Out：道内排序 / 折叠 / 排序配置（见 .scratch/swimlane-drag-reassign/spec.md）
 */
export interface KanbanSwimlaneViewProps {
  /** 已应用全部筛选（q/status/scope/label/project/failed…）的可见 issue */
  issues: Issue[];
  agents: AgentSummary[];
  squads: SquadSummary[];
  readinessByAgentId: Record<string, AgentReadiness | null>;
  /** issueId → agentId（squad 已解析为 leader；卡片 readiness 用） */
  assigneeAgentByIssueId: Record<string, string | undefined>;
  failedIssueIds?: Set<string>;
  activeIssueIds?: Set<string>;
  waitingIssueIds?: Set<string>;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, checked: boolean) => void;
  getDetailHref?: (issue: Issue) => string;
  onOpenDetail?: (issueId: string, e?: React.MouseEvent) => void;
  onQuickCreate?: (status: IssueStatus) => void;
  /** 同道跨列状态变更（KanbanBoard 接线到既有批量状态变更路径） */
  onStatusChange?: (issueId: string, status: IssueStatus) => void;
  /**
   * 跨道改派：assignee 变更（bulk-assign，服务端 target preflight/skip 语义）+ 目标列状态；
   * preflight 失败由接线方回滚 + toast，卡片不动。
   */
  onReassign?: (
    issueId: string,
    target: { assigneeType: 'agent' | 'squad' | null; assigneeId: string | null },
    status: IssueStatus,
  ) => void;
}

interface Lane {
  key: string;
  kind: 'agent' | 'squad' | 'unassigned';
  name: string;
  /** agent 道：readiness 查询键 */
  agentId?: string;
  /** squad 道：改派目标 */
  squadId?: string;
  issues: Issue[];
}

/** readiness → 道头 chip 语气（与 IssueCard readinessTone 同语义） */
function readinessChip(
  rd: AgentReadiness | null | undefined,
): { tone: 'ok' | 'warn' | 'bad' | 'idle'; label: string } {
  if (!rd) return { tone: 'idle', label: '就绪未知' };
  switch (rd.status) {
    case 'ready':
      return { tone: 'ok', label: '就绪' };
    case 'busy':
      return { tone: 'warn', label: '忙碌' };
    case 'archived':
      return { tone: 'bad', label: '已归档' };
    case 'runtime_missing':
      return { tone: 'bad', label: 'runtime 缺失' };
    case 'cwd_missing':
      return { tone: 'bad', label: 'cwd 未配置' };
    default:
      return { tone: 'bad', label: '异常' };
  }
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export function KanbanSwimlaneView({
  issues,
  agents,
  squads,
  readinessByAgentId,
  assigneeAgentByIssueId,
  failedIssueIds,
  activeIssueIds,
  waitingIssueIds,
  selectedIds,
  onToggleSelect,
  getDetailHref,
  onOpenDetail,
  onQuickCreate,
  onStatusChange,
  onReassign,
}: KanbanSwimlaneViewProps) {
  // 与看板同款指针传感器：按 5px 距离激活（与点击/多选框不冲突）
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const lanes = useMemo<Lane[]>(() => {
    const agentName = new Map(agents.map((a) => [a.id, a.name] as const));
    const squadName = new Map(squads.map((s) => [s.id, s.name] as const));
    // 归档 agent/小队不在 useAgents()/useSquads()（active）列表里 → 退回 issue.assignee.label
    const agentLabelFallback = new Map<string, string>();
    const squadLabelFallback = new Map<string, string>();
    const byKey = new Map<string, Lane>();
    const ensureLane = (
      key: string,
      kind: Lane['kind'],
      name: string,
      ids?: { agentId?: string; squadId?: string },
    ): Lane => {
      let lane = byKey.get(key);
      if (!lane) {
        lane = { key, kind, name, agentId: ids?.agentId, squadId: ids?.squadId, issues: [] };
        byKey.set(key, lane);
      }
      return lane;
    };

    for (const iss of issues) {
      const a = iss.assignee;
      if (a?.type === 'agent') {
        if (a.label) agentLabelFallback.set(a.id, a.label);
        ensureLane(
          `agent:${a.id}`,
          'agent',
          agentName.get(a.id) ?? agentLabelFallback.get(a.id) ?? `agent:${shortId(a.id)}`,
          { agentId: a.id },
        ).issues.push(iss);
      } else if (a?.type === 'squad') {
        if (a.label) squadLabelFallback.set(a.id, a.label);
        ensureLane(
          `squad:${a.id}`,
          'squad',
          squadName.get(a.id) ?? squadLabelFallback.get(a.id) ?? `squad:${shortId(a.id)}`,
          { squadId: a.id },
        ).issues.push(iss);
      } else {
        ensureLane('unassigned', 'unassigned', '未指派').issues.push(iss);
      }
    }

    // 空道兜底：跨道改派的核心场景是把工作分给当前没活的人（ensureLane 幂等，
    // 已有道不覆盖——归档 agent 的 label fallback 名优先于 active 列表名）
    for (const a of agents) {
      ensureLane(`agent:${a.id}`, 'agent', agentName.get(a.id) ?? `agent:${shortId(a.id)}`, {
        agentId: a.id,
      });
    }
    for (const s of squads) {
      ensureLane(`squad:${s.id}`, 'squad', squadName.get(s.id) ?? `squad:${shortId(s.id)}`, {
        squadId: s.id,
      });
    }
    ensureLane('unassigned', 'unassigned', '未指派');

    const all = [...byKey.values()];
    const agentLanes = all
      .filter((l) => l.kind === 'agent')
      .sort((x, y) => x.name.localeCompare(y.name));
    const squadLanes = all
      .filter((l) => l.kind === 'squad')
      .sort((x, y) => x.name.localeCompare(y.name));
    const unassigned = all.filter((l) => l.kind === 'unassigned');
    return [...agentLanes, ...squadLanes, ...unassigned];
  }, [issues, agents, squads]);

  // 泳道无排序语义：只区分跨道改派 / 同道状态变更 / 同道同列无操作（纯函数可测）
  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const result = resolveSwimlaneDrop(
      activeId,
      overId,
      lanes.map((l) => ({
        key: l.key,
        kind: l.kind,
        agentId: l.agentId,
        squadId: l.squadId,
        issues: l.issues.map((i) => ({ id: i.id, status: i.status })),
      })),
    );
    if (result.kind === 'none') return;
    if (result.kind === 'status') {
      onStatusChange?.(activeId, result.status);
      return;
    }
    onReassign?.(
      activeId,
      { assigneeType: result.assigneeType, assigneeId: result.assigneeId },
      result.status,
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      // 拖拽中空道 zone / 空列才挂载，必须实时测量新 droppable 的矩形
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragEnd={handleDragEnd}
    >
      <div
        className="kanban-swimlanes"
        data-testid="kanban-swimlanes"
        data-lane-count={lanes.length}
      >
        {lanes.map((lane) => {
          const chip = lane.agentId ? readinessChip(readinessByAgentId[lane.agentId]) : null;
          // 空列隐藏：道内只渲染 count>0 的状态列（?status= 聚焦时数据源已滤，自然只剩该列）
          const statusGroups = COLUMNS.map((col) => ({
            col,
            list: lane.issues.filter((i) => i.status === col.status),
          })).filter((g) => g.list.length > 0);
          return (
            <section
              key={lane.key}
              className="kanban-swimlane"
              data-testid="kanban-swimlane"
              data-lane-key={lane.key}
              data-lane-kind={lane.kind}
              data-count={lane.issues.length}
            >
              <header className="kanban-swimlane-header">
                {lane.kind === 'squad' ? (
                  <Icon name="squad" size={14} className="kanban-swimlane-squad-icon" />
                ) : null}
                <strong className="kanban-swimlane-title" title={lane.name}>
                  {lane.name}
                </strong>
                {chip ? (
                  <span
                    className={`kanban-swimlane-ready kanban-swimlane-ready--${chip.tone}`}
                    data-testid="kanban-swimlane-ready"
                    data-tone={chip.tone}
                  >
                    {chip.label}
                  </span>
                ) : null}
                <span
                  className="kanban-swimlane-count"
                  data-testid="kanban-swimlane-count"
                >
                  {lane.issues.length}
                </span>
              </header>
              <div className="kanban-swimlane-body" data-testid="kanban-swimlane-body">
                {statusGroups.map(({ col, list }) => (
                  <KanbanColumn
                    key={col.status}
                    title={col.title}
                    status={col.status}
                    color={col.color}
                    // droppable id = swimlane:<laneKey>:<status>（单层 DndContext 跨道不冲突）
                    droppableIdPrefix={`${SWIMLANE_DROPPABLE_PREFIX}:${lane.key}`}
                    issues={list}
                    readinessByAgentId={readinessByAgentId}
                    failedIssueIds={failedIssueIds}
                    activeIssueIds={activeIssueIds}
                    waitingIssueIds={waitingIssueIds}
                    assigneeAgentByIssueId={assigneeAgentByIssueId}
                    selectedIds={selectedIds}
                    onToggleSelect={onToggleSelect}
                    getDetailHref={getDetailHref}
                    onOpenDetail={onOpenDetail}
                    onQuickCreate={onQuickCreate}
                  />
                ))}
                {statusGroups.length === 0 ? (
                  <EmptyLaneDropZone laneKey={lane.key} />
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </DndContext>
  );
}

/** 空道整道 drop zone：跨道改派的核心场景是把工作分给当前没活的人（空列隐藏后道内无 droppable，需兜底）。
 *  id 用独立 `swimlane-empty:` 前缀——laneKey 自含冒号，复用三段形态会被从右误解析。 */
function EmptyLaneDropZone({ laneKey }: { laneKey: string }) {
  const zoneId = swimlaneLaneDroppableId(laneKey);
  const { setNodeRef, isOver } = useDroppable({ id: zoneId });
  return (
    <div
      ref={setNodeRef}
      className={`kanban-swimlane-dropzone${isOver ? ' is-over' : ''}`}
      data-testid="kanban-swimlane-dropzone"
      data-droppable-id={zoneId}
    >
      拖卡到此处改派
    </div>
  );
}
