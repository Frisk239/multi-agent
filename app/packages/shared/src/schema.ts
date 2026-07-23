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
/** 本机 CLI 适配器 id；grok = xAI Grok Build CLI（学 Multica server/pkg/agent/grok.go） */
export const RuntimeId = z.enum(['claude-code', 'opencode', 'cursor', 'grok']);
export type RuntimeId = z.infer<typeof RuntimeId>;

export const AgentRunStatus = z.enum([
  'queued',
  'waiting_local_directory',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

// bu03：run 种类——issue 工作 run vs 无 Issue 的 quick_create；agent-chat 增加 chat
export const AgentRunKind = z.enum(['issue', 'quick_create', 'chat']);
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
  // bu03 / agent-chat：issue | quick_create | chat
  kind: AgentRunKind.default('issue'),
  // bu03 / chat：quick_create|chat 使用；issue run 为 null
  quickPrompt: z.string().nullable(),
  chatThreadId: BusinessId.nullable().optional(),
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
  // A2 UX Trust：CLI 工作目录审计（resolve-run-cwd）
  cwdPath: z.string().nullable().optional(),
  cwdMode: z
    .enum([
      'isolated_issue',
      'isolated_run',
      'chat_scratch',
      'workspace',
      'project_local',
      'none',
    ])
    .nullable()
    .optional(),
  // B2：QC 等无 issue 时绑定的 project（cwd / 建卡继承）
  projectId: BusinessId.nullable().optional(),
  // C1：同 project_local 目录串行（API 计算，非独立状态机）
  pathWaitReason: z.enum(['path_busy']).nullable().optional(),
  pathBlockedByRunId: BusinessId.nullable().optional(),
  /** running + project_local 时 true：正在占用本机目录 */
  pathHolding: z.boolean().optional(),
  // DS4：CLI 尽力解析的 token（可空）
  tokensInput: z.number().int().nonnegative().nullable().optional(),
  tokensOutput: z.number().int().nonnegative().nullable().optional(),
  tokensCacheRead: z.number().int().nonnegative().nullable().optional(),
  tokensCacheWrite: z.number().int().nonnegative().nullable().optional(),
  // DS1：CLI provider session（ADR 0004；非 claude 多为 null / unsupported）
  providerSessionId: z.string().nullable().optional(),
  resumedSessionId: z.string().nullable().optional(),
  sessionResumeStatus: z
    .enum(['fresh', 'resumed', 'poison_fresh', 'unsupported', 'resume_miss'])
    .nullable()
    .optional(),
  sessionPoisoned: z.boolean().optional(),
  // G22 residual：run 启动快照（null/缺省 = CLI 默认）
  model: z.string().nullable().optional(),
  thinkingLevel: z.string().nullable().optional(),
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
  // agent-chat：按会话过滤 chat run
  chatThreadId: BusinessId.optional(),
  status: ListRunsStatus.optional(),
  kind: AgentRunKind.optional(),
  // isLeader=1|true：仅小队 leader run（对齐 Multica leader task 列表）
  isLeader: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});
export type ListRunsQuery = z.infer<typeof ListRunsQuery>;

// GET /api/runs/active-count —— 侧栏「运行」角标 + agents-working-banner
export const RunsActiveCount = z.object({
  count: z.number().int(),
  queued: z.number().int(),
  running: z.number().int(),
  waitingLocalDirectory: z.number().int().nonnegative().optional(),
  /** 有 queued|waiting_local_directory|running run 的去重 agent 数（Multica「N 个智能体工作中」） */
  agentsWorking: z.number().int().nonnegative().default(0),
});
export type RunsActiveCount = z.infer<typeof RunsActiveCount>;

/** POST /api/runs/cancel-many —— 批量取消 active runs */
export const CancelRunsManyInput = z.object({
  ids: z.array(BusinessId).min(1).max(100),
});
export type CancelRunsManyInput = z.infer<typeof CancelRunsManyInput>;

