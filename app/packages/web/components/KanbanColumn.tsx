import type { Issue, IssueStatus } from '@ma/shared';
import { IssueCard } from './IssueCard';

interface Props {
  title: string;
  status: IssueStatus;
  color: string;
  issues: Issue[];
  onDragStart: (id: string) => void;
  onDrop: (status: IssueStatus) => void;
}

export function KanbanColumn({ title, color, issues, onDragStart, onDrop, status }: Props) {
  return (
    <section
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(status);
      }}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        width: '260px',
        minHeight: '400px',
        padding: 'var(--space-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <strong>{title}</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{issues.length}</span>
      </header>
      {issues.map((iss) => (
        <IssueCard key={iss.id} issue={iss} onDragStart={onDragStart} />
      ))}
    </section>
  );
}
