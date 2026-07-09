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
  urgent: '🔴 紧急',
  high: '🟠 高',
  medium: '🟡 中',
  low: '🔵 低',
  none: '',
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
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        cursor: 'grab',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
        <span style={{ color: STATUS_COLORS[issue.status], fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
          {issue.identifier}
        </span>
        {issue.priority !== 'none' && (
          <span style={{ fontSize: 'var(--text-xs)' }}>{PRIORITY_LABEL[issue.priority]}</span>
        )}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
        <Link
          href={`/issues/${issue.id}`}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
          style={{ color: 'inherit', textDecoration: 'none' }}
        >
          {issue.title}
        </Link>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
        {issue.assignee ? `▸${issue.assignee.label}` : '▸未指派'}
      </div>
    </article>
  );
}
