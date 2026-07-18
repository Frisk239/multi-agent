'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { IssueStatus, Priority } from '@ma/shared';
import { Priority as PriorityEnum } from '@ma/shared';
import {
  useAgents,
  useAgentsReadinessMap,
  useIssues,
  useLabels,
  useSquads,
  useUpdateIssue,
  useWorkspaceRuns,
} from '@/lib/api';
import { KanbanColumn } from './KanbanColumn';
import { NewIssueForm } from './NewIssueForm';
import { EmptyState } from './EmptyState';

const PRIORITY_OPTIONS: { value: '' | Priority; label: string }[] = [
  { value: '', label: '全部优先级' },
  { value: 'urgent', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
  { value: 'none', label: '无' },
];

// spec §7.2：6 列，cancelled 不建列
const COLUMNS: { title: string; status: IssueStatus; color: string }[] = [
  { title: 'Backlog', status: 'backlog', color: 'var(--status-backlog)' },
  { title: 'Todo', status: 'todo', color: 'var(--status-todo)' },
  { title: 'In Progress', status: 'in_progress', color: 'var(--status-in-progress)' },
  { title: 'In Review', status: 'in_review', color: 'var(--status-in-review)' },
  { title: 'Done', status: 'done', color: 'var(--status-done)' },
  { title: 'Blocked', status: 'blocked', color: 'var(--status-blocked)' },
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
  // URL 可分享：?failed=1 仅显示最近有 failed run 的 issue
  const failedOnly = searchParams.get('failed') === '1';
  const [qDraft, setQDraft] = useState(qFromUrl);

  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
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
    ...assigneeQuery,
  });
  const { data: labels } = useLabels();
  const update = useUpdateIssue();
  const [dragId, setDragId] = useState<string | null>(null);

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

  if (isLoading) return <div className="kanban-loading">加载中…</div>;

  // cancelled 不渲染；服务端已按 q/label/assignee 过滤；failed=1 客户端再滤
  const visible = (issues ?? []).filter((i) => {
    if (i.status === 'cancelled') return false;
    if (failedOnly && !failedIssueIds.has(i.id)) return false;
    return true;
  });

  function handleDrop(targetStatus: IssueStatus) {
    if (!dragId) return;
    const dragged = visible.find((i) => i.id === dragId);
    if (!dragged || dragged.status === targetStatus) {
      setDragId(null);
      return;
    }
    update.mutate({ id: dragId, input: { status: targetStatus } });
    setDragId(null);
  }

  const selectValue = assigneeFromUrl || '';
  const failedCount = failedIssueIds.size;
  const visibleCount = visible.length;
  const hasActiveFilters = Boolean(
    qFromUrl.trim() ||
      labelFilter ||
      assigneeFromUrl ||
      priorityQuery ||
      originQuery ||
      failedOnly,
  );

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
      data-visible-count={visibleCount}
      data-testid="kanban-board"
    >
      <div className="kanban-toolbar">
        <Suspense fallback={<button type="button" className="btn-new-issue" disabled>新建 Issue</button>}>
          <NewIssueForm />
        </Suspense>
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
              Inbox
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
            全部
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
      <div className="kanban-columns">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            title={col.title}
            status={col.status}
            color={col.color}
            issues={visible.filter((i) => i.status === col.status)}
            onDragStart={setDragId}
            onDrop={handleDrop}
            readinessByAgentId={readinessMap}
            failedIssueIds={failedIssueIds}
            activeIssueIds={activeIssueIds}
            assigneeAgentByIssueId={assigneeAgentByIssueId}
          />
        ))}
      </div>
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
