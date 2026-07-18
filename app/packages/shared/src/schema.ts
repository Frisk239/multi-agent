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

// bu03：run 种类——issue 工作 run vs 无 Issue 的 quick_create
export const AgentRunKind = z.enum(['issue', 'quick_create']);
export type AgentRunKind = z.infer<typeof AgentRunKind>;

export const RunMessageKind = z.enum([
  'assistant', 'user', 'tool_start', 'tool_end', 'system',
]);
export type RunMessageKind = z.infer<typeof RunMessageKind>;

export const AgentRun = z.object({
  id: BusinessId,
  // bu03：quick_create 初始无 Issue，可空；Link 后回填
  issueId: BusinessId.nullable(),
  agentId: BusinessId,
  runtime: RuntimeId,
  status: AgentRunStatus,
  // bu03：issue | quick_create
  kind: AgentRunKind.default('issue'),
  // bu03：仅 quick_create 使用；issue run 为 null
  quickPrompt: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  // bu01：执行中 heartbeat；stale sweeper / orphan 恢复用
  lastHeartbeatAt: z.string().datetime().nullable(),
  // S04：squad-leader run 标记（照 multica 090/127 migration）
  isLeader: z.boolean().default(false),
  squadId: BusinessId.nullable(),
  // run-observability：人工 rerun 血缘（学 Multica rerun_of_task_id）；无则 null
  rerunOfRunId: BusinessId.nullable().optional(),
  createdAt: z.string().datetime(),
});
export type AgentRun = z.infer<typeof AgentRun>;

// run-observability + runs-leader：GET /api/runs 查询（issueId 可选）
// runs-active-nav：status=active 表示 queued|running（侧栏在途）
export const ListRunsStatus = z.union([AgentRunStatus, z.literal('active')]);
export type ListRunsStatus = z.infer<typeof ListRunsStatus>;

export const ListRunsQuery = z.object({
  issueId: BusinessId.optional(),
  agentId: BusinessId.optional(),
  // squad-runs-timeline：按小队过滤 leader/member run
  squadId: BusinessId.optional(),
  status: ListRunsStatus.optional(),
  kind: AgentRunKind.optional(),
  // isLeader=1|true：仅小队 leader run（对齐 Multica leader task 列表）
  isLeader: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});
export type ListRunsQuery = z.infer<typeof ListRunsQuery>;

// GET /api/runs/active-count —— 侧栏「运行」角标
export const RunsActiveCount = z.object({
  count: z.number().int(),
  queued: z.number().int(),
  running: z.number().int(),
});
export type RunsActiveCount = z.infer<typeof RunsActiveCount>;

// run-observability：POST /api/issues/:id/rerun body（Multica task_id → runId）
export const RerunIssueInput = z.object({
  runId: BusinessId.optional(),
});
export type RerunIssueInput = z.infer<typeof RerunIssueInput>;

export const RunFailureCode = z.enum([
  'cwd_missing',
  'cli_missing',
  'stale_or_orphan',
  'generic',
]);
export type RunFailureCode = z.infer<typeof RunFailureCode>;

export const RunFailureClassification = z.object({
  code: RunFailureCode,
  title: z.string(),
  hint: z.string(),
  settingsHref: z.string().nullable(),
});
export type RunFailureClassification = z.infer<typeof RunFailureClassification>;

