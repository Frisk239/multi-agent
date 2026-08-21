import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AgentReadiness, Issue } from '@ma/shared';

/**
 * 泳道视图组件测试（spec .scratch/kanban-swimlane-view/spec.md Must 5 +
 * .scratch/swimlane-drag-reassign/spec.md Must 2/5）
 * - agent 分组与计数（名字典序）
 * - squad 道 / 未指派道（未指派殿后；归档小队查不到名 → squad:<id8>）
 * - 空列隐藏
 * - readiness chip 渲染
 * - 卡片点击开详情（onOpenDetail 透传给道内列）
 * - 拖拽语义（DragEndEvent 手工构造 → 直接调 DndContext 捕获的 onDragEnd）：
 *   跨道 → onReassign；同道跨列 → onStatusChange；同道同列/over 空 → 无操作
 * 依赖：KanbanColumn / @dnd-kit/core mock（DndContext 捕获 props 供事件注入）。
 */

const dndContextProps: Array<{
  onDragEnd?: (event: { active: { id: unknown }; over: { id: unknown } | null }) => void;
}> = [];

vi.mock('@dnd-kit/core', () => ({
  DndContext: (props: {
    children: React.ReactNode;
    onDragEnd?: (event: unknown) => void;
  }) => {
    dndContextProps.push(props);
    return <div>{props.children}</div>;
  },
  PointerSensor: function PointerSensor() {
    return null;
  },
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
  closestCorners: (v: unknown) => v,
  MeasuringStrategy: { Always: 0, BeforeDragging: 1, WhileDragging: 2 },
  // 空道 drop zone（swimlane-drag-reassign）使用 useDroppable
  useDroppable: () => ({ setNodeRef: () => undefined, isOver: false }),
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./KanbanColumn', () => ({
  KanbanColumn: (props: {
    status: string;
    issues: Array<{ id: string; identifier: string }>;
    onOpenDetail?: (id: string) => void;
    getDetailHref?: (i: { id: string }) => string;
  }) => (
    <div
      data-testid="kanban-swimlane-col"
      data-status={props.status}
      data-count={props.issues.length}
    >
      {props.issues.map((i) => i.identifier).join(',')}
      {props.issues[0] ? (
        <button
          type="button"
          data-testid={`swimlane-col-open-${props.status}`}
          onClick={() => props.onOpenDetail?.(props.issues[0].id)}
        >
          open
        </button>
      ) : null}
      {props.issues[0] ? (
        <span data-testid={`swimlane-col-href-${props.status}`}>
          {props.getDetailHref?.(props.issues[0]) ?? ''}
        </span>
      ) : null}
    </div>
  ),
}));

import { KanbanSwimlaneView } from './KanbanSwimlaneView';
import { parseViewMode } from './KanbanBoard.shared';
import type { AgentSummary, SquadSummary } from '@ma/shared';

