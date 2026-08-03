'use client';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  KeyboardCode,
} from '@dnd-kit/core';
import type { KeyboardCoordinateGetter } from '@dnd-kit/core';
import type { IssueStatus, Priority, Issue } from '@ma/shared';
import { IssueStatus as IssueStatusEnum, Priority as PriorityEnum } from '@ma/shared';
import {
  API,
  apiFetch,
  useAgents,
  useAgentsReadinessMap,
  useIssues,
  useLabels,
  useProjects,
  useReorderIssues,
  useSquads,
  useUpdateIssue,
  useWorkspaceRuns,
  useBulkUpdateIssueStatus,
  useBulkUpdateIssueAssignee,
  useBulkDeleteIssues,
} from '@/lib/api';
import { KanbanColumn } from './KanbanColumn';
import { IssueCard } from './IssueCard';
import { IssueListView, type IssueListSortCol } from './IssueListView';
import {
  IssueSideSheet,
  buildIssueSheetHref,
  withIssueSearchParam,
} from './IssueSideSheet';
import { NewIssueForm } from './NewIssueForm';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { PageSkeleton } from './Skeleton';
import { AgentsWorkingBanner } from './AgentsWorkingBanner';
import { useDensity } from '@/lib/density';
import { limitForPages, summarizeIssuePaging } from '@/lib/issue-list-paging';
import {
  makeListViewKey,
  readListViewState,
  resolveRestoreIndex,
  saveListViewState,
  sessionStorageOrNull,
} from '@/lib/issue-list-scroll-restore';
import {
  collectActiveIssueIds,
  issueIdsFromRuns,
} from '@/lib/issue-card-live';
import { confirmDialog } from '@/lib/confirm-store';
import { Select } from './Select';

import {
  PRIORITY_OPTIONS,
  COLUMNS,
  kanbanKeyboardCoordinates,
  parseAssigneeParam,
  type KanbanScopeFilter,
} from './KanbanBoard.shared';
import { computeDragReorder } from './KanbanBoard.dnd';
import { KanbanToolbar } from './KanbanBoard.toolbar';