/** 轻量失败分类（S4）：只看 error 文本，无 DB */
export function classifyRunFailure(error: string | null | undefined): RunFailureClassification {
  const e = (error ?? '').trim();
  const lower = e.toLowerCase();
  if (/ma_workspace_cwd|未配置\s*ma_workspace_cwd|workspace_cwd/i.test(e)) {
    return {
      code: 'cwd_missing',
      title: '工作区目录未配置',
      hint: '在启动 server 的环境中设置 MA_WORKSPACE_CWD 为项目根目录后，再执行。',
      settingsHref: '/settings',
    };
  }
  if (
    /cli 未安装|未安装|runtime.?missing|not found|enoent|command not found/i.test(e) ||
    (lower.includes('cli') && lower.includes('missing'))
  ) {
    return {
      code: 'cli_missing',
      title: '运行时 CLI 不可用',
      hint: '检查本机 Claude Code / opencode / Cursor 是否在 PATH，或到运行时页确认探测结果。',
      settingsHref: '/runtimes',
    };
  }
  if (/^stale:|^orphan:|heartbeat timeout|no live executor/i.test(e)) {
    return {
      code: 'stale_or_orphan',
      title: '执行中断或进程丢失',
      hint: '服务重启或心跳超时导致失败。环境正常后可「再执行」。',
      settingsHref: '/settings',
    };
  }
  return {
    code: 'generic',
    title: '运行失败',
    hint: e || '无详细错误信息。可复制错误或到设置页检查环境后重试。',
    settingsHref: '/settings',
  };
}

export const WikiIngestFailureCode = z.enum(['key_missing', 'generic']);
export type WikiIngestFailureCode = z.infer<typeof WikiIngestFailureCode>;

export const WikiIngestFailureClassification = z.object({
  code: WikiIngestFailureCode,
  title: z.string(),
  hint: z.string(),
  settingsHref: z.string().nullable(),
});
export type WikiIngestFailureClassification = z.infer<typeof WikiIngestFailureClassification>;

/** Wiki ingest 失败分类：只看 lastError 文本 */
export function classifyWikiIngestFailure(
  error: string | null | undefined,
): WikiIngestFailureClassification {
  const e = (error ?? '').trim();
  if (/WIKI_LLM_API_KEY|api.?key|未配置.*key|llm.*未配置|missing.*key/i.test(e)) {
    return {
      code: 'key_missing',
      title: 'Wiki LLM 未配置或密钥无效',
      hint: '在 server 环境配置 WIKI_LLM_API_KEY（及可选 base/model）后，到设置页确认就绪，再对 dead job 点「重试」。',
      settingsHref: '/settings',
    };
  }
  return {
    code: 'generic',
    title: 'Wiki 编译失败',
    hint: e || '无详细错误。可到设置页检查 Wiki LLM，或稍后重试该 job。',
    settingsHref: '/settings',
  };
}

// bu03：快速派活入参 / 出参
export const CreateQuickRunInput = z.object({
  prompt: z.string().min(1).max(20000),
  assignee: z.object({
    type: z.enum(['agent', 'squad']),
    id: BusinessId,
  }),
});
export type CreateQuickRunInput = z.infer<typeof CreateQuickRunInput>;

export const CreateQuickRunResult = z.object({
  run: AgentRun,
});
export type CreateQuickRunResult = z.infer<typeof CreateQuickRunResult>;

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

// —— IssueLabel（issue-labels：工作区标签目录）——
export const LabelColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color 须为 #RRGGBB')
  .default('#6b7280');
export type LabelColor = z.infer<typeof LabelColor>;