function makeIssue(
  id: string,
  over: Partial<Issue> = {},
): Issue {
  return {
    id,
    workspaceId: 'ws-1',
    identifier: `FRI-${id}`,
    title: `标题 ${id}`,
    description: null,
    status: 'todo',
    priority: 'none',
    assignee: null,
    creatorType: 'member',
    creatorId: 'usr-1',
    position: 0,
    labels: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as Issue;
}

function makeReadiness(
  agentId: string,
  status: AgentReadiness['status'],
): AgentReadiness {
  return {
    agentId,
    runtime: 'claude-code',
    runtimeInstalled: true,
    runtimePath: null,
    runtimeVersion: null,
    concurrency: 1,
    runningCount: 0,
    slotsAvailable: 1,
    cwdConfigured: true,
    status,
    detail: null,
  } as AgentReadiness;
}

const AGENTS = [
  { id: 'agt-beta', name: 'Beta', runtime: 'claude-code' },
  { id: 'agt-alpha', name: 'Alpha', runtime: 'claude-code' },
] as unknown as AgentSummary[];
const SQUADS = [{ id: 'sqd-1', name: '前端小队', leaderId: 'agt-alpha' }] as SquadSummary[];

function renderView(
  props: Partial<Parameters<typeof KanbanSwimlaneView>[0]> = {},
) {
  return render(
    <KanbanSwimlaneView
      issues={[]}
      agents={AGENTS}
      squads={SQUADS}
      readinessByAgentId={{}}
      assigneeAgentByIssueId={{}}
      {...props}
    />,
  );
}

function laneSections() {
  return screen.getAllByTestId('kanban-swimlane');
}

describe('KanbanSwimlaneView 泳道分组', () => {
  afterEach(cleanup);

  it('按 agent 分道、道名按字典序排序、计数正确', () => {
    renderView({
      issues: [
        makeIssue('1', { assignee: { type: 'agent', id: 'agt-beta', label: 'Beta' } }),
        makeIssue('2', { assignee: { type: 'agent', id: 'agt-beta', label: 'Beta' }, status: 'in_progress' }),
        makeIssue('3', { assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' } }),
      ],
    });
    const lanes = laneSections();
    // 空道兜底：agents/squads 里的 agent 都有道（squad/unassigned 空道渲染 drop zone）
    expect(lanes).toHaveLength(4);
    // Alpha 字典序在前
    expect(lanes[0].getAttribute('data-lane-key')).toBe('agent:agt-alpha');
    expect(lanes[0].getAttribute('data-lane-kind')).toBe('agent');
    expect(lanes[0].getAttribute('data-count')).toBe('1');
    expect(lanes[1].getAttribute('data-lane-key')).toBe('agent:agt-beta');
    expect(lanes[1].getAttribute('data-count')).toBe('2');
    expect(screen.getAllByTestId('kanban-swimlane-count').map((c) => c.textContent)).toEqual(['1', '2', '0', '0']);
    // 空道渲染 drop zone（跨道改派兜底）
    expect(screen.getAllByTestId('kanban-swimlane-dropzone')).toHaveLength(2);
  });

  it('squad 指派单独一道（道名=小队名），未指派道殿后', () => {
    renderView({
      issues: [
        makeIssue('1'), // 未指派
        makeIssue('2', { assignee: { type: 'squad', id: 'sqd-1', label: '前端小队' } }),
        makeIssue('3', { assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' } }),
      ],
    });
    const lanes = laneSections();
    // 空道兜底：agt-beta 无卡也有道
    expect(lanes).toHaveLength(4);
    // agent 道 → agent 空 道 → squad 道 → 未指派
    expect(lanes[0].getAttribute('data-lane-kind')).toBe('agent');
    expect(lanes[1].getAttribute('data-lane-key')).toBe('agent:agt-beta');
    expect(lanes[2].getAttribute('data-lane-key')).toBe('squad:sqd-1');
    expect(lanes[2].getAttribute('data-lane-kind')).toBe('squad');
    expect(lanes[2].textContent).toContain('前端小队');
    expect(lanes[3].getAttribute('data-lane-key')).toBe('unassigned');
    expect(lanes[3].getAttribute('data-lane-kind')).toBe('unassigned');
    expect(lanes[3].textContent).toContain('未指派');
  });

  it('归档小队查不到名时回退 squad:<id8>', () => {
    renderView({
      issues: [
        makeIssue('1', {
          assignee: { type: 'squad', id: 'sqd-archived-9999', label: '' },
        }),
      ],
    });
    const lanes = laneSections();
    // 空道兜底：AGENTS/SQUADS 的道 + 归档小队道（issues 驱动）
    expect(lanes).toHaveLength(5);
    const archived = lanes.find(
      (l) => l.getAttribute('data-lane-key') === 'squad:sqd-archived-9999',
    );
    expect(archived).toBeTruthy();
    expect(archived?.textContent).toContain('squad:sqd-arch');
  });

  it('道内只渲染 count>0 的状态列（空列隐藏）', () => {
    renderView({
      issues: [
        makeIssue('1', {
          status: 'backlog',
          assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' },
        }),
        makeIssue('2', {
          status: 'todo',
          assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' },
        }),
      ],
    });
    const cols = screen.getAllByTestId('kanban-swimlane-col');
    const statuses = cols.map((c) => c.getAttribute('data-status'));
    expect(statuses).toEqual(['backlog', 'todo']);
    // 其余 5 列（in_progress…cancelled）不渲染
    expect(statuses).not.toContain('in_progress');
    expect(cols[0].getAttribute('data-count')).toBe('1');
  });

  it('agent 道头渲染 readiness chip（ready→就绪/ok；缺失→就绪未知/idle）', () => {
    renderView({
      issues: [
        makeIssue('1', { assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' } }),
        makeIssue('2', { assignee: { type: 'agent', id: 'agt-beta', label: 'Beta' } }),
      ],
      readinessByAgentId: {
        'agt-alpha': makeReadiness('agt-alpha', 'ready'),
        'agt-beta': null,
      },
    });
    const chips = screen.getAllByTestId('kanban-swimlane-ready');
    expect(chips).toHaveLength(2);
    expect(chips[0].getAttribute('data-tone')).toBe('ok');
    expect(chips[0].textContent).toBe('就绪');
    expect(chips[1].getAttribute('data-tone')).toBe('idle');
    expect(chips[1].textContent).toBe('就绪未知');
  });

  it('squad 道与未指派道不渲染 readiness chip（agent 空道渲染）', () => {
    renderView({
      issues: [
        makeIssue('1', { assignee: { type: 'squad', id: 'sqd-1', label: '前端小队' } }),
        makeIssue('2'),
      ],
    });
    // squad/未指派道无 chip；空 agent 道有 chip（就绪状态是 agent 属性）
    const lanes = laneSections();
    for (const lane of lanes) {
      const kind = lane.getAttribute('data-lane-kind');
      const hasChip = !!lane.querySelector('[data-testid="kanban-swimlane-ready"]');
      if (kind === 'agent') {
        expect(hasChip).toBe(true);
      } else {
        expect(hasChip).toBe(false);
      }
    }
  });

  it('卡片点击开详情：onOpenDetail/getDetailHref 透传给道内列', () => {
    const onOpenDetail = vi.fn();
    const getDetailHref = vi.fn((iss: Issue) => `/?issue=${iss.id}`);
    renderView({
      issues: [
        makeIssue('7', {
          status: 'in_review',
          assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' },
        }),
      ],
      onOpenDetail,
      getDetailHref,
    });
    fireEvent.click(screen.getByTestId('swimlane-col-open-in_review'));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledWith('7');
    expect(screen.getByTestId('swimlane-col-href-in_review').textContent).toBe('/?issue=7');
    expect(getDetailHref).toHaveBeenCalled();
  });

  it('?status= 聚焦：数据源已滤时道内自然只剩该状态列', () => {
    renderView({
      // 模拟 statusQuery=todo 过滤后的 visible
      issues: [
        makeIssue('1', {
          status: 'todo',
          assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' },
        }),
        makeIssue('2', {
          status: 'todo',
          assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' },
        }),
      ],
    });
    const statuses = screen
      .getAllByTestId('kanban-swimlane-col')
      .map((c) => c.getAttribute('data-status'));
    expect(statuses).toEqual(['todo']);
  });
});

describe('KanbanSwimlaneView 泳道拖拽语义（spec swimlane-drag-reassign Must 2/5）', () => {
  afterEach(cleanup);

  /** 渲染双 agent 道 + squad 道 + 未指派道，返回捕获的 onDragEnd 与 spies */
  function renderDraggable(onStatusChange = vi.fn(), onReassign = vi.fn()) {
    dndContextProps.length = 0;
    renderView({
      issues: [
        makeIssue('1', {
          status: 'todo',
          assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' },
        }),
        makeIssue('2', {
          status: 'in_progress',
          assignee: { type: 'agent', id: 'agt-beta', label: 'Beta' },
        }),
        makeIssue('3', {
          status: 'todo',
          assignee: { type: 'squad', id: 'sqd-1', label: '前端小队' },
        }),
        makeIssue('4', { status: 'backlog' }),
      ],
      onStatusChange,
      onReassign,
    });
    const ctx = dndContextProps[dndContextProps.length - 1];
    expect(ctx?.onDragEnd).toBeTypeOf('function');
    const fire = (activeId: string, overId: string | null) =>
      ctx.onDragEnd?.({ active: { id: activeId }, over: overId === null ? null : { id: overId } });
    return { fire, onStatusChange, onReassign };
  }

  it('跨道拖到 agent 道状态列 → onReassign（agent 目标 + 目标列状态）', () => {
    const { fire, onReassign, onStatusChange } = renderDraggable();
    fire('1', 'swimlane:agent:agt-beta:in_progress');
    expect(onReassign).toHaveBeenCalledTimes(1);
    expect(onReassign).toHaveBeenCalledWith(
      '1',
      { assigneeType: 'agent', assigneeId: 'agt-beta' },
      'in_progress',
    );
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('跨道拖到 squad 道 → onReassign（squad 目标）；拖到未指派道 → null/null', () => {
    const { fire, onReassign } = renderDraggable();
    fire('1', 'swimlane:squad:sqd-1:todo');
    expect(onReassign).toHaveBeenCalledWith(
      '1',
      { assigneeType: 'squad', assigneeId: 'sqd-1' },
      'todo',
    );
    fire('1', 'swimlane:unassigned:backlog');
    expect(onReassign).toHaveBeenCalledWith(
      '1',
      { assigneeType: null, assigneeId: null },
      'backlog',
    );
    expect(onReassign).toHaveBeenCalledTimes(2);
  });

  it('同道跨列 → onStatusChange（不触发改派）；同道同列 / over 空 → 无操作', () => {
    const { fire, onReassign, onStatusChange } = renderDraggable();
    fire('1', 'swimlane:agent:agt-alpha:todo'); // 同道同列 → none
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(onReassign).not.toHaveBeenCalled();
    fire('4', 'swimlane:unassigned:backlog'); // 未指派道同列 → none
    fire('1', null); // over 空（拖出界）→ none
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(onReassign).not.toHaveBeenCalled();

    // 同道跨列：单道双列（todo → in_progress）→ status 变更
    dndContextProps.length = 0;
    const onStatusChange2 = vi.fn();
    const onReassign2 = vi.fn();
    renderView({
      issues: [
        makeIssue('1', {
          status: 'todo',
          assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' },
        }),
        makeIssue('9', {
          status: 'in_progress',
          assignee: { type: 'agent', id: 'agt-alpha', label: 'Alpha' },
        }),
      ],
      onStatusChange: onStatusChange2,
      onReassign: onReassign2,
    });
    dndContextProps[dndContextProps.length - 1].onDragEnd?.({
      active: { id: '1' },
      over: { id: 'swimlane:agent:agt-alpha:in_progress' },
    });
    expect(onStatusChange2).toHaveBeenCalledTimes(1);
    expect(onStatusChange2).toHaveBeenCalledWith('1', 'in_progress');
    expect(onReassign2).not.toHaveBeenCalled();
  });

  it('落到目标道卡片上（over=issue id）→ 改派到该卡所在道 + 该卡状态', () => {
    const { fire, onReassign } = renderDraggable();
    // iss-1（agt-alpha todo）拖到 iss-2（agt-beta in_progress）上
    fire('1', '2');
    expect(onReassign).toHaveBeenCalledWith(
      '1',
      { assigneeType: 'agent', assigneeId: 'agt-beta' },
      'in_progress',
    );
  });
});

describe('parseViewMode URL 三态', () => {
  it('list / swimlane / 缺省与非法值', () => {
    expect(parseViewMode('list')).toBe('list');
    expect(parseViewMode('swimlane')).toBe('swimlane');
    expect(parseViewMode(null)).toBe('board');
    expect(parseViewMode('')).toBe('board');
    expect(parseViewMode('garbage')).toBe('board');
  });
});
