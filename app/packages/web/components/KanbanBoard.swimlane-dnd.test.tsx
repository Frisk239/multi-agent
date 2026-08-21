import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Issue } from '@ma/shared';

/**
 * 泳道跨道拖拽 · KanbanBoard 接线测试（spec .scratch/swimlane-drag-reassign/spec.md Must 5）
 * - 跨道拖拽 → useBulkUpdateIssueAssignee 参数断言（issueIds:[id] + assigneeType/Id）
 *   且成功后补目标列状态变更（状态相同则跳过）
 * - 未指派道 drop → assigneeType/assigneeId = null/null
 * - preflight 失败（bulk-assign reject）→ 不触发状态变更（卡片不动，回滚由 hook 承担）
 * - 同道同列 → 无任何 mutation
 * 渲染真实 KanbanSwimlaneView（KanbanColumn mock）+ 捕获 DndContext props 注入 DragEndEvent。
 */

const push = vi.fn();
const replace = vi.fn();
const refetch = vi.fn();

const { bulkAssignMutate, bulkStatusMutate } = vi.hoisted(() => ({
  bulkAssignMutate: vi.fn(),
  bulkStatusMutate: vi.fn(),
}));

const dndContextProps: Array<{
  onDragEnd?: (event: {
    active: { id: unknown };
    over: { id: unknown } | null;
  }) => void;
}> = [];

let mockSearchParams = new URLSearchParams('view=swimlane');
let issuesState: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: typeof refetch;
} = { data: { data: [] }, isLoading: false, isError: false, error: null, refetch };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/',
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: (props: {
    children: React.ReactNode;
    onDragEnd?: (event: unknown) => void;
  }) => {
    dndContextProps.push(props);
    return <div>{props.children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCorners: (v: unknown) => v,
  MeasuringStrategy: { Always: 0, BeforeDragging: 1, WhileDragging: 2 },
  PointerSensor: function PointerSensor() {
    return null;
  },
  KeyboardSensor: function KeyboardSensor() {
    return null;
  },
  KeyboardCode: {},
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
}));

vi.mock('@/lib/density', () => ({
  useDensity: () => ({ density: 'comfortable', setDensity: vi.fn() }),
}));

vi.mock('@/lib/confirm-store', () => ({
  confirmDialog: vi.fn(async () => true),
}));

vi.mock('./KanbanColumn', () => ({
  KanbanColumn: (props: { status: string; issues: Array<{ id: string }> }) => (
    <div data-testid="mock-column" data-status={props.status} data-count={props.issues.length} />
  ),
}));
vi.mock('./IssueCard', () => ({
  IssueCard: () => <div data-testid="mock-card" />,
}));
vi.mock('./IssueListView', () => ({
  IssueListView: () => <div data-testid="mock-list" />,
}));
vi.mock('./IssueSideSheet', () => ({
  IssueSideSheet: () => null,
  buildIssueSheetHref: () => '/',
  withIssueSearchParam: (sp: URLSearchParams) => sp,
}));
vi.mock('./NewIssueForm', () => ({
  NewIssueForm: () => <button type="button">新建 Issue</button>,
}));
vi.mock('./EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock('./Skeleton', () => ({
  PageSkeleton: () => <div data-testid="page-skeleton">loading</div>,
}));
vi.mock('./AgentsWorkingBanner', () => ({
  AgentsWorkingBanner: () => null,
}));
vi.mock('./Select', () => ({
  Select: ({
    children,
    ...rest
  }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...rest}>{children}</select>
  ),
}));

