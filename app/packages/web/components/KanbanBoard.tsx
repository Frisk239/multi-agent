'use client';
import { Suspense, useState } from 'react';
import type { IssueStatus } from '@ma/shared';
import { useIssues, useLabels, useUpdateIssue } from '@/lib/api';
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

export function KanbanBoard() {
  const { data: issues, isLoading } = useIssues();
  const { data: labels } = useLabels();
  const update = useUpdateIssue();
  const [dragId, setDragId] = useState<string | null>(null);
  const [labelFilter, setLabelFilter] = useState<string>('');

  if (isLoading) return <div className="kanban-loading">加载中…</div>;

  // spec §7.5 R5：cancelled 的 issue 不渲染到任何列
  const visible = (issues ?? []).filter((i) => {
    if (i.status === 'cancelled') return false;
    if (!labelFilter) return true;
    return (i.labels ?? []).some((l) => l.id === labelFilter);
  });

  function handleDrop(targetStatus: IssueStatus) {
    if (!dragId) return;
    const dragged = visible.find((i) => i.id === dragId);
    if (!dragged || dragged.status === targetStatus) {
      setDragId(null);
      return;
    }
    // spec §7.3 ①：乐观更新 + PUT（只传 status，不传 position，D4）
    update.mutate({ id: dragId, input: { status: targetStatus } });
    setDragId(null);
  }

  return (
    <div className="kanban-board">
      <div className="kanban-toolbar">
        <Suspense fallback={<button type="button" className="btn-new-issue" disabled>新建 Issue</button>}>
          <NewIssueForm />
        </Suspense>
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