export const IssueLabel = z.object({
  id: BusinessId,
  workspaceId: BusinessId,
  name: z.string().min(1).max(40),
  color: z.string(),
  // issue-find：软归档；null=活跃
  archivedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type IssueLabel = z.infer<typeof IssueLabel>;

export const CreateIssueLabelInput = z.object({
  name: z.string().min(1).max(40),
  color: LabelColor.optional(),
});
export type CreateIssueLabelInput = z.infer<typeof CreateIssueLabelInput>;

export const UpdateIssueLabelInput = z
  .object({
    name: z.string().min(1).max(40).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'color 须为 #RRGGBB')
      .optional(),
  })
  .refine((o) => o.name !== undefined || o.color !== undefined, {
    message: '至少传一个字段',
  });
export type UpdateIssueLabelInput = z.infer<typeof UpdateIssueLabelInput>;

export const SetIssueLabelsInput = z.object({
  labelIds: z.array(BusinessId),
});
export type SetIssueLabelsInput = z.infer<typeof SetIssueLabelsInput>;

// issue-find + issue-assignee-desk：GET /api/issues 查询
const QueryBool = z.union([
  z.literal('1'),
  z.literal('true'),
  z.literal('0'),
  z.literal('false'),
]);

export const ListIssuesQuery = z
  .object({
    q: z.string().optional(),
    labelId: BusinessId.optional(),
    status: IssueStatus.optional(),
    // board-priority-triage：单值优先级
    priority: Priority.optional(),
    // board-origin-filter：automation | quick_create
    originType: z.enum(['quick_create', 'automation']).optional(),
    // 具体指派：须成对
    assigneeType: z.enum(['agent', 'squad']).optional(),
    assigneeId: BusinessId.optional(),
    // unassigned=1：仅未指派；assigned=1：任一 agent/squad
    unassigned: QueryBool.optional(),
    assigned: QueryBool.optional(),
  })
  .superRefine((data, ctx) => {
    const hasType = data.assigneeType != null;
    const hasId = data.assigneeId != null;
    if (hasType !== hasId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'assigneeType 与 assigneeId 须成对传入',
        path: hasType ? ['assigneeId'] : ['assigneeType'],
      });
    }
    const unassignedOn = data.unassigned === '1' || data.unassigned === 'true';
    const assignedOn = data.assigned === '1' || data.assigned === 'true';
    if (unassignedOn && (hasType || hasId || assignedOn)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'unassigned 与 assignee/assigned 互斥',
        path: ['unassigned'],
      });
    }
    if (assignedOn && (hasType || hasId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'assigned 与具体 assignee 互斥',
        path: ['assigned'],
      });
    }
  });
export type ListIssuesQuery = z.infer<typeof ListIssuesQuery>;

// issue-find：GET /api/labels?includeArchived=1
export const ListLabelsQuery = z.object({
  includeArchived: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .optional(),
});
export type ListLabelsQuery = z.infer<typeof ListLabelsQuery>;

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
  // bu03/bu05：溯源（快速派活 / 自动化建卡）
  originType: z.enum(['quick_create', 'automation']).nullable().optional(),
  originRunId: BusinessId.nullable().optional(),
  originRuleId: BusinessId.nullable().optional(),
  // issue-labels：list/detail 始终带数组（可空）
  labels: z.array(IssueLabel).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Issue = z.infer<typeof Issue>;

export const CreateIssueInput = z
  .object({
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
    // bu03：agent/CLI 建卡回链 QC run；bu05：automation 用 originRuleId
    originType: z.enum(['quick_create', 'automation']).optional(),
    originRunId: BusinessId.optional(),
    originRuleId: BusinessId.optional(),
  })
  .superRefine((o, ctx) => {
    if (o.originType === 'quick_create') {
      if (!o.originRunId) {
        ctx.addIssue({
          code: 'custom',
          message: 'originType=quick_create 时 originRunId 必填',
          path: ['originRunId'],
        });
      }
    } else if (o.originType === 'automation') {
      if (!o.originRuleId) {
        ctx.addIssue({
          code: 'custom',
          message: 'originType=automation 时 originRuleId 必填',
          path: ['originRuleId'],
        });
      }
    } else if (o.originRunId !== undefined || o.originRuleId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: '提供 originRunId/originRuleId 时必须同时提供 originType',
        path: ['originType'],
      });
    }
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
  // bu02：列表可选展示 category
  category: z.string().nullable().optional(),
});
export type AgentSummary = z.infer<typeof AgentSummary>;

// S05：单 agent 详情契约（GET /api/agents/:id，agent 详情页用）
// AgentSummary 扩展：含 category/concurrency（profile 展示）+ mcpServers（MCP Tab 回填）
// bu02：+ instructions（执行 prompt 注入）
export const AgentDetail = AgentSummary.extend({
  category: z.string().nullable(),
  concurrency: z.number(),
  mcpServers: z.string().nullable(),
  instructions: z.string(),
});
export type AgentDetail = z.infer<typeof AgentDetail>;