vi.mock('@/lib/api', () => ({
  useIssues: () => issuesState,
  useAgents: () => ({ data: [] }),
  useSquads: () => ({ data: [] }),
  useProjects: () => ({ data: [] }),
  useLabels: () => ({ data: [] }),
  useAgentsReadinessMap: () => ({ data: {} }),
  useWorkspaceRuns: () => ({ data: [] }),
  useReorderIssues: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateIssue: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkUpdateIssueStatus: () => ({ mutate: bulkStatusMutate, isPending: false }),
  useBulkUpdateIssueAssignee: () => ({ mutate: bulkAssignMutate, isPending: false }),
  useBulkDeleteIssues: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { KanbanBoard } from './KanbanBoard';

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

/** 夹具：agent-a 1 卡（todo）、agent-b 1 卡（in_progress）、未指派 1 卡（backlog） */
const FIXTURE: Issue[] = [
  makeIssue('iss-1', {
    assignee: { type: 'agent', id: 'agt-a', label: 'AgentA' },
  }),
  makeIssue('iss-2', {
    status: 'in_progress',
    assignee: { type: 'agent', id: 'agt-b', label: 'AgentB' },
  }),
  makeIssue('iss-3', { status: 'backlog' }),
];

function fireDragEnd(activeId: string, overId: string | null) {
  const ctx = dndContextProps[dndContextProps.length - 1];
  expect(ctx?.onDragEnd).toBeTypeOf('function');
  ctx.onDragEnd?.({
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  });
}

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <KanbanBoard />
    </QueryClientProvider>,
  );
}

describe('KanbanBoard 泳道拖拽接线（swimlane-drag-reassign Must 5）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('view=swimlane');
    dndContextProps.length = 0;
    issuesState = {
      data: { data: FIXTURE },
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    };
    // 默认实现：记录 opts 供测试触发 onSuccess/onError
    bulkAssignMutate.mockImplementation(() => undefined);
    bulkStatusMutate.mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('泳道视图渲染真实泳道（3 道）且 DndContext 捕获 onDragEnd', () => {
    renderBoard();
    expect(screen.getByTestId('kanban-board').getAttribute('data-view')).toBe('swimlane');
    const lanes = screen.getAllByTestId('kanban-swimlane');
    expect(lanes).toHaveLength(3);
    expect(lanes.map((l) => l.getAttribute('data-lane-key'))).toEqual([
      'agent:agt-a',
      'agent:agt-b',
      'unassigned',
    ]);
  });

  it('跨道拖拽 → bulk-assign 参数断言；成功后补目标列状态变更', () => {
    renderBoard();
    // iss-1（agt-a todo）→ agt-b 道的 in_progress 列
    fireDragEnd('iss-1', 'swimlane:agent:agt-b:in_progress');
    expect(bulkAssignMutate).toHaveBeenCalledTimes(1);
    const [vars, opts] = bulkAssignMutate.mock.calls[0];
    expect(vars).toEqual({
      issueIds: ['iss-1'],
      assigneeType: 'agent',
      assigneeId: 'agt-b',
    });
    expect(opts).toBeTypeOf('object');
    expect(bulkStatusMutate).not.toHaveBeenCalled();
    // 改派成功 → 状态不同 → 补状态变更
    (opts as { onSuccess: () => void }).onSuccess();
    expect(bulkStatusMutate).toHaveBeenCalledTimes(1);
    expect(bulkStatusMutate).toHaveBeenCalledWith({
      issueIds: ['iss-1'],
      status: 'in_progress',
    });
  });

  it('跨道拖拽目标列状态与当前相同 → 只改派不重复发状态变更', () => {
    renderBoard();
    // iss-2（agt-b，in_progress）拖到 agt-a 道的 in_progress 列：跨道改派但状态不变
    fireDragEnd('iss-2', 'swimlane:agent:agt-a:in_progress');
    expect(bulkAssignMutate).toHaveBeenCalledWith(
      { issueIds: ['iss-2'], assigneeType: 'agent', assigneeId: 'agt-a' },
      expect.anything(),
    );
    const opts = bulkAssignMutate.mock.calls[0][1] as { onSuccess: () => void };
    opts.onSuccess();
    // iss-2 本就 in_progress → 状态相同 → 跳过
    expect(bulkStatusMutate).not.toHaveBeenCalled();
  });

  it('未指派道 drop → bulk-assign null/null', () => {
    renderBoard();
    fireDragEnd('iss-1', 'swimlane:unassigned:backlog');
    expect(bulkAssignMutate).toHaveBeenCalledTimes(1);
    expect(bulkAssignMutate).toHaveBeenCalledWith(
      { issueIds: ['iss-1'], assigneeType: null, assigneeId: null },
      expect.anything(),
    );
  });

  it('preflight 失败（bulk-assign reject）→ 不触发状态变更（卡片不动）', () => {
    renderBoard();
    fireDragEnd('iss-1', 'swimlane:agent:agt-b:in_progress');
    expect(bulkAssignMutate).toHaveBeenCalledTimes(1);
    // 接线只在 bulk-assign 的 onSuccess 链状态变更；服务端 target preflight 拒绝时
    // mutation reject → onSuccess 不执行（hook 全局 onError 回滚 + toastError），状态不动
    const opts = bulkAssignMutate.mock.calls[0][1] as { onSuccess?: () => void };
    expect(opts.onSuccess).toBeTypeOf('function');
    expect(bulkStatusMutate).not.toHaveBeenCalled();
  });

  it('同道同列 drop → 无任何 mutation', () => {
    renderBoard();
    fireDragEnd('iss-1', 'swimlane:agent:agt-a:todo');
    expect(bulkAssignMutate).not.toHaveBeenCalled();
    expect(bulkStatusMutate).not.toHaveBeenCalled();
  });
});