export const CancelRunsManyResponse = z.object({
  requested: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type CancelRunsManyResponse = z.infer<typeof CancelRunsManyResponse>;

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
  // C2：tool watchdog 须先于 idle / 通用 timeout
  if (/stale:\s*tool watchdog|tool watchdog \(tool /i.test(e)) {
    return {
      code: 'stale_or_orphan',
      title: '工具长时间无响应',
      hint: '有 tool 在执行且超过 MA_ISSUE_TOOL_IDLE_MS（默认 2 小时）无新事件。长构建可调大该值；真卡死可取消后「再执行」。',
      settingsHref: '/settings',
    };
  }
  // F3：issue idle 须先于通用 timeout 正则（文案含 "timeout"）
  if (/stale:\s*idle timeout|idle timeout \(no agent events/i.test(e)) {
    return {
      code: 'stale_or_orphan',
      title: '长时间无进度（idle）',
      hint: '超过 MA_ISSUE_IDLE_MS（默认 30 分钟）无 CLI 事件。长编译/测试可调大该值；卡死可「再执行」。',
      settingsHref: '/settings',
    };
  }
  // wall / CLI 硬超时
  if (
    /timeout|timed?\s*out|exceeded\s+\d+\s*ms|CLI exceeded|wall.?clock|硬超时/i.test(e)
  ) {
    return {
      code: 'generic',
      title: '执行超时',
      hint: 'CLI 超过 wall 时限未结束。chat 可调 MA_CHAT_TIMEOUT_MS；issue 可设 MA_ISSUE_TIMEOUT_MS（默认不硬杀，靠 idle）。',
      settingsHref: '/settings',
    };
  }
  if (/^stale:|^orphan:|heartbeat timeout|no live executor/i.test(e)) {
    return {
      code: 'stale_or_orphan',
      title: '执行中断或进程丢失',
      hint: '服务重启或 chat 心跳超时导致失败。环境正常后可「再执行」。',
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
  /** B2：可选项目 → QC run cwd = project.localPath；建卡可继承 */
  projectId: BusinessId.optional(),
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

/** G22 续：GET /api/runtimes/:id/models */
export const RuntimeModel = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  provider: z.string().optional(),
  isDefault: z.boolean().optional(),
});
export type RuntimeModel = z.infer<typeof RuntimeModel>;

export const RuntimeModelsResponse = z.object({
  runtime: RuntimeId,
  installed: z.boolean(),
  models: z.array(RuntimeModel),
  source: z.enum(['cli', 'static', 'empty']),
  error: z.string().nullable(),
});
export type RuntimeModelsResponse = z.infer<typeof RuntimeModelsResponse>;

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
    // projects-mvp：按项目筛
    projectId: BusinessId.optional(),
    // 具体指派：须成对
    assigneeType: z.enum(['agent', 'squad']).optional(),
    assigneeId: BusinessId.optional(),
    // unassigned=1：仅未指派；assigned=1：任一 agent/squad
    unassigned: QueryBool.optional(),
    assigned: QueryBool.optional(),
    // DS2：manual=看板 position 序；updated=最近更新
    sort: z.enum(['manual', 'updated']).optional(),
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

/** DS2：整列重排（同 status 内 orderedIds → position 0..n-1；可含跨列迁入的一张卡） */
export const ReorderIssuesInput = z.object({
  status: IssueStatus,
  orderedIds: z.array(BusinessId).min(1).max(500),
});
export type ReorderIssuesInput = z.infer<typeof ReorderIssuesInput>;

// —— Project（projects-mvp）——
export const ProjectStatus = z.enum(['planned', 'active', 'completed', 'cancelled']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const ProjectIssueStats = z.object({
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
});
export type ProjectIssueStats = z.infer<typeof ProjectIssueStats>;

export const Project = z.object({
  id: BusinessId,
  workspaceId: BusinessId,
  title: z.string(),
  description: z.string().nullable(),
  status: ProjectStatus,
  /** 本机仓路径（学 Multica local_directory）；空=未绑定 */
  localPath: z.string().nullable().optional(),
  /** 服务端探测：路径是否存在且为目录 */
  localPathExists: z.boolean().optional(),
  issueStats: ProjectIssueStats.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Project = z.infer<typeof Project>;

export const CreateProjectInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: ProjectStatus.optional().default('active'),
  /** 可选本机绝对路径；空串忽略 */
  localPath: z.string().max(1000).optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const UpdateProjectInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: ProjectStatus.optional(),
  /** null 或 "" 清除绑定 */
  localPath: z.string().max(1000).nullable().optional(),
});
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;

export function validateUpdateProject(d: UpdateProjectInput): boolean {
  return (
    d.title !== undefined ||
    d.description !== undefined ||
    d.status !== undefined ||
    d.localPath !== undefined
  );
}

// issue-find：GET /api/labels?includeArchived=1
export const ListLabelsQuery = z.object({
  includeArchived: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .optional(),
});
export type ListLabelsQuery = z.infer<typeof ListLabelsQuery>;

// —— Issue ——
/** 子 issue 进度（学 Multica ChildIssueProgress：done+cancelled 计完成） */
export const IssueChildProgress = z.object({
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
});
export type IssueChildProgress = z.infer<typeof IssueChildProgress>;

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
  // issue-subtasks：父 issue（仅一层）
  parentIssueId: BusinessId.nullable().optional(),
  parentIdentifier: z.string().nullable().optional(),
  childProgress: IssueChildProgress.nullable().optional(),
  // projects-mvp
  projectId: BusinessId.nullable().optional(),
  projectTitle: z.string().nullable().optional(),
  // issue-pr-link：PR/分支 URL（本地引用，非 OAuth）
  prUrl: z.string().nullable().optional(),
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
    // issue-subtasks：挂到父 issue 下
    parentIssueId: BusinessId.optional(),
    // projects-mvp：创建时归属
    projectId: BusinessId.optional(),
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
  // projects-mvp：设/清项目（null 清除）
  projectId: BusinessId.nullable().optional(),
  // issue-pr-link：设/清 PR URL
  prUrl: z.string().nullable().optional(),
});
export type UpdateIssueInput = z.infer<typeof UpdateIssueInput>;

export function validateUpdateIssue(d: UpdateIssueInput): boolean {
  return (
    d.title !== undefined ||
    d.description !== undefined ||
    d.status !== undefined ||
    d.priority !== undefined ||
    d.position !== undefined ||
    d.assignee !== undefined ||
    d.projectId !== undefined ||
    d.prUrl !== undefined
  );
}

/** GET /api/issues/:id/subscription —— 本地 member 是否关注此 issue */
export const IssueSubscription = z.object({
  issueId: BusinessId,
  subscribed: z.boolean(),
  reason: z.string().nullable(),
});
export type IssueSubscription = z.infer<typeof IssueSubscription>;

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

/** G22：agent 绑定的 LLM 模型 id（如 opencode/big-pickle）；空=CLI 默认 */
export const AgentModelId = z.string().max(200);
export type AgentModelId = z.infer<typeof AgentModelId>;

/** DS4：thinking/effort 档（自由文本；常见 low/medium/high/max 或 CLI variant） */
export const AgentThinkingLevel = z.string().max(80);
export type AgentThinkingLevel = z.infer<typeof AgentThinkingLevel>;

export const AgentSummary = z.object({
  id: BusinessId,
  name: z.string(),
  runtime: RuntimeId,
  // bu02：列表可选展示 category
  category: z.string().nullable().optional(),
  // G22：列表可展示 model（空则省略/null）
  model: z.string().nullable().optional(),
  // DS4：thinking level（空则省略/null）
  thinkingLevel: z.string().nullable().optional(),
  // G25：软归档；null=活跃
  archivedAt: z.string().datetime().nullable().optional(),
});
export type AgentSummary = z.infer<typeof AgentSummary>;

// S05：单 agent 详情契约（GET /api/agents/:id，agent 详情页用）
// AgentSummary 扩展：含 category/concurrency（profile 展示）+ mcpServers（MCP Tab 回填）
// bu02：+ instructions（执行 prompt 注入）
// G22：+ model（runtime 内模型）
// DS4：+ thinkingLevel
// G25：+ archivedAt
export const AgentDetail = AgentSummary.extend({
  category: z.string().nullable(),
  model: z.string().nullable(),
  thinkingLevel: z.string().nullable(),
  concurrency: z.number(),
  mcpServers: z.string().nullable(),
  instructions: z.string(),
  archivedAt: z.string().datetime().nullable(),
});
export type AgentDetail = z.infer<typeof AgentDetail>;

// bu02：Agent 创建/更新（运营 CRUD）
const OptionalClientId = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{1,63}$/);

export const CreateAgentInput = z.object({
  name: z.string().min(1).max(80),
  runtime: RuntimeId,
  // G22：可选；空串→null
  model: AgentModelId.optional().nullable(),
  // DS4：可选 thinking/effort
  thinkingLevel: AgentThinkingLevel.optional().nullable(),
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
    model: AgentModelId.nullable().optional(),
    thinkingLevel: AgentThinkingLevel.nullable().optional(),
    category: z.string().max(80).nullable().optional(),
    concurrency: z.number().int().min(1).max(8).optional(),
    instructions: z.string().max(20000).optional(),
    mcpServers: z.string().nullable().optional(),
    // G25：true=归档，false=取消归档
    archived: z.boolean().optional(),
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

/**
 * enqueue 跳过原因（学 Multica agent_ready 闸 + 本仓 cwd/runtime 硬闸）
 * - cwd_missing / runtime_missing / readiness_error：硬拦，不入队
 * - already_active / run_limit / agent_missing / no_leader：业务跳过
 */
export const EnqueueSkipReason = z.enum([
  'already_active',
  'run_limit',
  'agent_missing',
  'cwd_missing',
  'runtime_missing',
  'readiness_error',
  /** B3：小队无 leader，无法派 leader run */
  'no_leader',
]);
export type EnqueueSkipReason = z.infer<typeof EnqueueSkipReason>;

/** Issue 创建/指派响应上的 enqueue 元数据（assign 成功但可能未开工） */
export const IssueEnqueueMeta = z.object({
  status: z.enum(['queued', 'skipped', 'not_applicable']),
  runId: BusinessId.nullable().optional(),
  reason: EnqueueSkipReason.nullable().optional(),
  detail: z.string().nullable().optional(),
});
export type IssueEnqueueMeta = z.infer<typeof IssueEnqueueMeta>;

/** GET /api/agents/:id/work-stats —— 近窗工作仪表（G12 agent-work-dashboard） */
export const AgentWorkStats = z.object({
  agentId: BusinessId,
  /** 统计窗口天数（createdAt 起算）；null 表示全量 */
  windowDays: z.number().int().positive().nullable(),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  /** completed / (completed+failed)；无终态样本时 null */
  successRate: z.number().min(0).max(1).nullable(),
  /** 有 startedAt+finishedAt 的 completed 平均耗时 ms */
  avgDurationMs: z.number().nonnegative().nullable(),
  /** 最近一次 run 创建时间 ISO；无 run 时 null */
  lastRunAt: z.string().datetime().nullable(),
});
export type AgentWorkStats = z.infer<typeof AgentWorkStats>;

/**
 * GET /api/issues/:id/run-usage —— Issue 详情用量摘要（G4 + DS4）
 * 次数/成功率/耗时为主；token* 有 run 落库则 SUM，否则 null。
 */
export const IssueRunUsage = z.object({
  issueId: BusinessId,
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1).nullable(),
  avgDurationMs: z.number().nonnegative().nullable(),
  totalDurationMs: z.number().nonnegative().nullable(),
  lastRunAt: z.string().datetime().nullable(),
  /** DS4：CLI 尽力；全 null 则保持 null */
  tokensInput: z.number().nonnegative().nullable(),
  tokensOutput: z.number().nonnegative().nullable(),
  tokensCacheRead: z.number().nonnegative().nullable(),
  tokensCacheWrite: z.number().nonnegative().nullable(),
});
export type IssueRunUsage = z.infer<typeof IssueRunUsage>;

/**
 * GET /api/usage?days=30 —— 工作区用量中心（G17 + DS4）
 * token*：有落库则 SUM，否则 null；costUsd 仍恒 null（无美元账单）。
 */
export const UsageAgentRow = z.object({
  agentId: BusinessId,
  agentName: z.string(),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1).nullable(),
  totalDurationMs: z.number().nonnegative().nullable(),
  avgDurationMs: z.number().nonnegative().nullable(),
});
export type UsageAgentRow = z.infer<typeof UsageAgentRow>;

export const UsageDayRow = z.object({
  /** YYYY-MM-DD（本地日） */
  day: z.string(),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});
export type UsageDayRow = z.infer<typeof UsageDayRow>;

export const WorkspaceUsage = z.object({
  windowDays: z.number().int().positive(),
  since: z.string().datetime(),
  until: z.string().datetime(),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1).nullable(),
  totalDurationMs: z.number().nonnegative().nullable(),
  avgDurationMs: z.number().nonnegative().nullable(),
  /** 本地无 token 计量 */
  tokensInput: z.number().nonnegative().nullable(),
  tokensOutput: z.number().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
  byAgent: z.array(UsageAgentRow),
  byDay: z.array(UsageDayRow),
});
export type WorkspaceUsage = z.infer<typeof WorkspaceUsage>;

/** GET /api/agents/readiness?ids=a,b 或 POST body {ids} */
export const AgentsReadinessMap = z.record(BusinessId, AgentReadiness.nullable());
export type AgentsReadinessMap = z.infer<typeof AgentsReadinessMap>;

export const AgentsReadinessQuery = z.object({
  ids: z
    .union([z.string().min(1), z.array(BusinessId).min(1)])
    .transform((v) => {
      const raw = Array.isArray(v) ? v : v.split(',');
      return [...new Set(raw.map((s) => s.trim()).filter(Boolean))].slice(0, 100);
    }),
});
export type AgentsReadinessQuery = z.infer<typeof AgentsReadinessQuery>;

// S05 + C3：skill 列表项契约（GET /api/skills）
// source: user | workspace(工作区 .skills) | project(某 project.localPath/.skills)
export const SkillSource = z.enum(['project', 'user', 'workspace']);
export type SkillSource = z.infer<typeof SkillSource>;

export const SkillInfo = z.object({
  name: z.string(),
  description: z.string(),
  source: SkillSource,
  /** C3：来自绑定 localPath 的项目时有值 */
  projectId: BusinessId.nullable().optional(),
  projectTitle: z.string().nullable().optional(),
  usedBy: z.array(AgentSummary),
});
export type SkillInfo = z.infer<typeof SkillInfo>;

/** GET /api/skills/:name —— 详情（含 body，供 Multica 式详情页） */
export const SkillDetail = SkillInfo.extend({
  body: z.string(),
  path: z.string(),
});
export type SkillDetail = z.infer<typeof SkillDetail>;

/** 本机目录 skill 导入（学 Multica runtime-local-skill-import，目标改为本地 .skills） */
export const SkillImportTarget = z.enum(['project', 'user', 'workspace']);
export type SkillImportTarget = z.infer<typeof SkillImportTarget>;

export const LocalSkillCandidate = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  path: z.string(),
  kind: z.enum(['dir', 'file']),
  alreadyIndexed: z.boolean(),
  existingSource: SkillSource.nullable(),
});
export type LocalSkillCandidate = z.infer<typeof LocalSkillCandidate>;

