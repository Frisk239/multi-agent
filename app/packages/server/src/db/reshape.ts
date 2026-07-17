import type {
  Issue,
  Assignee,
  Comment,
  AgentRun,
  RunMessage,
  InboxItem,
  AgentDetail,
  AgentSummary,
} from '@ma/shared';
import { issues, comments, agentRuns, runMessages, inboxItems, agents } from './schema.js';
import { resolveAssigneeLabel, resolveAuthorLabel } from './client.js';

type IssueRow = typeof issues.$inferSelect;
type CommentRow = typeof comments.$inferSelect;
type RunRow = typeof agentRuns.$inferSelect;
type MsgRow = typeof runMessages.$inferSelect;
type InboxRow = typeof inboxItems.$inferSelect;
type AgentRow = typeof agents.$inferSelect;

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
// S04：映射 isLeader（integer 0/1 → boolean）+ squadId
// bu01：lastHeartbeatAt
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
    lastHeartbeatAt: iso(row.lastHeartbeatAt),
    isLeader: row.isLeader === 1,
    squadId: row.squadId,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function truncSummary(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

// bu01：DB inbox_item → API InboxItem（impl-2 writer/routes 用）
export function toInboxItem(
  row: InboxRow,
  issueMeta?: { identifier: string; title: string },
): InboxItem {
  const body = row.body ?? null;
  const summary = body
    ? `${row.title}: ${truncSummary(body, 100)}`
    : row.title;
  return {
    id: row.id,
    type: row.type,
    kind: row.type,
    severity: row.severity,
    title: row.title,
    body,
    summary,
    issueId: row.issueId,
    issueIdentifier: issueMeta?.identifier,
    issueTitle: issueMeta?.title,
    read: row.read === 1,
    archived: row.archived === 1,
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

// bu02：DB agent → API AgentSummary / AgentDetail
export function toAgentSummary(row: AgentRow): AgentSummary {
  return {
    id: row.id,
    name: row.name,
    runtime: row.runtime,
    category: row.category ?? null,
  };
}

export function toAgentDetail(row: AgentRow): AgentDetail {
  return {
    id: row.id,
    name: row.name,
    runtime: row.runtime,
    category: row.category ?? null,
    concurrency: row.concurrency,
    mcpServers: row.mcpServers ?? null,
    instructions: row.instructions ?? '',
  };
}
