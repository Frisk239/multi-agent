import type { AgentReadiness, Issue, IssueStatus } from '@ma/shared';
import { IssueCard } from './IssueCard';

interface Props {
  title: string;
  status: IssueStatus;
  color: string;
  issues: Issue[];
  onDragStart: (id: string) => void;
  onDrop: (status: IssueStatus) => void;
  readinessByAgentId?: Record<string, AgentReadiness | null>;
  failedIssueIds?: Set<string>;
  /** queued/running run 覆盖的 issue */
  activeIssueIds?: Set<string>;
  /** issueId → agentId（用于 squad 时已解析为 leader） */
  assigneeAgentByIssueId?: Record<string, string | undefined>;
}

/**
 * Multica board-column：列 tint 背景 + 标题计数 + 空列「无 issue」
 * 参考 references/repos/multica/packages/views/issues/components/board-column.tsx
 */
export function KanbanColumn({
  title,
  color,
  issues,
  onDragStart,
  onDrop,
  status,
  readinessByAgentId,
  failedIssueIds,
  activeIssueIds,
  assigneeAgentByIssueId,
}: Props) {
  return (
    <section
      className="kanban-column"
      data-status={status}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(status);
      }}
    >
      <header className="kanban-column-header">
        <div className="kanban-column-heading">
          <span className="kanban-column-dot" style={{ background: color }} />
          <strong className="kanban-column-title">{title}</strong>
          <span className="kanban-column-count">{issues.length}</span>
        </div>
        <div className="kanban-column-actions">
          <a
            href={`/?status=${encodeURIComponent(status)}`}
            className="kanban-column-focus"
            data-testid="kanban-column-focus"
            data-status={status}
            title={`仅显示 ${title} 列`}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            聚焦
          </a>
        </div>
      </header>
      <div className="kanban-column-body">
        {issues.length === 0 ? (
          <div className="kanban-column-empty" data-testid="kanban-column-empty">
            无 issue
          </div>
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
                runActive={activeIssueIds?.has(iss.id)}
              />
            );
          })
        )}
      </div>
    </section>
  );
}