// bu02：Agent 创建/更新（运营 CRUD）
const OptionalClientId = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{1,63}$/);

export const CreateAgentInput = z.object({
  name: z.string().min(1).max(80),
  runtime: RuntimeId,
  category: z.string().max(80).optional().nullable(),
  concurrency: z.number().int().min(1).max(8).optional().default(1),
  instructions: z.string().max(20000).optional().default(''),
  mcpServers: z.string().nullable().optional(),
  id: OptionalClientId.optional(),
});
export type CreateAgentInput = z.infer<typeof CreateAgentInput>;

export const UpdateAgentInput = z
  .object({
    name: z.string().min(1).max(80).optional(),
    runtime: RuntimeId.optional(),
    category: z.string().max(80).nullable().optional(),
    concurrency: z.number().int().min(1).max(8).optional(),
    instructions: z.string().max(20000).optional(),
    mcpServers: z.string().nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'empty patch' });
export type UpdateAgentInput = z.infer<typeof UpdateAgentInput>;

// bu02：Agent readiness（runtime detect + 并发槽）
export const AgentReadiness = z.object({
  agentId: BusinessId,
  runtime: RuntimeId,
  runtimeInstalled: z.boolean(),
  runtimePath: z.string().nullable(),
  runtimeVersion: z.string().nullable(),
  concurrency: z.number().int(),
  runningCount: z.number().int(),
  slotsAvailable: z.number().int(),
  cwdConfigured: z.boolean(),
  status: z.enum(['ready', 'busy', 'runtime_missing', 'cwd_missing', 'error']),
  detail: z.string().nullable(),
});
export type AgentReadiness = z.infer<typeof AgentReadiness>;

// S05：skill 列表项契约（GET /api/skills 响应元素，spec §4.1/§4.2）
// skill 本身是文件系统真源 + 内存索引（不进 DB）；usedBy 反查 agent_skill 分配关系
export const SkillInfo = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(['project', 'user']),
  usedBy: z.array(AgentSummary),
});
export type SkillInfo = z.infer<typeof SkillInfo>;

