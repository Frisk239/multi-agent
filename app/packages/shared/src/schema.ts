import { z } from 'zod';

// —— BusinessId（S02 D11：业务 id 允许短串，不再强制 UUID）——
export const BusinessId = z.string().min(1);
export type BusinessId = z.infer<typeof BusinessId>;

// —— 枚举 ——
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

export const AuthorType = CreatorType; // member | agent
export type AuthorType = z.infer<typeof AuthorType>;

export const CommentType = z.enum(['comment', 'status_change']);
export type CommentType = z.infer<typeof CommentType>;

// —— Runtime / Run / RunMessage（S03 执行层契约）——
export const RuntimeId = z.enum(['claude-code', 'opencode', 'cursor']);
export type RuntimeId = z.infer<typeof RuntimeId>;

export const AgentRunStatus = z.enum([
  'queued', 'running', 'completed', 'failed', 'cancelled',
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

export const RunMessageKind = z.enum([
  'assistant', 'user', 'tool_start', 'tool_end', 'system',
]);
export type RunMessageKind = z.infer<typeof RunMessageKind>;

export const AgentRun = z.object({
  id: BusinessId,
  issueId: BusinessId,
  agentId: BusinessId,
  runtime: RuntimeId,
  status: AgentRunStatus,
  error: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  // S04：squad-leader run 标记（照 multica 090/127 migration）
  isLeader: z.boolean().default(false),
  squadId: BusinessId.nullable(),
  createdAt: z.string().datetime(),
});
export type AgentRun = z.infer<typeof AgentRun>;

export const RunMessage = z.object({
  id: BusinessId,
  runId: BusinessId,
  seq: z.number().int(),
  kind: RunMessageKind,
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type RunMessage = z.infer<typeof RunMessage>;

export const RuntimeInfo = z.object({
  id: RuntimeId,
  label: z.string(),
  installed: z.boolean(),
  version: z.string().nullable(),
  path: z.string().nullable(),
  agentIds: z.array(BusinessId),
});
export type RuntimeInfo = z.infer<typeof RuntimeInfo>;

export const RuntimesResponse = z.object({
  machine: z.object({
    id: z.literal('machine-local'),
    name: z.string(),
    status: z.literal('online'),
    cwd: z.string().nullable(),
  }),
  runtimes: z.array(RuntimeInfo),
});
export type RuntimesResponse = z.infer<typeof RuntimesResponse>;

// —— 多态指派 ——
export const Assignee = z
  .object({
    type: AssigneeType,
    id: BusinessId,
    label: z.string(),
  })
  .nullable();
export type Assignee = z.infer<typeof Assignee>;

// —— Issue ——
export const Issue = z.object({
  id: BusinessId,
  workspaceId: BusinessId,
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: IssueStatus,
  priority: Priority,
  assignee: Assignee,
  creatorType: CreatorType,
  creatorId: BusinessId,
  position: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Issue = z.infer<typeof Issue>;

export const CreateIssueInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: Priority.optional().default('none'),
  assignee: z
    .object({
      type: AssigneeType,
      id: BusinessId,
    })
    .nullable()
    .optional()
    .default(null),
});
export type CreateIssueInput = z.infer<typeof CreateIssueInput>;

export const UpdateIssueInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: IssueStatus.optional(),
  priority: Priority.optional(),
  position: z.number().optional(),
  // S03：放开 assignee（与 Create 同形，无 label；GET 时服务端填 label）
  assignee: z
    .object({ type: AssigneeType, id: BusinessId })
    .nullable()
    .optional(),
});
export type UpdateIssueInput = z.infer<typeof UpdateIssueInput>;

export function validateUpdateIssue(d: UpdateIssueInput): boolean {
  return (
    d.title !== undefined ||
    d.description !== undefined ||
    d.status !== undefined ||
    d.priority !== undefined ||
    d.position !== undefined ||
    d.assignee !== undefined
  );
}

// —— Comment / Timeline ——
export const StatusChangeBody = z.object({
  from: IssueStatus,
  to: IssueStatus,
});
export type StatusChangeBody = z.infer<typeof StatusChangeBody>;

export const Comment = z.object({
  id: BusinessId,
  issueId: BusinessId,
  type: CommentType,
  authorType: AuthorType,
  authorId: BusinessId,
  authorLabel: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type Comment = z.infer<typeof Comment>;
export type TimelineItem = Comment;

export const CreateCommentInput = z.object({
  body: z.string().min(1),
});
export type CreateCommentInput = z.infer<typeof CreateCommentInput>;

export const AgentSummary = z.object({
  id: BusinessId,
  name: z.string(),
  runtime: RuntimeId,
});
export type AgentSummary = z.infer<typeof AgentSummary>;

export const SquadSummary = z.object({
  id: BusinessId,
  name: z.string(),
});
export type SquadSummary = z.infer<typeof SquadSummary>;

// S04：squad 详情契约（briefing 组装 + 前端小队详情用）
export const SquadMember = z.object({
  agentId: BusinessId,
  name: z.string(),
});
export type SquadMember = z.infer<typeof SquadMember>;

export const SquadDetail = z.object({
  id: BusinessId,
  name: z.string(),
  leaderId: BusinessId,
  operatingProtocol: z.string(),
  missionDirective: z.string(),
  members: z.array(SquadMember),
});
export type SquadDetail = z.infer<typeof SquadDetail>;

// —— WS 事件 ——
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

export const CommentCreatedEvent = z.object({
  type: z.literal('comment:created'),
  comment: Comment,
});
export type CommentCreatedEvent = z.infer<typeof CommentCreatedEvent>;

// —— Run 生命周期 / 进度 / 消息 事件（S03）——
export const RunLifecycleEvent = z.object({
  type: z.enum([
    'run:queued',
    'run:running',
    'run:completed',
    'run:failed',
    'run:cancelled',
  ]),
  run: AgentRun,
});
export type RunLifecycleEvent = z.infer<typeof RunLifecycleEvent>;

export const RunProgressEvent = z.object({
  type: z.literal('run:progress'),
  runId: BusinessId,
  issueId: BusinessId,
  text: z.string(),
});
export type RunProgressEvent = z.infer<typeof RunProgressEvent>;

export const RunMessageEvent = z.object({
  type: z.literal('run:message'),
  message: RunMessage,
  issueId: BusinessId,
});
export type RunMessageEvent = z.infer<typeof RunMessageEvent>;

export type DomainEvent =
  | IssueCreatedEvent
  | IssueUpdatedEvent
  | CommentCreatedEvent
  | RunLifecycleEvent
  | RunProgressEvent
  | RunMessageEvent;
