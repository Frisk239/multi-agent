import type { Issue, Assignee } from '@ma/shared';
import type { issues } from '../db/schema.js';
import { resolveAssigneeLabel } from './client.js';

type IssueRow = typeof issues.$inferSelect;

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