export const SquadSummary = z.object({
  id: BusinessId,
  name: z.string(),
  // bu02：列表展示 leader + 成员数
  leaderId: BusinessId.optional(),
  memberCount: z.number().int().optional(),
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

// bu02：Squad 创建/更新（运营 CRUD）
export const CreateSquadInput = z.object({
  name: z.string().min(1).max(80),
  leaderId: BusinessId,
  operatingProtocol: z.string().max(50000).optional().default(''),
  missionDirective: z.string().max(50000).optional().default(''),
  memberIds: z.array(BusinessId).default([]),
  id: OptionalClientId.optional(),
});
export type CreateSquadInput = z.infer<typeof CreateSquadInput>;

export const UpdateSquadInput = z
  .object({
    name: z.string().min(1).max(80).optional(),
    leaderId: BusinessId.optional(),
    operatingProtocol: z.string().max(50000).optional(),
    missionDirective: z.string().max(50000).optional(),
    memberIds: z.array(BusinessId).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'empty patch' });
export type UpdateSquadInput = z.infer<typeof UpdateSquadInput>;

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

// —— S06：Wiki 契约 ——
// Wiki 页（文件系统 markdown，spec §5）：slug 不含 .md，content 是完整 markdown
export const WikiPage = z.object({
  slug: z.string(),
  title: z.string(),
  content: z.string(),
});
export type WikiPage = z.infer<typeof WikiPage>;

// Wiki 页摘要（列表用，spec §5）：GET /api/wiki/pages 返回元素
export const WikiPageSummary = z.object({
  slug: z.string(),
  title: z.string(),
});
export type WikiPageSummary = z.infer<typeof WikiPageSummary>;

// Wiki 页创建事件（WS 推前端，spec §5）：ingest 完成后由 eventBus 广播
export const WikiPageCreatedEvent = z.object({
  type: z.literal('wiki:page-created'),
  slug: z.string(),
  title: z.string(),
});
export type WikiPageCreatedEvent = z.infer<typeof WikiPageCreatedEvent>;

// —— S07：Wiki query / health / lint 契约 ——

// query 结果（spec §5.1）
export const WikiQueryResult = z.object({
  answer: z.string(),
  citations: z.array(z.object({
    slug: z.string(),
    title: z.string(),
  })),
});
export type WikiQueryResult = z.infer<typeof WikiQueryResult>;

export const WikiQueryInput = z.object({
  question: z.string().min(1),
});
export type WikiQueryInput = z.infer<typeof WikiQueryInput>;

// health 结构检查结果（spec §5.1）
export const WikiHealthResult = z.object({
  orphans: z.array(z.object({ slug: z.string(), title: z.string() })),
  brokenLinks: z.array(z.object({ from: z.string(), to: z.string() })),
  stubs: z.array(z.object({ slug: z.string(), title: z.string(), bodyChars: z.number() })),
  total: z.number(),
});
export type WikiHealthResult = z.infer<typeof WikiHealthResult>;

// lint 语义检查结果（spec §5.1）
export const WikiLintResult = z.object({
  report: z.string(),
  checkedPages: z.array(z.object({ slug: z.string(), title: z.string() })),
});
export type WikiLintResult = z.infer<typeof WikiLintResult>;

// 存回 wiki 页输入（spec §5.1）
export const CreateWikiPageInput = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});
export type CreateWikiPageInput = z.infer<typeof CreateWikiPageInput>;

// —— S08：Wiki ingest job + CLI envelope ——
export const WikiIngestJobStatus = z.enum([
  'pending', 'running', 'completed', 'failed', 'dead',
]);
export type WikiIngestJobStatus = z.infer<typeof WikiIngestJobStatus>;

