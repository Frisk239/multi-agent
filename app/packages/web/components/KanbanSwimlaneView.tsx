'use client';

import React, { useMemo } from 'react';
import { DndContext, useSensors } from '@dnd-kit/core';
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

/**
 * 看板泳道视图（薄版，学 Multica swimlane 分道形态）：
 * - 按 assignee 分组：agent 道（名字典序）→ squad 道（名字典序）→「未指派」道殿后
 * - 道头：agent 名 + readiness chip / 小队名 + 小队 icon + 计数
 * - 道体横向滚动的状态子列（复用 COLUMNS + KanbanColumn；空列隐藏）
 * - 薄版 Out：跨道拖拽改派 / 折叠 / 排序配置（见 .scratch/kanban-swimlane-view/spec.md）
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
}

interface Lane {
  key: string;
  kind: 'agent' | 'squad' | 'unassigned';
  name: string;
  /** agent 道：readiness 查询键 */
  agentId?: string;
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
}: KanbanSwimlaneViewProps) {
  // 薄版不做拖拽：无传感器（DndContext 仅为 KanbanColumn/IssueCard 的 dnd hooks 提供宿主）
  const emptySensors = useSensors();

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
      agentId?: string,
    ): Lane => {
      let lane = byKey.get(key);
      if (!lane) {
        lane = { key, kind, name, agentId, issues: [] };
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
          a.id,
        ).issues.push(iss);
      } else if (a?.type === 'squad') {
        if (a.label) squadLabelFallback.set(a.id, a.label);
        ensureLane(
          `squad:${a.id}`,
          'squad',
          squadName.get(a.id) ?? squadLabelFallback.get(a.id) ?? `squad:${shortId(a.id)}`,
        ).issues.push(iss);
      } else {
        ensureLane('unassigned', 'unassigned', '未指派').issues.push(iss);
      }
    }

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

  return (
    <div className="kanban-swimlanes" data-testid="kanban-swimlanes" data-lane-count={lanes.length}>
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
            {/* 每道独立 DndContext：无传感器禁拖；同 status 列跨道不共用注册表 */}
            <DndContext sensors={emptySensors} onDragEnd={() => { /* 薄版：跨道拖拽改派 Out */ }}>
              <div className="kanban-swimlane-body" data-testid="kanban-swimlane-body">
                {statusGroups.map(({ col, list }) => (
                  <KanbanColumn
                    key={col.status}
                    title={col.title}
                    status={col.status}
                    color={col.color}
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
              </div>
            </DndContext>
          </section>
        );
      })}
    </div>
  );
}