export const ScanLocalSkillsInput = z.object({
  path: z.string().min(1).max(1000),
});
export type ScanLocalSkillsInput = z.infer<typeof ScanLocalSkillsInput>;

export const SkillImportDestHint = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string().nullable(),
});
export type SkillImportDestHint = z.infer<typeof SkillImportDestHint>;

export const ScanLocalSkillsResponse = z.object({
  path: z.string(),
  candidates: z.array(LocalSkillCandidate),
  projectSkillsDir: z.string().nullable(),
  userSkillsDir: z.string(),
  /** C3：可选写入目标列表（user / workspace / 各 project） */
  destinations: z.array(SkillImportDestHint).optional(),
  error: z.string().nullable(),
});
export type ScanLocalSkillsResponse = z.infer<typeof ScanLocalSkillsResponse>;

export const ImportLocalSkillItem = z.object({
  sourcePath: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  overwrite: z.boolean().optional(),
});
export type ImportLocalSkillItem = z.infer<typeof ImportLocalSkillItem>;

export const ImportLocalSkillsInput = z.object({
  /** 默认 user：无 workspace 时仍可导入 */
  target: SkillImportTarget.default('user'),
  /** target=project 时必填：写入该项目 localPath/.skills */
  projectId: BusinessId.optional(),
  items: z.array(ImportLocalSkillItem).min(1).max(50),
});
export type ImportLocalSkillsInput = z.infer<typeof ImportLocalSkillsInput>;

