'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { IssueStatus } from '@ma/shared';
import {
  useAgents,
  useIssues,
  useLabels,
  useSquads,
  useUpdateIssue,
} from '@/lib/api';
import { KanbanColumn } from './KanbanColumn';
import { NewIssueForm } from './NewIssueForm';

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
  const [qDraft, setQDraft] = useState(qFromUrl);

  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();

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

  const assigneeQuery = useMemo(
    () => parseAssigneeParam(assigneeFromUrl || null),
    [assigneeFromUrl],
  );

  const { data: issues, isLoading } = useIssues({
    q: qFromUrl || undefined,
    labelId: labelFilter || undefined,
    ...assigneeQuery,
  });
  const { data: labels } = useLabels();
  const update = useUpdateIssue();
  const [dragId, setDragId] = useState<string | null>(null);

  if (isLoading) return <div className="kanban-loading">加载中…</div>;

  // cancelled 不渲染；服务端已按 q/label/assignee 过滤
  const visible = (issues ?? []).filter((i) => i.status !== 'cancelled');

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

  return (
    <div className="kanban-board">
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
