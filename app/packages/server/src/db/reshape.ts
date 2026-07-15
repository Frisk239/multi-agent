import type { Issue, Assignee, Comment, AgentRun, RunMessage } from '@ma/shared';
import { issues, comments, agentRuns, runMessages } from './schema.js';
import { resolveAssigneeLabel, resolveAuthorLabel } from './client.js';

type IssueRow = typeof issues.$inferSelect;
type CommentRow = typeof comments.$inferSelect;
type RunRow = typeof agentRuns.$inferSelect;
type MsgRow = typeof runMessages.$inferSelect;

// DB 扁平行 → API 嵌套 Issue（spec §3.3 + §4.2 R2 label）
export function toIssue(row: IssueRow): Issue {
  let assignee: Assignee = null;
  if (row.assigneeType && row.assigneeId) {
    const label = resolveAssigneeLabel(row.assigneeType, row.assigneeId);
    assignee = { type: row.assigneeType, id: row.assigneeId, label: label ?? '未知' };
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee,
    creatorType: row.creatorType,
    creatorId: row.creatorId,
    position: row.position,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function toComment(row: CommentRow): Comment {
  return {
    id: row.id,
    issueId: row.issueId,
    type: row.type,
    authorType: row.authorType,
    authorId: row.authorId,
    authorLabel: resolveAuthorLabel(row.authorType, row.authorId),
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

// ms → ISO 字符串；null 保持 null（对齐 AgentRun.startedAt/finishedAt 的 datetime().nullable()）
function iso(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}

// DB 扁平行 → API AgentRun（S03 执行层）
export function toAgentRun(row: RunRow): AgentRun {
  return {
    id: row.id,
    issueId: row.issueId,
    agentId: row.agentId,
    runtime: row.runtime,
    status: row.status,
    error: row.error,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

// DB 扁平行 → API RunMessage（S03 执行轨迹）
export function toRunMessage(row: MsgRow): RunMessage {
  return {
    id: row.id,
    runId: row.runId,
    seq: row.seq,
    kind: row.kind,
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}