export const ImportLocalSkillResult = z.object({
  name: z.string(),
  status: z.enum(['created', 'updated', 'skipped', 'failed']),
  source: SkillImportTarget,
  path: z.string().optional(),
  error: z.string().optional(),
  projectId: BusinessId.nullable().optional(),
});
export type ImportLocalSkillResult = z.infer<typeof ImportLocalSkillResult>;

export const ImportLocalSkillsResponse = z.object({
  results: z.array(ImportLocalSkillResult),
  projectSkillsDir: z.string().nullable(),
  userSkillsDir: z.string(),
  destinations: z.array(SkillImportDestHint).optional(),
});
export type ImportLocalSkillsResponse = z.infer<typeof ImportLocalSkillsResponse>;

/** URL 导入 skill（学 Multica ImportSkill；本仓写入本地 .skills） */
export const ImportSkillFromUrlInput = z.object({
  url: z.string().min(4).max(2000),
  target: SkillImportTarget.default('user'),
  projectId: BusinessId.optional(),
  overwrite: z.boolean().optional().default(false),
  name: z.string().min(1).max(120).optional(),
});
export type ImportSkillFromUrlInput = z.infer<typeof ImportSkillFromUrlInput>;

export const ImportSkillFromUrlResponse = z.object({
  name: z.string(),
  status: z.enum(['created', 'updated', 'skipped', 'failed']),
  source: SkillImportTarget,
  path: z.string().optional(),
  error: z.string().optional(),
  originType: z.string().optional(),
  sourceUrl: z.string().optional(),
  projectSkillsDir: z.string().nullable(),
  userSkillsDir: z.string(),
  projectId: BusinessId.nullable().optional(),
  destinations: z.array(SkillImportDestHint).optional(),
});
export type ImportSkillFromUrlResponse = z.infer<typeof ImportSkillFromUrlResponse>;

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
  /** B3：允许 null（无 leader 仍可加载详情，enqueue 报 no_leader） */
  leaderId: BusinessId.nullable(),
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

