import { z } from 'zod';

// —— 枚举（spec §4.1）——
export const IssueStatus = z.enum([
  'backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled',
]);
export type IssueStatus = z.infer<typeof IssueStatus>;

export const Priority = z.enum(['urgent', 'high', 'medium', 'low', 'none']);
export type Priority = z.infer<typeof Priority>;

export const AssigneeType = z.enum(['member', 'agent', 'squad']);
export type AssigneeType = z.infer<typeof AssigneeType>;

export const CreatorType = z.enum(['member', 'agent']);
export type CreatorType = z.infer<typeof CreatorType>;

// —— 多态指派（spec §4.2，含 R2 label 修订）——
// label 是展示用冗余字段，服务端 GET 时填充；POST/PUT 输入不接受 label
export const Assignee = z
  .object({
    type: AssigneeType,
    id: z.string().uuid(),
    label: z.string(),
  })
  .nullable();
export type Assignee = z.infer<typeof Assignee>;

// —— Issue 实体（spec §4.3）——
export const Issue = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: IssueStatus,
  priority: Priority,
  assignee: Assignee,
  creatorType: CreatorType,
  creatorId: z.string().uuid(),
  position: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Issue = z.infer<typeof Issue>;

// —— API 输入（spec §4.4）——
export const CreateIssueInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: Priority.optional().default('none'),
  assignee: z
    .object({
      type: AssigneeType,
      id: z.string().uuid(),
    })
    .nullable()
    .optional()
    .default(null),
  // 注意：CreateIssueInput 的 assignee 输入不带 label（服务端权威填充）
  // status 不接受——新建恒 backlog
  // identifier 不接受——服务端生成
});
export type CreateIssueInput = z.infer<typeof CreateIssueInput>;

export const UpdateIssueInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: IssueStatus.optional(),
  priority: Priority.optional(),
  position: z.number().optional(),
  // assignee S01 不允许改（拖拽不改指派）—— spec D 偏离，放开留给 S02+
});
export type UpdateIssueInput = z.infer<typeof UpdateIssueInput>;

// R1 修订：refine 改显式字段校验，避免 Object.keys 歧义
// 用法：UpdateIssueInput.parse(body) 后调 validateUpdateIssue，false 则 400
export function validateUpdateIssue(d: UpdateIssueInput): boolean {
  return (
    d.title !== undefined ||
    d.description !== undefined ||
    d.status !== undefined ||
    d.priority !== undefined ||
    d.position !== undefined
  );
}

// —— WS 事件（spec §4.5）——
export const IssueCreatedEvent = z.object({
  type: z.literal('issue:created'),
  issue: Issue,
});
export type IssueCreatedEvent = z.infer<typeof IssueCreatedEvent>;

export const IssueUpdatedEvent = z.object({
  type: z.literal('issue:updated'),
  issue: Issue,
  statusChanged: z.boolean(),
  prevStatus: IssueStatus.nullable(),
});
export type IssueUpdatedEvent = z.infer<typeof IssueUpdatedEvent>;

export type DomainEvent = IssueCreatedEvent | IssueUpdatedEvent;
