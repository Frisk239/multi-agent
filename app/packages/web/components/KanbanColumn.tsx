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
      className="kanban-column"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(status);
      }}
    >
      <header className="kanban-column-header">
        <span className="kanban-column-dot" style={{ background: color }} />
        <strong>{title}</strong>
        <span className="kanban-column-count">{issues.length}</span>
      </header>
      {issues.map((iss) => (
        <IssueCard key={iss.id} issue={iss} onDragStart={onDragStart} />
      ))}
    </section>
  );
}