export const WikiIngestJob = z.object({
  id: BusinessId,
  issueId: BusinessId,
  status: WikiIngestJobStatus,
  failCount: z.number().int(),
  maxRetries: z.number().int(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});
export type WikiIngestJob = z.infer<typeof WikiIngestJob>;

export const WikiCliEnvelope = z.object({
  ok: z.literal(true),
  status: z.enum(['success', 'partial']).default('success'),
  data: z.unknown().optional(),
  meta: z.record(z.unknown()).optional(),
});
export type WikiCliEnvelope = z.infer<typeof WikiCliEnvelope>;

export const WikiCliErrorEnvelope = z.object({
  ok: z.literal(false),
  error: z.object({
    type: z.string(),
    message: z.string(),
    exit_code: z.number().int(),
  }),
});
export type WikiCliErrorEnvelope = z.infer<typeof WikiCliErrorEnvelope>;

// —— bu01：Inbox 真源契约（impl-1 落 schema；impl-2 换真表 API）——
export const InboxItemType = z.enum([
  'comment',
  'run_completed',
  'run_failed',
  'assigned',
]);
export type InboxItemType = z.infer<typeof InboxItemType>;
/** @deprecated 兼容 S12 UI：kind === type */
export const InboxItemKind = InboxItemType;
export type InboxItemKind = InboxItemType;

export const InboxSeverity = z.enum(['action_required', 'attention', 'info']);
export type InboxSeverity = z.infer<typeof InboxSeverity>;

export const InboxItem = z.object({
  id: BusinessId,
  type: InboxItemType,
  kind: InboxItemType, // 与 type 相同，兼容 S12 UI
  severity: InboxSeverity,
  title: z.string(),
  body: z.string().nullable(),
  summary: z.string(), // title 或 title+body 截断，列表一行文案
  issueId: BusinessId.nullable(),
  /** run 终态通知可带；打开 Inbox → /runs?run= */
  runId: BusinessId.nullable().optional(),
  issueIdentifier: z.string().optional(),
  issueTitle: z.string().optional(),
  read: z.boolean(),
  archived: z.boolean(),
  createdAt: z.string().datetime(),
});
export type InboxItem = z.infer<typeof InboxItem>;

export const InboxListResponse = z.object({
  items: z.array(InboxItem),
  unreadCount: z.number().int().nonnegative(),
});
export type InboxListResponse = z.infer<typeof InboxListResponse>;

/** POST /api/inbox/read-many — 批量已读（本地单人收件箱） */
export const MarkInboxReadManyInput = z.object({
  ids: z.array(BusinessId).min(1).max(200),
});
export type MarkInboxReadManyInput = z.infer<typeof MarkInboxReadManyInput>;

export const MarkInboxReadManyResponse = z.object({
  requested: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});
export type MarkInboxReadManyResponse = z.infer<typeof MarkInboxReadManyResponse>;

/** POST /api/inbox/archive-many — 批量归档 */
export const ArchiveInboxManyInput = z.object({
  ids: z.array(BusinessId).min(1).max(200),
});
export type ArchiveInboxManyInput = z.infer<typeof ArchiveInboxManyInput>;

export const ArchiveInboxManyResponse = z.object({
  requested: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
});
export type ArchiveInboxManyResponse = z.infer<typeof ArchiveInboxManyResponse>;

export const InboxItemEvent = z.object({
  type: z.literal('inbox:item'),
  item: InboxItem,
});
export type InboxItemEvent = z.infer<typeof InboxItemEvent>;

// —— S09：Memory ——
export const MemoryItem = z.object({
  id: BusinessId,
  scope: z.string(),
  issueId: BusinessId.nullable(),
  agentId: BusinessId.nullable(),
  runId: BusinessId.nullable(),
  text: z.string(),
  createdAt: z.string().datetime(),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

export const CreateMemoryInput = z.object({
  text: z.string().min(1),
  issueId: BusinessId.optional(),
});
export type CreateMemoryInput = z.infer<typeof CreateMemoryInput>;

export const MemoryStatus = z.object({
  provider: z.string().nullable(),
  available: z.boolean(),
});
export type MemoryStatus = z.infer<typeof MemoryStatus>;

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
  // bu03：quick_create 可无 issue
  issueId: BusinessId.nullable(),
  text: z.string(),
});
export type RunProgressEvent = z.infer<typeof RunProgressEvent>;

export const RunMessageEvent = z.object({
  type: z.literal('run:message'),
  message: RunMessage,
  // bu03：quick_create 可无 issue
  issueId: BusinessId.nullable(),
});
export type RunMessageEvent = z.infer<typeof RunMessageEvent>;

export type DomainEvent =
  | IssueCreatedEvent
  | IssueUpdatedEvent
  | CommentCreatedEvent
  | RunLifecycleEvent
  | RunProgressEvent
  | RunMessageEvent
  | WikiPageCreatedEvent
  | InboxItemEvent;

// —— bu04：Settings / 环境诊断（G0 只读）——
export const SettingsCheckStatus = z.enum(['ok', 'warn', 'error']);
export type SettingsCheckStatus = z.infer<typeof SettingsCheckStatus>;

export const SettingsOverall = z.enum(['ok', 'degraded', 'blocked']);
export type SettingsOverall = z.infer<typeof SettingsOverall>;

export const SettingsCheck = z.object({
  id: z.string(),
  label: z.string(),
  status: SettingsCheckStatus,
  detail: z.string().nullable(),
  hint: z.string().nullable().optional(),
  href: z.string().nullable().optional(),
});
export type SettingsCheck = z.infer<typeof SettingsCheck>;

export const SettingsStatusResponse = z.object({
  overall: SettingsOverall,
  summary: z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }),
  checks: z.array(SettingsCheck),
  secrets: z.object({
    wikiLlmConfigured: z.boolean(),
    embeddingConfigured: z.boolean(),
  }),
  server: z.object({
    port: z.number().int().optional(),
  }),
});
export type SettingsStatusResponse = z.infer<typeof SettingsStatusResponse>;