/** DELETE issue 后广播（学 Multica EventIssueDeleted） */
export const IssueDeletedEvent = z.object({
  type: z.literal('issue:deleted'),
  issueId: BusinessId,
  parentIssueId: BusinessId.nullable().optional(),
});
export type IssueDeletedEvent = z.infer<typeof IssueDeletedEvent>;

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

/** POST /api/memory/delete-many —— 批量删除记忆 */
export const DeleteMemoryManyInput = z.object({
  ids: z.array(BusinessId).min(1).max(100),
});
export type DeleteMemoryManyInput = z.infer<typeof DeleteMemoryManyInput>;

export const DeleteMemoryManyResponse = z.object({
  requested: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export type DeleteMemoryManyResponse = z.infer<typeof DeleteMemoryManyResponse>;

export const MemoryStatus = z.object({
  provider: z.string().nullable(),
  available: z.boolean(),
});
export type MemoryStatus = z.infer<typeof MemoryStatus>;

// —— agent-chat：人↔agent 会话 ——
export const ChatMessageRole = z.enum(['user', 'assistant', 'system']);
export type ChatMessageRole = z.infer<typeof ChatMessageRole>;

/** Chat 执行目录元信息（服务端真源；对齐 resolveRunCwd） */
export const ChatExecContext = z.object({
  /**
   * project_local=会话绑项目本机目录；
   * chat_scratch=默认隔离；workspace=MA_CHAT_USE_WORKSPACE_CWD；none=失败/无效
   */
  mode: z.enum(['chat_scratch', 'workspace', 'project_local', 'none']),
  /** 产品文案：项目本机 / 隔离 / 工作区 / 未就绪 */
  modeLabel: z.string(),
  path: z.string().nullable(),
  exists: z.boolean(),
});
export type ChatExecContext = z.infer<typeof ChatExecContext>;

export const ChatThread = z.object({
  id: BusinessId,
  agentId: BusinessId,
  title: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastMessagePreview: z.string().nullable().optional(),
  /** Multica：置顶时间；null=未置顶 */
  pinnedAt: z.string().datetime().nullable().optional(),
  /** Multica：归档时间；null=活跃 */
  archivedAt: z.string().datetime().nullable().optional(),
  /** B1：绑定项目 → 执行用 project.localPath */
  projectId: BusinessId.nullable().optional(),
  projectTitle: z.string().nullable().optional(),
  lastSessionId: z.string().nullable().optional(),
  /** 详情接口可选：本会话 CLI cwd 模式与路径 */
  execContext: ChatExecContext.optional(),
});
export type ChatThread = z.infer<typeof ChatThread>;

/** 会话绑/解绑项目（null 或 "" 清除） */
export const UpdateChatThreadProjectInput = z.object({
  projectId: BusinessId.nullable(),
});
export type UpdateChatThreadProjectInput = z.infer<typeof UpdateChatThreadProjectInput>;

export const ListChatThreadsQuery = z.object({
  /** include archived rows (default false) */
  archived: z
    .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
    .optional(),
});
export type ListChatThreadsQuery = z.infer<typeof ListChatThreadsQuery>;

export const PinChatThreadInput = z.object({
  pinned: z.boolean(),
});
export type PinChatThreadInput = z.infer<typeof PinChatThreadInput>;

export const ArchiveChatThreadInput = z.object({
  archived: z.boolean(),
});
export type ArchiveChatThreadInput = z.infer<typeof ArchiveChatThreadInput>;

export const ChatMessage = z.object({
  id: BusinessId,
  threadId: BusinessId,
  role: ChatMessageRole,
  body: z.string(),
  runId: BusinessId.nullable().optional(),
  createdAt: z.string().datetime(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const CreateChatThreadInput = z.object({
  agentId: BusinessId,
  title: z.string().min(1).max(200).optional(),
});
export type CreateChatThreadInput = z.infer<typeof CreateChatThreadInput>;

export const PostChatMessageInput = z.object({
  body: z.string().min(1).max(20000),
});
export type PostChatMessageInput = z.infer<typeof PostChatMessageInput>;

// —— Run 生命周期 / 进度 / 消息 事件（S03）——
export const RunLifecycleEvent = z.object({
  type: z.enum([
    'run:queued',
    'run:waiting_local_directory',
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
  | IssueDeletedEvent
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
  /** 可行动恢复链（F7） */
  href: z.string().nullable().optional(),
  /** 链接文案，默认「前往」 */
  actionLabel: z.string().nullable().optional(),
});
export type SettingsCheck = z.infer<typeof SettingsCheck>;

/** Settings 运行健康：在途计数 + 收尸阈值（settings-run-health） */
export const SettingsRunHealth = z.object({
  active: z.object({
    total: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
  }),
  oldestQueuedAgeMs: z.number().int().nonnegative().nullable(),
  oldestRunningAgeMs: z.number().int().nonnegative().nullable(),
  oldestRunningHeartbeatAgeMs: z.number().int().nonnegative().nullable(),
  thresholds: z.object({
    /** chat 进程心跳阈值 */
    staleRunningMs: z.number().int().nonnegative(),
    /** issue/QC 活动 idle 阈值；0=关闭 */
    issueIdleMs: z.number().int().nonnegative().optional(),
    /** issue/QC wall；0=不硬杀 */
    issueWallTimeoutMs: z.number().int().nonnegative().optional(),
    staleQueuedMs: z.number().int().positive(),
    sweepIntervalMs: z.number().int().positive(),
  }),
  atRisk: z.object({
    /** running 心跳/活动龄 ≥ 对应阈值的 70%（接近收尸） */
    runningNearStale: z.number().int().nonnegative(),
    /** queued 龄 ≥ 阈值的 70% */
    queuedNearStale: z.number().int().nonnegative(),
  }),
});
export type SettingsRunHealth = z.infer<typeof SettingsRunHealth>;

/** Settings Wiki 编译队列摘要（settings-wiki-auto-health） */
export const SettingsWikiHealth = z.object({
  dead: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  llmConfigured: z.boolean(),
});
export type SettingsWikiHealth = z.infer<typeof SettingsWikiHealth>;

/** Settings 自动化规则摘要 */
export const SettingsAutomationHealth = z.object({
  total: z.number().int().nonnegative(),
  enabled: z.number().int().nonnegative(),
  failedRules: z.number().int().nonnegative(),
  lastFailedAt: z.string().datetime().nullable(),
});
export type SettingsAutomationHealth = z.infer<typeof SettingsAutomationHealth>;

/** Settings 记忆层摘要（settings-memory-health） */
export const SettingsMemoryHealth = z.object({
  provider: z.string().nullable(),
  available: z.boolean(),
  backend: z.enum(['sqlite', 'pgvector', 'none']),
  total: z.number().int().nonnegative(),
  ambient: z.number().int().nonnegative(),
  curated: z.number().int().nonnegative(),
  latestAt: z.string().datetime().nullable(),
});
export type SettingsMemoryHealth = z.infer<typeof SettingsMemoryHealth>;

export const SettingsCwdSource = z.enum(['env', 'db', 'none']);
export type SettingsCwdSource = z.infer<typeof SettingsCwdSource>;

export const SettingsCwdInfo = z.object({
  path: z.string().nullable(),
  source: SettingsCwdSource,
  exists: z.boolean(),
  configured: z.boolean(),
  /** DB 持久化值（可能与当前生效 path 不同，若 env 覆盖） */
  persistedPath: z.string().nullable(),
});
export type SettingsCwdInfo = z.infer<typeof SettingsCwdInfo>;

export const SetWorkspaceCwdInput = z.object({
  path: z.string().min(1).max(1024),
});
export type SetWorkspaceCwdInput = z.infer<typeof SetWorkspaceCwdInput>;

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
  /** 可选：旧客户端忽略；新 Settings 展示运行健康 */
  runHealth: SettingsRunHealth.optional(),
  wikiHealth: SettingsWikiHealth.optional(),
  automationHealth: SettingsAutomationHealth.optional(),
  memoryHealth: SettingsMemoryHealth.optional(),
  cwd: SettingsCwdInfo.optional(),
});
export type SettingsStatusResponse = z.infer<typeof SettingsStatusResponse>;

/** GET/PUT /api/profile —— 本地用户 About（注入 agent prompt） */
export const UserProfile = z.object({
  id: BusinessId,
  name: z.string(),
  email: z.string().nullable(),
  about: z.string(),
  updatedHint: z
    .string()
    .optional()
    .describe('可选 UI 提示：会注入到 agent 执行 prompt'),
});
export type UserProfile = z.infer<typeof UserProfile>;

export const UpdateUserProfileInput = z.object({
  name: z.string().min(1).max(80).optional(),
  about: z.string().max(4000).optional(),
});
export type UpdateUserProfileInput = z.infer<typeof UpdateUserProfileInput>;

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