function KanbanBoardInner({
  scopeFilter,
}: {
  scopeFilter?: KanbanScopeFilter;
}) {
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
  // W3：列表列排序（客户端）→ ?sort=<col>:<dir>，与 sort=updated 服务端模式互斥
  const columnSortFromUrl = useMemo(() => {
    const raw = searchParams.get('sort') ?? '';
    const m = raw.match(/^(identifier|title|status|priority|assignee|updatedAt):(asc|desc)$/);
    if (!m) return null;
    return { col: m[1] as IssueListSortCol, dir: m[2] as 'asc' | 'desc' };
  }, [searchParams]);
  // Slice 32：?issue= 打开右侧详情 Sheet（保留筛选等其它 query）
  const issueFromUrl = searchParams.get('issue') ?? '';
  const [qDraft, setQDraft] = useState(qFromUrl);
  // Multica 真站顶栏更疏：默认只露主筛选；运维向筛选放进「更多」
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // F2：看板列头「+」→ 打开 NewIssueForm 并预填该列 status
  const [quickCreate, setQuickCreate] = useState<{
    status: IssueStatus;
    nonce: number;
  } | null>(null);
  const quickCreateNonceRef = useRef(0);
  const handleColumnQuickCreate = useCallback((status: IssueStatus) => {
    quickCreateNonceRef.current += 1;
    setQuickCreate({ status, nonce: quickCreateNonceRef.current });
  }, []);

  const bulkUpdateStatus = useBulkUpdateIssueStatus();
  const bulkUpdateAssignee = useBulkUpdateIssueAssignee();
  const bulkDelete = useBulkDeleteIssues();
  const { density, setDensity } = useDensity();

  const handleToggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Slice 52 · Esc 清选（有选中且无确认框时）
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-testid="confirm-dialog"]')) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      handleClearSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds.size, handleClearSelection]);

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
      // W3：切回排序 Tab 时清掉列排序（URL 里的 <col>:<dir> 已被覆盖）
      setSortCol(null);
      setSortDir('asc');
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

  const openIssueSheet = useCallback(
    (issueId: string, hash?: string) => {
      const href = buildIssueSheetHref(
        pathname,
        searchParams.toString(),
        issueId,
        hash,
      );
      router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const closeIssueSheet = useCallback(() => {
    const qs = withIssueSearchParam(searchParams.toString(), null);
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

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

  // S1：递增窗口分页。过去这里不传 limit，后端默认 50，122 条里的 72 条静默不可见。
  // 初值取自上次离开该视图时保存的页数，否则走全页详情返回会退回第 1 页。
  const listViewKey = makeListViewKey({
    view: viewMode,
    q: qFromUrl,
    label: labelFilter,
    priority: priorityFromUrl,
    origin: originFromUrl,
    project: projectFromUrl,
    assignee: assigneeFromUrl,
    status: statusFromUrl,
    sort: sortMode,
  });
  const restoredView = useMemo(
    () => readListViewState(sessionStorageOrNull(), listViewKey),
    [listViewKey],
  );

  const [pagesLoaded, setPagesLoaded] = useState(restoredView?.pagesLoaded ?? 1);
  const issuesQueryLimit = limitForPages(pagesLoaded);
  const topRowRef = useRef<{ id: string | null; index: number }>({
    id: restoredView?.anchorIssueId ?? null,
    index: restoredView?.anchorIndex ?? 0,
  });

  const {
    data: issuesPage,
    isLoading,
    isError,
    error,
    refetch,
    isFetching: issuesFetching,
  } = useIssues({
    q: qFromUrl || undefined,
    labelId: labelFilter || undefined,
    priority: priorityQuery,
    originType: originQuery,
    projectId: projectFromUrl || undefined,
    sort: viewMode === 'list' && sortMode === 'updated' ? 'updated' : undefined,
    limit: issuesQueryLimit,
    ...assigneeQuery,
  });
  const issues = issuesPage?.data ?? [];

  // —— G5-7：看板快照 JSON 导出/导入（迁移场景）——
  const [jsonNotice, setJsonNotice] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  async function handleExportJson() {
    setJsonNotice(null);
    try {
      const res = await apiFetch(`${API}/issues/export`);
      if (!res.ok) {
        setJsonNotice('导出失败：请确认 API 已启动');
        return;
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kanban-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setJsonNotice(`已导出 ${data.issues?.length ?? 0} 条 issue`);
    } catch {
      setJsonNotice('导出失败：请确认 API 已启动');
    }
  }

  async function handleImportFile(file: File) {
    setJsonNotice(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { issues?: unknown[] } | unknown[];
      const issuesArr = Array.isArray(parsed) ? parsed : parsed.issues;
      if (!Array.isArray(issuesArr)) {
        setJsonNotice('导入失败：JSON 不是看板快照（缺 issues 数组）');
        return;
      }
      const res = await apiFetch(`${API}/issues/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issues: issuesArr }),
      });
      const body = (await res.json()) as { ok?: boolean; created?: number; failed?: { title: string; error: string }[]; error?: string };
      if (!res.ok || body.ok !== true) {
        setJsonNotice(`导入失败：${body.error ?? '未知错误'}`);
        return;
      }
      setJsonNotice(
        `导入完成：创建 ${body.created ?? 0} 条${(body.failed?.length ?? 0) > 0 ? `，失败 ${body.failed!.length} 条（${body.failed![0].title}: ${body.failed![0].error}）` : ''}`,
      );
      void refetch();
    } catch (e) {
      setJsonNotice(`导入失败：${e instanceof Error ? e.message : 'JSON 解析错误'}`);
    }
  }
  const paging = summarizeIssuePaging(issues.length, issuesPage?.total);

  // S1：离开该视图前存下页数 + 顶部锚点行，供返回时恢复
  const persistListView = useCallback(() => {
    saveListViewState(sessionStorageOrNull(), listViewKey, {
      pagesLoaded,
      anchorIssueId: topRowRef.current.id,
      anchorIndex: topRowRef.current.index,
    });
  }, [listViewKey, pagesLoaded]);

  useEffect(() => {
    // 卸载即视为离开（走 /issues/[id] 全页详情是最常见的卸载路径）
    return () => persistListView();
  }, [persistListView]);

  const handleTopRowChange = useCallback((issueId: string | null, index: number) => {
    topRowRef.current = { id: issueId, index };
  }, []);

  // 换筛选条件/搜索词/指派人时窗口回到第一页，避免带着放大的 limit 走
  const pagingResetKey = [
    qFromUrl,
    labelFilter,
    priorityQuery ?? '',
    originQuery ?? '',
    projectFromUrl ?? '',
    assigneeQuery.assigneeType ?? '',
    assigneeQuery.assigneeId ?? '',
    assigneeQuery.unassigned ? '1' : '',
    assigneeQuery.assigned ? '1' : '',
  ].join('|');
  const lastPagingResetKey = useRef(pagingResetKey);
  useEffect(() => {
    if (lastPagingResetKey.current !== pagingResetKey) {
      lastPagingResetKey.current = pagingResetKey;
      setPagesLoaded(1);
    }
  }, [pagingResetKey]);
  const { data: labels } = useLabels();
  const reorder = useReorderIssues();
  const [dragId, setDragId] = useState<string | null>(null);
  const bulkPending =
    bulkUpdateStatus.isPending ||
    bulkUpdateAssignee.isPending ||
    bulkDelete.isPending;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    // G3-2：键盘可达（a11y）——卡片聚焦后 Space/Enter 拾起、方向键移动
    // （左右跨列 / 上下列内，自定义 kanbanKeyboardCoordinates）、再按放下；
    // 与指针拖拽走同一 onDragEnd → reorder API（position 一并维护）。
    useSensor(KeyboardSensor, {
      coordinateGetter: kanbanKeyboardCoordinates,
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

  const failedIssueIds = useMemo(
    () => issueIdsFromRuns(failedRuns),
    [failedRuns],
  );

  const activeIssueIds = useMemo(
    () => collectActiveIssueIds(runningRuns, queuedRuns),
    [runningRuns, queuedRuns],
  );

  const getIssueSheetHref = useCallback(
    (issue: Issue) => {
      const active = activeIssueIds.has(issue.id);
      return buildIssueSheetHref(
        pathname,
        searchParams.toString(),
        issue.id,
        active ? '#run-trace' : undefined,
      );
    },
    [pathname, searchParams, activeIssueIds],
  );

  const handleOpenIssueDetail = useCallback(
    (issueId: string, _e?: React.MouseEvent) => {
      const hash = activeIssueIds.has(issueId) ? '#run-trace' : undefined;
      openIssueSheet(issueId, hash);
    },
    [activeIssueIds, openIssueSheet],
  );

  const statusQuery = useMemo(() => {
    if (!statusFromUrl) return undefined;
    const ok = (IssueStatusEnum.options as string[]).includes(statusFromUrl);
    return ok ? (statusFromUrl as IssueStatus) : undefined;
  }, [statusFromUrl]);

  const updateIssue = useUpdateIssue();
  // W3：列排序状态与 URL 双向——mount 从 ?sort=<col>:<dir> 恢复，变更即写回
  const [sortCol, setSortCol] = useState<IssueListSortCol | null>(
    columnSortFromUrl?.col ?? null,
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    columnSortFromUrl?.dir ?? 'asc',
  );

  const handleHeaderSort = useCallback(
    (col: IssueListSortCol) => {
      let nextCol: IssueListSortCol | null;
      let nextDir: 'asc' | 'desc';
      if (sortCol === col) {
        if (sortDir === 'asc') {
          nextCol = col;
          nextDir = 'desc';
        } else {
          nextCol = null;
          nextDir = 'asc';
        }
      } else {
        nextCol = col;
        nextDir = 'asc';
      }
      setSortCol(nextCol);
      setSortDir(nextDir);
      // W3：排序状态进 URL（?sort=<col>:<dir>；清除时回到服务端 manual 序）
      const sp = new URLSearchParams(searchParams.toString());
      if (nextCol) sp.set('sort', `${nextCol}:${nextDir}`);
      else sp.delete('sort');
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sortCol, sortDir, pathname, router, searchParams],
  );

  const projectTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.title);
    return m;
  }, [projects]);

  const handleListStatusChange = useCallback(
    (id: string, status: IssueStatus) => {
      updateIssue.mutate({ id, input: { status } });
    },
    [updateIssue],
  );

  // 服务端已按 q/label/assignee 过滤；failed=1 / status / scope 客户端再滤（含 cancelled 列）
  const visible = useMemo(() => {
    return (issues ?? []).filter((i) => {
      if (scopeFilter && !scopeFilter(i)) return false;
      if (failedOnly && !failedIssueIds.has(i.id)) return false;
      if (statusQuery && i.status !== statusQuery) return false;
      return true;
    });
  }, [issues, failedOnly, failedIssueIds, statusQuery, scopeFilter]);

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

  const issuesByStatus = useMemo(() => {
    const map = new Map<IssueStatus, Issue[]>();
    for (const c of COLUMNS) map.set(c.status, []);
    for (const i of visible) {
      const arr = map.get(i.status);
      if (arr) arr.push(i);
    }
    return map;
  }, [visible]);


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

  if (isLoading) return <PageSkeleton />;
  if (isError) {
    return (
      <div className="page-container" data-testid="kanban-error">
        <ErrorState
          title="加载看板失败"
          description={error instanceof Error ? error.message : '未知错误'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }


  function handleDragStart(event: any) {
    setDragId(event.active.id);
  }

  function handleDragEnd(event: any) {
    const result = computeDragReorder(event, issues ?? []);
    setDragId(null);
    if (result) {
      reorder.mutate(result);
    }
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

      <KanbanToolbar
        selectValue={selectValue}
        setAssigneeFilter={setAssigneeFilter}
        agents={agents}
        squads={squads}
        qDraft={qDraft}
        setQDraft={setQDraft}
        qFromUrl={qFromUrl}
        searchParams={searchParams}
        viewMode={viewMode}
        setViewMode={setViewMode}
        sortMode={sortMode}
        setSortMode={setSortMode}
        quickCreate={quickCreate}
        showMore={showMore}
        setMoreFiltersOpen={setMoreFiltersOpen}
        moreFilterCount={moreFilterCount}
        density={density}
        setDensity={setDensity}
        priorityQuery={priorityQuery}
        setPriorityFilter={setPriorityFilter}
        originQuery={originQuery}
        setOriginFilter={setOriginFilter}
        projectFromUrl={projectFromUrl}
        assigneeFromUrl={assigneeFromUrl}
        setProjectFilter={setProjectFilter}
        projects={projects}
        statusQuery={statusQuery}
        setStatusFilter={setStatusFilter}
        failedOnly={failedOnly}
        setFailedOnly={setFailedOnly}
        failedCount={failedCount}
        visibleCount={visibleCount}
        labelFilter={labelFilter}
        setLabelFilter={setLabelFilter}
        labels={labels}
        importFileRef={importFileRef}
        handleImportFile={handleImportFile}
        handleExportJson={handleExportJson}
        jsonNotice={jsonNotice}
        assigneeChipLabel={assigneeChipLabel}
        labelChipName={labelChipName}
        priorityChip={priorityChip}
        statusChipLabel={statusChipLabel}
        projectChipName={projectChipName}
        hasActiveFilters={hasActiveFilters}
        router={router}
        pathname={pathname}
      />

      {viewMode === 'list' ? (
        sortedVisible.length === 0 ? (
          <div className="issue-list-view" data-testid="issue-list-view" data-virtualized="0">
            <div style={{ padding: 24 }}>
              <EmptyState
                title="列表中无符合条件的 Issue"
                icon="📭"
                description="请尝试调整筛选条件或重置视图。"
              />
            </div>
          </div>
        ) : (
          <IssueListView
            issues={sortedVisible}
            restoreToIndex={resolveRestoreIndex(
              sortedVisible.map((i) => i.id),
              restoredView,
            )}
            onTopRowChange={handleTopRowChange}
            density={density}
            selectedIds={selectedIds}
            failedIssueIds={failedIssueIds}
            activeIssueIds={activeIssueIds}
            projectTitleById={projectTitleById}
            sortCol={sortCol}
            sortDir={sortDir}
            onHeaderSort={handleHeaderSort}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onStatusChange={handleListStatusChange}
            getDetailHref={getIssueSheetHref}
            onOpenDetail={handleOpenIssueDetail}
          />
        )
      ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-columns overflow-x-auto" data-status-focus={statusQuery ?? ''}>
          {visibleColumns.map((col) => (
            <KanbanColumn
              key={col.status}
              title={col.title}
              status={col.status}
              color={col.color}
              issues={issuesByStatus.get(col.status) ?? []}
              readinessByAgentId={readinessMap}
              failedIssueIds={failedIssueIds}
              activeIssueIds={activeIssueIds}
              assigneeAgentByIssueId={assigneeAgentByIssueId}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              getDetailHref={getIssueSheetHref}
              onOpenDetail={handleOpenIssueDetail}
              onQuickCreate={handleColumnQuickCreate}
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

      {/* S1：诚实暴露已加载 / 总数，并提供真正能取到剩余条目的入口 */}
      {issues.length > 0 && (
        <div className="kanban-paging" data-testid="kanban-paging">
          <span
            className="text-dim text-sm"
            data-testid="kanban-paging-summary"
            data-loaded={paging.loaded}
            data-total={paging.total}
            data-remaining={paging.remaining}
            role="status"
          >
            {paging.label}
          </span>
          {paging.hasMore && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="kanban-load-more"
              disabled={issuesFetching}
              onClick={() => setPagesLoaded((p) => p + 1)}
            >
              {issuesFetching ? '加载中…' : `加载更多（还有 ${paging.remaining} 条）`}
            </button>
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div
          className="kanban-bulk-bar"
          data-testid="kanban-bulk-bar"
          role="toolbar"
          aria-label="批量操作"
          aria-busy={bulkPending || undefined}
          style={{
            transform: 'translateX(-50%)',
            position: 'fixed',
            bottom: '1rem',
            left: '50%',
            backgroundColor: 'var(--bg-elevated)',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            boxShadow: 'var(--floating-shadow)',
            border: '1px solid var(--border-subtle)',
            zIndex: 50,
            color: 'var(--text-primary)',
          }}
        >
          <span className="font-medium" data-testid="kanban-bulk-count">
            {bulkPending
              ? `处理中…（${selectedIds.size} 项）`
              : `已选择 ${selectedIds.size} 项`}
          </span>

          <Select
            className="kanban-bulk-select"
            value=""
            aria-label="批量修改状态"
            data-testid="kanban-bulk-status"
            disabled={bulkPending}
            onChange={(e) => {
              if (e.target.value) {
                bulkUpdateStatus.mutate(
                  {
                    issueIds: Array.from(selectedIds),
                    status: e.target.value as IssueStatus,
                  },
                  { onSuccess: () => handleClearSelection() },
                );
              }
            }}
          >
            <option value="" disabled>
              修改状态…
            </option>
            {COLUMNS.map((c) => (
              <option key={c.status} value={c.status}>
                {c.title}
              </option>
            ))}
          </Select>

          <Select
            className="kanban-bulk-select"
            value=""
            aria-label="批量更改指派"
            data-testid="kanban-bulk-assignee"
            disabled={bulkPending}
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                let type: string | null = null;
                let id: string | null = null;
                if (val === 'unassigned') {
                  type = null;
                  id = null;
                } else if (val.startsWith('agent:')) {
                  type = 'agent';
                  id = val.slice(6);
                } else if (val.startsWith('squad:')) {
                  type = 'squad';
                  id = val.slice(6);
                }
                bulkUpdateAssignee.mutate(
                  {
                    issueIds: Array.from(selectedIds),
                    assigneeType: type,
                    assigneeId: id,
                  },
                  { onSuccess: () => handleClearSelection() },
                );
              }
            }}
          >
            <option value="" disabled>
              更改指派…
            </option>
            <option value="unassigned">未指派</option>
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
          </Select>

          <button
            type="button"
            className="btn-error btn-sm"
            data-testid="kanban-bulk-delete"
            disabled={bulkPending}
            onClick={() => {
              void (async () => {
                const n = selectedIds.size;
                const ok = await confirmDialog({
                  title: '批量删除？',
                  description: `确定要删除选中的 ${n} 项吗？不可恢复。`,
                  confirmLabel: '删除',
                  variant: 'danger',
                });
                if (!ok) return;
                bulkDelete.mutate(
                  { issueIds: Array.from(selectedIds) },
                  { onSuccess: () => handleClearSelection() },
                );
              })();
            }}
          >
            {bulkDelete.isPending ? '删除中…' : '批量删除'}
          </button>

          <button
            type="button"
            className="btn-ghost btn-sm"
            data-testid="kanban-bulk-clear"
            onClick={handleClearSelection}
          >
            取消选择
          </button>
        </div>
      )}

      <IssueSideSheet
        issueId={issueFromUrl || null}
        onClose={closeIssueSheet}
      />
    </div>
  );
}

export function KanbanBoard({
  scopeFilter,
}: {
  scopeFilter?: KanbanScopeFilter;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <KanbanBoardInner scopeFilter={scopeFilter} />
    </Suspense>
  );
}

