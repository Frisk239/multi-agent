import Link from 'next/link';
import type { Issue, IssueStatus } from '@ma/shared';

const STATUS_COLORS: Record<IssueStatus, string> = {
  backlog: 'var(--status-backlog)',
  todo: 'var(--status-todo)',
  in_progress: 'var(--status-in-progress)',
  in_review: 'var(--status-in-review)',
  done: 'var(--status-done)',
  blocked: 'var(--status-blocked)',
  cancelled: 'var(--status-cancelled)',
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
  none: '',
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--color-red)',
  high: 'var(--color-orange)',
  medium: 'var(--color-yellow)',
  low: 'var(--color-blue)',
  none: 'transparent',
};

interface Props {
  issue: Issue;
  onDragStart: (id: string) => void;
}

export function IssueCard({ issue, onDragStart }: Props) {
  return (
    <article
      draggable
      onDragStart={() => onDragStart(issue.id)}
      className="issue-card"
    >
      <div className="issue-card-top">
        <span className="issue-card-id" style={{ color: STATUS_COLORS[issue.status] }}>
          {issue.identifier}
        </span>
        {issue.priority !== 'none' && (
          <span className="issue-card-priority">
            <span
              className="priority-dot"
              style={{ background: PRIORITY_COLOR[issue.priority] }}
            />
            {PRIORITY_LABEL[issue.priority]}
          </span>
        )}
      </div>
      <div className="issue-card-title">
        <Link href={`/issues/${issue.id}`} onClick={(e) => e.stopPropagation()} draggable={false}>
          {issue.title}
        </Link>
      </div>
      {(issue.labels ?? []).length > 0 && (
        <div className="issue-card-labels">
          {(issue.labels ?? []).map((l) => (
            <span
              key={l.id}
              className="issue-label-chip issue-label-chip--sm"
              style={{ ['--label-color' as string]: l.color }}
              title={l.name}
            >
              <span className="issue-label-dot" />
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className="issue-card-assignee">
        {issue.assignee ? issue.assignee.label : '未指派'}
      </div>
    </article>
  );
}
