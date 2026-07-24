'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { IssueStatus, Priority } from '@ma/shared';
import { IssueStatus as IssueStatusEnum, Priority as PriorityEnum } from '@ma/shared';
import {
  useAgents,
  useAgentsReadinessMap,
  useIssues,
  useLabels,
  useProjects,
  useReorderIssues,
  useSquads,
  useUpdateIssue,
  useWorkspaceRuns,
} from '@/lib/api';
import { KanbanColumn } from './KanbanColumn';
import { IssueCard } from './IssueCard';
import { NewIssueForm } from './NewIssueForm';
import { EmptyState } from './EmptyState';
import { AgentsWorkingBanner } from './AgentsWorkingBanner';

const PRIORITY_OPTIONS: { value: '' | Priority; label: string }[] = [
  { value: '', label: '全部优先级' },
  { value: 'urgent', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
  { value: 'none', label: '无' },
];

// Multica 真站 7 列：backlog…cancelled（STATUS_ORDER）
// G5：展示名对齐 Multica 中文产品列；status 枚举不变
const COLUMNS: { title: string; status: IssueStatus; color: string }[] = [
  { title: '待规划', status: 'backlog', color: 'var(--status-backlog)' },
  { title: '待办', status: 'todo', color: 'var(--status-todo)' },
  { title: '进行中', status: 'in_progress', color: 'var(--status-in-progress)' },
  { title: '审核中', status: 'in_review', color: 'var(--status-in-review)' },
  { title: '已完成', status: 'done', color: 'var(--status-done)' },
  { title: '已阻塞', status: 'blocked', color: 'var(--status-blocked)' },
  { title: '已取消', status: 'cancelled', color: 'var(--status-cancelled)' },
];

/** URL `assignee=` → IssuesQuery 字段 */
function parseAssigneeParam(raw: string | null): {
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

function KanbanBoardInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const labelFilter = searchParams.get('label') ?? '';
  const qFromUrl = searchParams.get('q') ?? '';
  const assigneeFromUrl = searchParams.get('assignee') ?? '';
  const priorityFromUrl = searchParams.get('priority') ?? '';
  const originFromUrl = searchParams.get('origin') ?? '';
  const projectFromUrl = searchParams.get('project') ?? '';
  // URL 可分享：?failed=1 仅显示最近有 failed run 的 issue
  const failedOnly = searchParams.get('failed') === '1';
  // URL 可分享：?status= 仅显示该列
  const statusFromUrl = searchParams.get('status') ?? '';
  // P2-A：?view=list|board（默认看板）
  const viewMode = searchParams.get('view') === 'list' ? 'list' : 'board';
  // DS2：列表 sort=manual|updated（默认 manual 与看板一致）
  const sortMode =
    searchParams.get('sort') === 'updated' ? 'updated' : 'manual';
  const [qDraft, setQDraft] = useState(qFromUrl);
  // Multica 真站顶栏更疏：默认只露主筛选；运维向筛选放进「更多」
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const { data: projects = [] } = useProjects();
  const agentIds = useMemo(() => agents.map((a) => a.id), [agents]);
  const { data: readinessMap = {} } = useAgentsReadinessMap(agentIds);
  // 轻量：最近失败 run，用于卡片「失败」标记与「仅失败」筛选（limit 内即可）
  const { data: failedRuns = [] } = useWorkspaceRuns({ status: 'failed', limit: 80 });
  // 轻量：活跃 run → 卡片「运行中」脉冲
  const { data: runningRuns = [] } = useWorkspaceRuns({ status: 'running', limit: 40 });
  const { data: queuedRuns = [] } = useWorkspaceRuns({ status: 'queued', limit: 40 });

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  // 输入防抖后写 URL，再由 URL 驱动服务端 query
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = qDraft.trim();
      if (next === qFromUrl.trim()) return;
      const sp = new URLSearchParams(searchParams.toString());
      if (next) sp.set('q', next);
      else sp.delete('q');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 250);
    return () => window.clearTimeout(t);
  }, [qDraft, qFromUrl, pathname, router, searchParams]);

  const setLabelFilter = useCallback(
    (id: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (id) sp.set('label', id);
      else sp.delete('label');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setAssigneeFilter = useCallback(
    (value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) sp.set('assignee', value);
      else sp.delete('assignee');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setPriorityFilter = useCallback(
    (value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) sp.set('priority', value);
      else sp.delete('priority');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setViewMode = useCallback(
    (mode: 'board' | 'list') => {
      const sp = new URLSearchParams(searchParams.toString());
      if (mode === 'list') sp.set('view', 'list');
      else {
        sp.delete('view');
        // 看板固定 manual 序；离开列表时清 sort 参数
        sp.delete('sort');
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setSortMode = useCallback(
    (mode: 'manual' | 'updated') => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set('view', 'list');
      if (mode === 'updated') sp.set('sort', 'updated');
      else sp.delete('sort');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setFailedOnly = useCallback(
    (on: boolean) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (on) sp.set('failed', '1');
      else sp.delete('failed');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setOriginFilter = useCallback(
    (value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value === 'automation' || value === 'quick_create') sp.set('origin', value);
      else sp.delete('origin');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setProjectFilter = useCallback(
    (value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value) sp.set('project', value);
      else sp.delete('project');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setStatusFilter = useCallback(
    (value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value && (IssueStatusEnum.options as string[]).includes(value)) {
        sp.set('status', value);
      } else {
        sp.delete('status');
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const assigneeQuery = useMemo(
    () => parseAssigneeParam(assigneeFromUrl || null),
    [assigneeFromUrl],
  );

  const priorityQuery = useMemo(() => {
    if (!priorityFromUrl) return undefined;
    const ok = (PriorityEnum.options as string[]).includes(priorityFromUrl);
    return ok ? (priorityFromUrl as Priority) : undefined;
  }, [priorityFromUrl]);

  const originQuery =
    originFromUrl === 'automation' || originFromUrl === 'quick_create'
      ? originFromUrl
      : undefined;

  const { data: issues, isLoading } = useIssues({
    q: qFromUrl || undefined,
    labelId: labelFilter || undefined,
    priority: priorityQuery,
    originType: originQuery,
    projectId: projectFromUrl || undefined,
    sort: viewMode === 'list' && sortMode === 'updated' ? 'updated' : undefined,
    ...assigneeQuery,
  });
  const { data: labels } = useLabels();
  const reorder = useReorderIssues();
  const [dragId, setDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const squadLeaderById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of squads) {
      if (s.leaderId) m.set(s.id, s.leaderId);
    }
    return m;
  }, [squads]);

  const assigneeAgentByIssueId = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const iss of issues ?? []) {
      if (iss.assignee?.type === 'agent') out[iss.id] = iss.assignee.id;
      else if (iss.assignee?.type === 'squad') {
        out[iss.id] = squadLeaderById.get(iss.assignee.id);
      }
    }
    return out;
  }, [issues, squadLeaderById]);

  const failedIssueIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of failedRuns) {
      if (r.issueId) s.add(r.issueId);
    }
    return s;
  }, [failedRuns]);

  const activeIssueIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of runningRuns) {
      if (r.issueId) s.add(r.issueId);
    }
    for (const r of queuedRuns) {
      if (r.issueId) s.add(r.issueId);
    }
    return s;
  }, [runningRuns, queuedRuns]);

  const statusQuery = useMemo(() => {
    if (!statusFromUrl) return undefined;
    const ok = (IssueStatusEnum.options as string[]).includes(statusFromUrl);
    return ok ? (statusFromUrl as IssueStatus) : undefined;
  }, [statusFromUrl]);

  const updateIssue = useUpdateIssue();
  const [sortCol, setSortCol] = useState<'identifier' | 'title' | 'status' | 'priority' | 'assignee' | 'updatedAt' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleHeaderSort = useCallback((col: 'identifier' | 'title' | 'status' | 'priority' | 'assignee' | 'updatedAt') => {
    if (sortCol === col) {
      if (sortDir === 'asc') setSortDir('desc');
      else {
        setSortCol(null);
        setSortDir('asc');
      }
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }, [sortCol, sortDir]);

  // 服务端已按 q/label/assignee 过滤；failed=1 / status 客户端再滤（含 cancelled 列）
  const visible = useMemo(() => {
    return (issues ?? []).filter((i) => {
      if (failedOnly && !failedIssueIds.has(i.id)) return false;
      if (statusQuery && i.status !== statusQuery) return false;
      return true;
    });
  }, [issues, failedOnly, failedIssueIds, statusQuery]);

  const sortedVisible = useMemo(() => {
    if (!sortCol) {
      if (sortMode === 'updated') {
        return [...visible].sort((a, b) => {
          const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return tB - tA;
        });
      }
      return visible;
    }
    return [...visible].sort((a, b) => {
      let valA: any = a[sortCol as keyof typeof a] ?? '';
      let valB: any = b[sortCol as keyof typeof b] ?? '';
      if (sortCol === 'assignee') {
        valA = a.assignee?.label ?? '';
        valB = b.assignee?.label ?? '';
      } else if (sortCol === 'updatedAt') {
        valA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        valB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      }
      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [visible, sortCol, sortDir, sortMode]);

  const selectValue = assigneeFromUrl || '';
  const failedCount = failedIssueIds.size;
  const visibleCount = visible.length;
  const hasActiveFilters = Boolean(
    qFromUrl.trim() ||
      labelFilter ||
      assigneeFromUrl ||
      priorityQuery ||
      originQuery ||
      projectFromUrl ||
      failedOnly ||
      statusQuery,
  );
  const projectChipName = projectFromUrl
    ? projects.find((p) => p.id === projectFromUrl)?.title ?? '项目'
    : '';
  const visibleColumns = statusQuery
    ? COLUMNS.filter((c) => c.status === statusQuery)
    : COLUMNS;
  const statusChipLabel =
    statusQuery != null
      ? COLUMNS.find((c) => c.status === statusQuery)?.title ?? statusQuery
      : '';

  const moreFilterCount = [
    priorityQuery,
    originQuery,
    projectFromUrl,
    statusQuery,
    failedOnly,
    labelFilter,
  ].filter(Boolean).length;
  const showMore = moreFiltersOpen || moreFilterCount > 0;

  if (isLoading) return <div className="kanban-loading">加载中…</div>;

  function handleDragStart(event: any) {
    setDragId(event.active.id);
  }

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over) {
      setDragId(null);
      return;
    }

    const activeId = active.id;
    const overId = over.id;

    let targetStatus: IssueStatus;
    let beforeId: string | null = null;

    if (over.data.current?.type === 'Column') {
      targetStatus = over.data.current.status;
    } else if (over.data.current?.type === 'Issue') {
      targetStatus = over.data.current.issue.status;
      beforeId = overId;
    } else {
      setDragId(null);
      return;
    }

    const dragged = (issues ?? []).find((i) => i.id === activeId);
    if (!dragged) {
      setDragId(null);
      return;
    }
    if (beforeId === activeId) {
      setDragId(null);
      return;
    }

    const columnIds = (issues ?? [])
      .filter((i) => i.status === targetStatus && i.id !== activeId)
      .sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return a.createdAt < b.createdAt ? 1 : -1;
      })
      .map((i) => i.id);

    let orderedIds: string[];
    if (beforeId && columnIds.includes(beforeId)) {
      const idx = columnIds.indexOf(beforeId);
      orderedIds = [
        ...columnIds.slice(0, idx),
        activeId,
        ...columnIds.slice(idx),
      ];
    } else {
      orderedIds = [...columnIds, activeId];
    }

    // 同列且顺序未变 → 跳过
    if (dragged.status === targetStatus) {
      const prevIds = (issues ?? [])
        .filter((i) => i.status === targetStatus)
        .sort((a, b) => {
          if (a.position !== b.position) return a.position - b.position;
          return a.createdAt < b.createdAt ? 1 : -1;
        })
        .map((i) => i.id);
      if (
        prevIds.length === orderedIds.length &&
        prevIds.every((id, i) => id === orderedIds[i])
      ) {
        setDragId(null);
        return;
      }
    }

    reorder.mutate({ status: targetStatus, orderedIds });
    setDragId(null);
  }

  const assigneeChipLabel = (() => {
    if (!assigneeFromUrl) return '';
    if (assigneeFromUrl === 'any') return '已指派';
    if (assigneeFromUrl === 'none') return '未指派';
    if (assigneeFromUrl.startsWith('agent:')) {
      const id = assigneeFromUrl.slice('agent:'.length);
      return agents.find((a) => a.id === id)?.name ?? id.slice(0, 8);
    }
    if (assigneeFromUrl.startsWith('squad:')) {
      const id = assigneeFromUrl.slice('squad:'.length);
      return squads.find((s) => s.id === id)?.name ?? id.slice(0, 8);
    }
    return assigneeFromUrl;
  })();
  const labelChipName = labelFilter
    ? (labels ?? []).find((l) => l.id === labelFilter)?.name ?? '标签'
    : '';
  const priorityChip =
    priorityQuery != null
      ? PRIORITY_OPTIONS.find((o) => o.value === priorityQuery)?.label ?? priorityQuery
      : '';

  return (
    <div
      className="kanban-board"
      data-failed-only={failedOnly ? '1' : '0'}
      data-origin-filter={originQuery ?? ''}
      data-status-filter={statusQuery ?? ''}
      data-view={viewMode}
      data-visible-count={visibleCount}
      data-testid="kanban-board"
    >
      <AgentsWorkingBanner />
      <div className="kanban-toolbar" data-testid="kanban-toolbar">
        <div className="kanban-toolbar-primary">
          <Suspense fallback={<button type="button" className="btn-new-issue" disabled>新建 Issue</button>}>
            <NewIssueForm />
          </Suspense>
          <div className="kanban-scope-tabs" role="tablist" aria-label="范围" data-testid="kanban-scope-tabs">
            <button
              type="button"
              role="tab"
              className={`kanban-scope-tab${selectValue === '' ? ' is-active' : ''}`}
              aria-selected={selectValue === ''}
              onClick={() => setAssigneeFilter('')}
            >
              全部
            </button>
            <button
              type="button"
              role="tab"
              className={`kanban-scope-tab${selectValue === 'any' ? ' is-active' : ''}`}
              aria-selected={selectValue === 'any'}
              onClick={() => setAssigneeFilter('any')}
            >
              已指派
            </button>
            <button
              type="button"
              role="tab"
              className={`kanban-scope-tab${selectValue.startsWith('agent:') ? ' is-active' : ''}`}
              aria-selected={selectValue.startsWith('agent:')}
              onClick={() => {
                if (!selectValue.startsWith('agent:') && agents[0]) {
                  setAssigneeFilter(`agent:${agents[0].id}`);
                }
              }}
              title="再从下拉选具体智能体"
            >
              智能体
            </button>
          </div>
          <input
            className="kanban-search-input"
            type="search"
            placeholder="搜索标题 / FRI-…"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            aria-label="搜索 Issue"
          />
          <select
            className="kanban-assignee-select"
            value={selectValue}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            aria-label="按指派筛选"
          >
            <option value="">全部指派</option>
            <option value="any">已指派</option>
            <option value="none">未指派</option>
            <optgroup label="智能体">
              {agents.map((a) => (
                <option key={a.id} value={`agent:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="小队">
              {squads.map((s) => (
                <option key={s.id} value={`squad:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          </select>
          <div
            className="kanban-view-tabs"
            role="tablist"
            aria-label="视图"
            data-testid="kanban-view-tabs"
          >
            <button
              type="button"
              role="tab"
              className={`kanban-scope-tab${viewMode === 'board' ? ' is-active' : ''}`}
              aria-selected={viewMode === 'board'}
              data-testid="kanban-view-board"
              onClick={() => setViewMode('board')}
            >
              看板
            </button>
            <button
              type="button"
              role="tab"
              className={`kanban-scope-tab${viewMode === 'list' ? ' is-active' : ''}`}
              aria-selected={viewMode === 'list'}
              data-testid="kanban-view-list"
              onClick={() => setViewMode('list')}
            >
              列表
            </button>
          </div>
          {viewMode === 'list' ? (
            <div
              className="kanban-sort-tabs"
              role="tablist"
              aria-label="列表排序"
              data-testid="kanban-sort-tabs"
            >
              <button
                type="button"
                role="tab"
                className={`kanban-scope-tab${sortMode === 'manual' ? ' is-active' : ''}`}
                aria-selected={sortMode === 'manual'}
                data-testid="kanban-sort-manual"
                onClick={() => setSortMode('manual')}
              >
                手动序
              </button>
              <button
                type="button"
                role="tab"
                className={`kanban-scope-tab${sortMode === 'updated' ? ' is-active' : ''}`}
                aria-selected={sortMode === 'updated'}
                data-testid="kanban-sort-updated"
                onClick={() => setSortMode('updated')}
              >
                最近更新
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className={`kanban-more-toggle${showMore ? ' is-open' : ''}${moreFilterCount ? ' has-active' : ''}`}
            data-testid="kanban-more-filters"
            aria-expanded={showMore}
            onClick={() => setMoreFiltersOpen((v) => !v)}
          >
            筛选{moreFilterCount > 0 ? ` · ${moreFilterCount}` : ''}
          </button>
        </div>

        {showMore ? (
          <div className="kanban-toolbar-more" data-testid="kanban-toolbar-more">
            <select
              className="kanban-priority-select"
              value={priorityQuery ?? ''}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="按优先级筛选"
              data-testid="kanban-priority-filter"
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="kanban-priority-pills" role="toolbar" aria-label="快捷优先级" data-testid="kanban-priority-pills">
              {(
                [
                  { value: 'urgent', label: '紧急' },
                  { value: 'high', label: '高' },
                  { value: 'medium', label: '中' },
                ] as const
              ).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`kanban-filter-pill${priorityQuery === p.value ? ' active' : ''}`}
                  data-testid={`kanban-priority-pill-${p.value}`}
                  aria-pressed={priorityQuery === p.value}
                  onClick={() =>
                    setPriorityFilter(priorityQuery === p.value ? '' : p.value)
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            <select
              className="kanban-origin-select"
              value={originQuery ?? ''}
              onChange={(e) => setOriginFilter(e.target.value)}
              aria-label="按来源筛选"
              data-testid="kanban-origin-filter"
            >
              <option value="">全部来源</option>
              <option value="automation">自动化</option>
              <option value="quick_create">快速派活</option>
            </select>
            <select
              className="kanban-project-select"
              value={projectFromUrl}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="按项目筛选"
              data-testid="kanban-project-filter"
            >
              <option value="">全部项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <select
              className="kanban-status-select"
              value={statusQuery ?? ''}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="按状态聚焦列"
              data-testid="kanban-status-filter"
            >
              <option value="">全部列</option>
              {COLUMNS.map((c) => (
                <option key={c.status} value={c.status}>
                  {c.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`kanban-filter-pill kanban-failed-toggle${failedOnly ? ' active' : ''}`}
              aria-pressed={failedOnly}
              aria-label="仅显示有失败运行的 Issue"
              data-testid="kanban-failed-only"
              title={
                failedCount > 0
                  ? `最近失败 run 覆盖 ${failedCount} 个 Issue`
                  : '最近无失败 run'
              }
              onClick={() => setFailedOnly(!failedOnly)}
            >
              仅失败{failedCount > 0 ? ` ${failedCount}` : ''}
            </button>
            {failedOnly ? (
              <span
                className="kanban-filter-note"
                data-testid="kanban-failed-filter-note"
                title="当前筛选下的可见 Issue 数（与列计数之和一致）"
              >
                <span>
                  显示 {visibleCount}
                  {failedCount > 0 && visibleCount !== failedCount
                    ? ` / 失败集 ${failedCount}`
                    : ''}
                </span>
                <span aria-hidden="true">·</span>
                <Link href="/runs?status=failed" className="kanban-filter-note-link" data-testid="kanban-fail-to-runs">
                  失败运行
                </Link>
                <span aria-hidden="true">·</span>
                <Link
                  href="/inbox?kind=run_failed&read=unread"
                  className="kanban-filter-note-link"
                  data-testid="kanban-fail-to-inbox"
                >
                  收件箱
                </Link>
                <span aria-hidden="true">·</span>
                <Link href="/settings" className="kanban-filter-note-link" data-testid="kanban-fail-to-settings">
                  环境
                </Link>
              </span>
            ) : null}
            <div className="kanban-label-filters" role="toolbar" aria-label="按标签筛选">
              <button
                type="button"
                className={`kanban-filter-pill${labelFilter === '' ? ' active' : ''}`}
                onClick={() => setLabelFilter('')}
              >
                全部标签
              </button>
              {(labels ?? []).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`kanban-filter-pill${labelFilter === l.id ? ' active' : ''}`}
                  style={{ ['--label-color' as string]: l.color }}
                  onClick={() => setLabelFilter(l.id)}
                  title={l.name}
                >
                  <span className="issue-label-dot" />
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {hasActiveFilters ? (
        <div
          className="kanban-active-filters"
          data-testid="kanban-active-filters"
          aria-label="当前筛选"
        >
          {qFromUrl.trim() ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-q"
              onClick={() => {
                setQDraft('');
                const sp = new URLSearchParams(searchParams.toString());
                sp.delete('q');
                const qs = sp.toString();
                router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
              }}
            >
              搜索「{qFromUrl.trim()}」 ×
            </button>
          ) : null}
          {assigneeFromUrl ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-assignee"
              onClick={() => setAssigneeFilter('')}
            >
              指派 · {assigneeChipLabel} ×
            </button>
          ) : null}
          {priorityQuery ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-priority"
              onClick={() => setPriorityFilter('')}
            >
              优先级 · {priorityChip} ×
            </button>
          ) : null}
          {statusQuery ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-status"
              onClick={() => setStatusFilter('')}
            >
              状态 · {statusChipLabel} ×
            </button>
          ) : null}
          {originQuery ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-origin"
              onClick={() => setOriginFilter('')}
            >
              来源 · {originQuery === 'automation' ? '自动化' : '快速派活'} ×
            </button>
          ) : null}
          {projectFromUrl ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-project"
              onClick={() => setProjectFilter('')}
            >
              项目 · {projectChipName} ×
            </button>
          ) : null}
          {failedOnly ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-failed"
              onClick={() => setFailedOnly(false)}
            >
              仅失败 ×
            </button>
          ) : null}
          {labelFilter ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="kanban-chip-label"
              onClick={() => setLabelFilter('')}
            >
              标签 · {labelChipName} ×
            </button>
          ) : null}
          <button
            type="button"
            className="kanban-active-chip kanban-active-chip--clear"
            data-testid="kanban-chip-clear-all"
            onClick={() => router.replace(pathname, { scroll: false })}
          >
            清除全部
          </button>
        </div>
      ) : null}
      {visibleCount === 0 && hasActiveFilters ? (
        <div className="kanban-empty-filter" data-testid="kanban-empty-filter">
          <EmptyState
            title="没有符合筛选的 Issue"
            description="试试清除筛选，或换到来源 / 指派 / 失败条件。"
            action={
              <div className="kanban-empty-actions">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  data-testid="kanban-clear-filters"
                  onClick={() => router.replace(pathname, { scroll: false })}
                >
                  清除全部筛选
                </button>
                {originQuery === 'automation' ? (
                  <Link href="/automation" className="btn-secondary btn-sm">
                    打开自动化
                  </Link>
                ) : null}
                {failedOnly ? (
                  <>
                    <Link
                      href="/runs?status=failed"
                      className="btn-secondary btn-sm"
                      data-testid="kanban-empty-failed-runs"
                    >
                      失败运行
                    </Link>
                    <Link href="/settings" className="btn-ghost btn-sm" data-testid="kanban-empty-settings">
                      环境诊断
                    </Link>
                  </>
                ) : null}
              </div>
            }
          />
        </div>
      ) : null}
      {viewMode === 'list' ? (
        <div className="issue-list-view" data-testid="issue-list-view">
          <table className="issue-list-table" data-testid="issue-list-table">
            <thead>
              <tr>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleHeaderSort('identifier')}
                  data-testid="issue-list-sort-header-identifier"
                  title="按标识排序"
                >
                  标识 {sortCol === 'identifier' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleHeaderSort('title')}
                  data-testid="issue-list-sort-header-title"
                  title="按标题排序"
                >
                  标题 {sortCol === 'title' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleHeaderSort('status')}
                  data-testid="issue-list-sort-header-status"
                  title="按状态排序"
                >
                  状态 {sortCol === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleHeaderSort('priority')}
                  data-testid="issue-list-sort-header-priority"
                  title="按优先级排序"
                >
                  优先级 {sortCol === 'priority' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleHeaderSort('assignee')}
                  data-testid="issue-list-sort-header-assignee"
                  title="按指派排序"
                >
                  指派 {sortCol === 'assignee' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>项目</th>
                <th
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleHeaderSort('updatedAt')}
                  data-testid="issue-list-sort-header-updatedAt"
                  title="按更新时间排序"
                >
                  更新时间 {sortCol === 'updatedAt' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedVisible.map((iss) => {
                const stLabel =
                  COLUMNS.find((c) => c.status === iss.status)?.title ?? iss.status;
                const pri =
                  PRIORITY_OPTIONS.find((p) => p.value === iss.priority)?.label ??
                  iss.priority ??
                  '—';
                const assignee =
                  iss.assignee?.label ??
                  (iss.assignee ? `${iss.assignee.type}:${iss.assignee.id.slice(0, 6)}` : '未指派');
                const proj =
                  iss.projectTitle ??
                  (iss.projectId
                    ? projects.find((p) => p.id === iss.projectId)?.title
                    : null) ??
                  '—';
                return (
                  <tr
                    key={iss.id}
                    data-testid="issue-list-row"
                    data-issue-id={iss.id}
                    className={
                      failedIssueIds.has(iss.id)
                        ? 'issue-list-row is-failed'
                        : activeIssueIds.has(iss.id)
                          ? 'issue-list-row is-active'
                          : 'issue-list-row'
                    }
                  >
                    <td>
                      <Link
                        href={`/issues/${iss.id}`}
                        className="issue-list-id"
                      >
                        {iss.identifier}
                      </Link>
                    </td>
                    <td className="issue-list-title">
                      <Link href={`/issues/${iss.id}`}>{iss.title}</Link>
                    </td>
                    <td>
                      <select
                        className="btn-ghost btn-xs"
                        style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                        value={iss.status}
                        onChange={(e) =>
                          updateIssue.mutate({
                            id: iss.id,
                            input: { status: e.target.value as IssueStatus },
                          })
                        }
                        data-testid="issue-list-status-select"
                        aria-label={`修改 ${iss.identifier} 状态`}
                      >
                        {COLUMNS.map((col) => (
                          <option key={col.status} value={col.status}>
                            {col.title}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="text-sm">
                      <span
                        className={`priority-badge priority-${iss.priority || 'none'}`}
                        style={{ fontSize: '11px', padding: '2px 6px', borderRadius: 4 }}
                      >
                        {pri}
                      </span>
                    </td>
                    <td className="text-sm text-dim">{assignee}</td>
                    <td className="text-dim text-sm">{proj}</td>
                    <td className="text-dim text-sm" style={{ whiteSpace: 'nowrap' }}>
                      {iss.updatedAt
                        ? new Date(iss.updatedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td>
                      <Link
                        href={`/issues/${iss.id}`}
                        className="btn-ghost btn-xs"
                        style={{ textDecoration: 'none' }}
                      >
                        详情
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sortedVisible.length === 0 ? (
            <div style={{ padding: 24 }}>
              <EmptyState
                title="列表中无符合条件的 Issue"
                description="请尝试调整筛选条件或重置视图。"
              />
            </div>
          ) : null}
        </div>
      ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-columns" data-status-focus={statusQuery ?? ''}>
          {visibleColumns.map((col) => (
            <KanbanColumn
              key={col.status}
              title={col.title}
              status={col.status}
              color={col.color}
              issues={visible.filter((i) => i.status === col.status)}
              readinessByAgentId={readinessMap}
              failedIssueIds={failedIssueIds}
              activeIssueIds={activeIssueIds}
              assigneeAgentByIssueId={assigneeAgentByIssueId}
            />
          ))}
        </div>
        <DragOverlay>
          {dragId && (issues ?? []).find((i) => i.id === dragId) ? (
            <div style={{ opacity: 0.8 }}>
              <IssueCard
                issue={(issues ?? []).find((i) => i.id === dragId)!}
                readiness={assigneeAgentByIssueId[dragId] ? readinessMap[assigneeAgentByIssueId[dragId]!] : null}
                lastRunFailed={failedIssueIds.has(dragId)}
                runActive={activeIssueIds.has(dragId)}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      )}
    </div>
  );
}

export function KanbanBoard() {
  return (
    <Suspense fallback={<div className="kanban-loading">加载中…</div>}>
      <KanbanBoardInner />
    </Suspense>
  );
}
