import type { AgentReadiness, Issue, IssueStatus } from '@ma/shared';
import { IssueCard } from './IssueCard';
import { EmptyState } from './EmptyState';

interface Props {
  title: string;
  status: IssueStatus;
  color: string;
  issues: Issue[];
  onDragStart: (id: string) => void;
  onDrop: (status: IssueStatus) => void;
  readinessByAgentId?: Record<string, AgentReadiness | null>;
  failedIssueIds?: Set<string>;
  /** issueId → agentId（用于 squad 时已解析为 leader） */
  assigneeAgentByIssueId?: Record<string, string | undefined>;
}

export function KanbanColumn({
  title,
  color,
  issues,
  onDragStart,
  onDrop,
  status,
  readinessByAgentId,
  failedIssueIds,
  assigneeAgentByIssueId,
}: Props) {
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
      {issues.length === 0 ? (
        <EmptyState title="暂无 issue" description="拖入或新建" className="empty-state--column" />
      ) : (
        issues.map((iss) => {
          const agentId = assigneeAgentByIssueId?.[iss.id];
          const rd = agentId ? readinessByAgentId?.[agentId] : null;
          return (
            <IssueCard
              key={iss.id}
              issue={iss}
              onDragStart={onDragStart}
              readiness={rd}
              lastRunFailed={failedIssueIds?.has(iss.id)}
            />
          );
        })
      )}
    </section>
  );
}