// —— bu05：最小自动化（schedule + run-now）——
export const AutomationScheduleKind = z.enum(['interval_minutes', 'daily_at']);
export type AutomationScheduleKind = z.infer<typeof AutomationScheduleKind>;

export const AutomationRunSource = z.enum(['schedule', 'manual']);
export type AutomationRunSource = z.infer<typeof AutomationRunSource>;

export const AutomationRunStatus = z.enum(['success', 'failed', 'skipped']);
export type AutomationRunStatus = z.infer<typeof AutomationRunStatus>;

export const AutomationRule = z.object({
  id: BusinessId,
  name: z.string(),
  enabled: z.boolean(),
  scheduleKind: AutomationScheduleKind,
  intervalMinutes: z.number().int().nullable(),
  dailyTime: z.string().nullable(), // "HH:mm"
  assigneeType: z.enum(['agent', 'squad']),
  assigneeId: BusinessId,
  titleTemplate: z.string(),
  bodyTemplate: z.string(),
  lastPlannedAt: z.string().datetime().nullable(),
  // automation-next-run：下次计划时刻（只读计算字段；disabled → null）
  nextPlannedAt: z.string().datetime().nullable(),
  // automation-fail-counts：执行记录聚合（list/get 附带；无记录为 0/null）
  failCount: z.number().int().nonnegative().default(0),
  lastRunStatus: AutomationRunStatus.nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AutomationRule = z.infer<typeof AutomationRule>;

const CreateAutomationRuleFields = z.object({
  name: z.string().min(1).max(80),
  enabled: z.boolean().optional().default(true),
  scheduleKind: AutomationScheduleKind,
  intervalMinutes: z
    .union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)])
    .optional()
    .nullable(),
  dailyTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
  assigneeType: z.enum(['agent', 'squad']),
  assigneeId: BusinessId,
  titleTemplate: z.string().min(1).max(200),
  bodyTemplate: z.string().max(10000).optional().default(''),
});

export const CreateAutomationRuleInput = CreateAutomationRuleFields.superRefine((v, ctx) => {
  if (v.scheduleKind === 'interval_minutes') {
    if (v.intervalMinutes == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'interval_minutes required',
        path: ['intervalMinutes'],
      });
    }
  } else if (!v.dailyTime) {
    ctx.addIssue({
      code: 'custom',
      message: 'dailyTime required',
      path: ['dailyTime'],
    });
  }
});
export type CreateAutomationRuleInput = z.infer<typeof CreateAutomationRuleInput>;

export const UpdateAutomationRuleInput = CreateAutomationRuleFields.partial()
  .refine((o) => Object.keys(o).length > 0, { message: 'empty patch' })
  .superRefine((v, ctx) => {
    // partial 更新：仅当显式改 scheduleKind 时做字段齐全校验；
    // 路由层还会与 prev 合并后二次校验
    if (v.scheduleKind === 'interval_minutes' && v.intervalMinutes === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'interval_minutes required',
        path: ['intervalMinutes'],
      });
    }
    if (v.scheduleKind === 'daily_at' && v.dailyTime === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'dailyTime required',
        path: ['dailyTime'],
      });
    }
  });
export type UpdateAutomationRuleInput = z.infer<typeof UpdateAutomationRuleInput>;

export const AutomationRun = z.object({
  id: BusinessId,
  ruleId: BusinessId,
  plannedAt: z.string().datetime(),
  source: AutomationRunSource,
  status: AutomationRunStatus,
  issueId: BusinessId.nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AutomationRun = z.infer<typeof AutomationRun>;
