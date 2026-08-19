import {
  sqliteTable,
  text,
  real,
  integer,
  index,
  uniqueIndex,
  check,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// —— workspace（spec §3.1，单行）——
// ADR 0003：root_path 持久化本机工作区目录（非密钥）；env MA_WORKSPACE_CWD 仍可覆盖
// G2-5：max_concurrent_runs 全局在途并发上限（null=不限；只拦 claim，不拦 enqueue）
export const workspaces = sqliteTable('workspace', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  rootPath: text('root_path'),
  maxConcurrentRuns: integer('max_concurrent_runs'),
  createdAt: integer('created_at').notNull(),
});

// —— user（spec §3.1，单行林远）——
// user-profile-brief：about 注入 agent prompt（非密钥）
export const users = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  about: text('about').notNull().default(''),
  createdAt: integer('created_at').notNull(),
});

// —— agent（spec §3.1，4 行静态，用于 assignee label）——
// S04：加 concurrency（per-agent 并发槽上限，照 multica 001_init.up.sql:45 max_concurrent_tasks）
// S05：加 mcpServers（MCP 配置 JSON 字符串，spec §3.3）
// bu02：加 instructions（执行 prompt 注入的 agent 级指令）
// G22：model（runtime 内 LLM 模型 id；空=CLI 默认，学 Multica 050_agent_model）
export const agents = sqliteTable('agent', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category'),
  runtime: text('runtime', {
    enum: ['claude-code', 'opencode', 'cursor', 'grok', 'pi'],
  })
    .notNull()
    .default('opencode'),
  // null/空串 = 跟随 CLI 默认；仅对新 dispatch 的 run 生效
  model: text('model'),
  // DS4：thinking/effort 档（null=CLI 默认；backend 能传则传）
  thinkingLevel: text('thinking_level'),
  concurrency: integer('concurrency').notNull().default(1),
  mcpServers: text('mcp_servers'), // S05：MCP 配置 JSON 字符串
  instructions: text('instructions').notNull().default(''),
  allowedPaths: text('allowed_paths'),
  // G3-4：环境变量 / 自定义参数（JSON 文本；null=未配置，executor 注入点后续接）
  envVars: text('env_vars'),
  customArgs: text('custom_args'),
  // G25：软归档；null=活跃（对齐 Multica archived_at）
  archivedAt: integer('archived_at'),
  // P2-4：显式后备 agent（runtime 连接不上 + auto-retry 预算用尽时改派目标；null=不启用）
  fallbackAgentId: text('fallback_agent_id'),
  // W7：被触发方式 —— 'auto'（默认，评论路由 fallback 也唤醒）| 'mention-only'（仅显式 @/委派）
  invocationPermission: text('invocation_permission').notNull().default('auto'),
  createdAt: integer('created_at').notNull(),
});

// —— agent_skill（S05：skill 分配关系，skill_id 是 skill name 非 FK，spec §3.2）——
// skill 本身不进 DB（文件系统真源 + 内存索引），分配关系必须持久化
export const agentSkills = sqliteTable(
  'agent_skill',
  {
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    skillId: text('skill_id').notNull(), // skill 的 name（文件系统真源）
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.skillId] }),
    agentIdx: index('idx_agent_skill_agent').on(t.agentId),
  }),
);

// —— squad（spec §3.1，3 行静态，用于 assignee label）——
// S04：加 operating_protocol + mission_directive（briefing 三段的第一/第三段，spec §3.1）
// B5：加 updated_at（改名/改协议/改 directive 时更新；旧行 null → 排序 createdAt 兜底）
export const squads = sqliteTable('squad', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  leaderId: text('leader_id'),
  operatingProtocol: text('operating_protocol').notNull().default(''),
  missionDirective: text('mission_directive').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at'),
});

// S05（spec §3.2b / R6）：删 S01 的 skill 死表——skill 改文件系统真源 + 内存索引，
  // 不再进 DB。分配关系见上方 agentSkills。

  // —— project（projects-mvp：学 Multica project 容器；本仓精简 status/title）——
  // F1：local_path ≈ Multica project_resource local_directory（单机绝对路径）
  export const projects = sqliteTable(
    'project',
    {
      id: text('id').primaryKey(),
      workspaceId: text('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      title: text('title').notNull(),
      description: text('description'),
      status: text('status', {
        enum: ['planned', 'active', 'completed', 'cancelled'],
      })
        .notNull()
        .default('active'),
      /** 本机代码仓绝对路径；有则 issue run 优先以此为 cwd */
      localPath: text('local_path'),
      createdAt: integer('created_at').notNull(),
      updatedAt: integer('updated_at').notNull(),
    },
    (t) => ({
      workspaceIdx: index('idx_project_workspace').on(t.workspaceId),
    }),
  );

  // —— issue（spec §3.2，照 multica 001_init.up.sql:52-72）——
  // bu03：+ origin_type / origin_run_id（快速派活溯源）
  // bu05：+ origin_rule_id（自动化规则溯源）；origin_type 含 automation
  export const issues = sqliteTable(
    'issue',
    {
      id: text('id').primaryKey(),
      workspaceId: text('workspace_id')
        .notNull()
        .references(() => workspaces.id),
      identifier: text('identifier').notNull(),
      title: text('title').notNull(),
      description: text('description'),
      status: text('status', { enum: ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'] })
        .notNull()
        .default('backlog'),
      priority: text('priority', { enum: ['urgent', 'high', 'medium', 'low', 'none'] })
        .notNull()
        .default('none'),
      assigneeType: text('assignee_type', { enum: ['member', 'agent', 'squad'] }),
      assigneeId: text('assignee_id'),
      creatorType: text('creator_type', { enum: ['member', 'agent'] }).notNull(),
      creatorId: text('creator_id').notNull(),
      position: real('position').notNull().default(0),
      originType: text('origin_type'), // 'quick_create' | 'automation' | null
      originRunId: text('origin_run_id'),
      originRuleId: text('origin_rule_id'),
      // issue-subtasks：学 Multica parent_issue_id；仅一层（子不可再挂孙）
      parentIssueId: text('parent_issue_id'),
      // W7：阶段屏障 —— 子 issue 阶段号；同阶段全部子任务终态才唤醒父（null=不参与阶段）
      stage: integer('stage'),
      // projects-mvp：可选归属项目
      projectId: text('project_id'),
      // issue-pr-link：本地 PR/分支引用 URL（非 GitHub 集成）
      prUrl: text('pr_url'),
      customFields: text('custom_fields', { mode: 'json' }).$type<Record<string, string>>(),
      createdAt: integer('created_at').notNull(),
      updatedAt: integer('updated_at').notNull(),
    },
    (t) => ({
      statusWorkspaceIdx: index('idx_issue_status_workspace').on(t.workspaceId, t.status),
      assigneeIdx: index('idx_issue_assignee').on(t.assigneeType, t.assigneeId),
      parentIdx: index('idx_issue_parent').on(t.parentIssueId),
      projectIdx: index('idx_issue_project').on(t.projectId),
    }),
  );

// —— issue_label / issue_to_label（issue-labels：学 multica 001 简化，仅 Issue）——
export const issueLabels = sqliteTable(
  'issue_label',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#6b7280'),
    // issue-find：软归档时间戳（ms）；null=活跃
    archivedAt: integer('archived_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    workspaceNameUq: uniqueIndex('uq_issue_label_workspace_name').on(t.workspaceId, t.name),
    workspaceIdx: index('idx_issue_label_workspace').on(t.workspaceId),
  }),
);

export const issueToLabels = sqliteTable(
  'issue_to_label',
  {
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => issueLabels.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.issueId, t.labelId] }),
    labelIdx: index('idx_issue_to_label_label').on(t.labelId),
  }),
);

// —— comment（S02 时间线真源）——
export const comments = sqliteTable(
  'comment',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id),
    type: text('type', { enum: ['comment', 'status_change'] }).notNull(),
    authorType: text('author_type', { enum: ['member', 'agent'] }).notNull(),
    authorId: text('author_id').notNull(),
    body: text('body').notNull(),
    // S3：thread-lite —— null = 根评论；非 null 指向根评论（仅一层，handler 强制）
    parentCommentId: text('parent_comment_id'),
    // S3：结论记在根评论上，天然保证每线程最多一个 resolution
    resolvedAt: integer('resolved_at'),
    resolutionCommentId: text('resolution_comment_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    issueCreatedIdx: index('idx_comment_issue_created').on(t.issueId, t.createdAt),
    parentIdx: index('idx_comment_parent').on(t.parentCommentId),
  }),
);

// —— attachment（S4：真本地附件，字节在 ~/.multi-agent/attachments，DB 只存元数据）——
// comment_id 可空：先上传拿 id，评论提交时绑定；未绑定的是孤儿，TTL GC 清理。
export const attachments = sqliteTable(
  'attachment',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    commentId: text('comment_id'),
    originalName: text('original_name').notNull(),
    mime: text('mime').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** 服务端生成的落盘名（UUID + 白名单扩展名），绝不含客户端路径 */
    storageName: text('storage_name').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    issueIdx: index('idx_attachment_issue').on(t.issueId),
    commentIdx: index('idx_attachment_comment').on(t.commentId),
    storageUq: uniqueIndex('uq_attachment_storage_name').on(t.storageName),
  }),
);

// —— agent_run（S03 执行层，薄状态机，对齐 multica task）——
// bu03：issue_id 可空（quick_create 初始无 Issue）；+ kind / quick_prompt
export const agentRuns = sqliteTable(
  'agent_run',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id').references(() => issues.id), // 可空：QC 先 run 再建卡
    agentId: text('agent_id').notNull(),
    runtime: text('runtime', {
      enum: ['claude-code', 'opencode', 'cursor', 'grok', 'pi'],
    }).notNull(),
    status: text('status', {
      enum: [
        'queued',
        'waiting_local_directory',
        'running',
        // G2-1：queued 超龄未 claim → deferred（等待 fire_at 后升级；不 claim 不执行）
        'deferred',
        'completed',
        'failed',
        'cancelled',
        'timed_out',
      ],
    }).notNull(),
    kind: text('kind', { enum: ['issue', 'quick_create', 'chat'] })
      .notNull()
      .default('issue'),
    // G6-1：enqueue 时从 issue 拷贝的优先级快照（tick 认领按 priority DESC +
    // createdAt ASC，学 multica ClaimAgentTask agent.sql `ORDER BY atq.priority
    // DESC, atq.created_at ASC`）；QC/chat/automation 无 issue 默认 none
    priority: text('priority', {
      enum: ['urgent', 'high', 'medium', 'low', 'none'],
    })
      .notNull()
      .default('none'),
    quickPrompt: text('quick_prompt'),
    // agent-chat：可选关联会话
    chatThreadId: text('chat_thread_id'),
    // S04：is_leader + squad_id（照 multica 090/127 migration，标记 squad-leader run）
    isLeader: integer('is_leader').notNull().default(0),
    squadId: text('squad_id'),
    error: text('error'),
    failureReason: text('failure_reason'),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    // bu01：执行中 heartbeat；null 时 stale 回退 startedAt/createdAt
    lastHeartbeatAt: integer('last_heartbeat_at'),
    // Slice 66：进入 waiting_local_directory 墙钟起点；离开时清 null；旧行 null
    waitingLocalEnteredAt: integer('waiting_local_entered_at'),
    // Slice 68：claim→running 后 prepare 阶段 lease 到期（epoch ms）；稳定 executor 后清 null
    prepareLeaseExpiresAt: integer('prepare_lease_expires_at'),
    // G2-1：deferred 状态的最早升级时刻（epoch ms）；到点由清扫器 fire（multica fire_at）
    fireAt: integer('fire_at'),
    // run-observability：人工 rerun 血缘（可空）
    rerunOfRunId: text('rerun_of_run_id'),
    // A2 UX Trust：CLI cwd 审计（resolve-run-cwd）
    cwdPath: text('cwd_path'),
    cwdMode: text('cwd_mode'),
    // B2 UX Trust：QC 等无 issue 时仍可绑 project → cwd
    projectId: text('project_id'),
    // DS4：CLI 尽力解析的 token（可空；无则保持 null）
    tokensInput: integer('tokens_input'),
    tokensOutput: integer('tokens_output'),
    tokensCacheRead: integer('tokens_cache_read'),
    tokensCacheWrite: integer('tokens_cache_write'),
    // DS1：provider CLI session resume（claude-code MVP；见 ADR 0004）
    providerSessionId: text('provider_session_id'),
    resumedSessionId: text('resumed_session_id'),
    sessionResumeStatus: text('session_resume_status'),
    sessionPoisoned: integer('session_poisoned').notNull().default(0),
    // G22 residual：本 run 启动时从 agent 快照；null=未指定/CLI 默认（与 agent 后期改绑解耦）
    model: text('model'),
    thinkingLevel: text('thinking_level'),
    // S12: Subagent delegation
    parentRunId: text('parent_run_id'),
    // Bounded infrastructure auto-retry lineage / budget. These columns are
    // additive so legacy runs remain attempt 1 with the default budget.
    attempt: integer('attempt').notNull().default(1),
    maxAttempts: integer('max_attempts').notNull().default(2),
    nextAttemptAt: integer('next_attempt_at'),
    autoRetryOfRunId: text('auto_retry_of_run_id'),
    // P2-4：显式 fallback 改派血缘（非空 = 由另一 run 改派而来；深度 1 防链式）
    escalatedFromRunId: text('escalated_from_run_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    issueIdx: index('idx_agent_run_issue').on(t.issueId),
    statusIdx: index('idx_agent_run_status').on(t.status),
      kindStatusIdx: index('idx_agent_run_kind_status').on(t.kind, t.status),
      createdIdx: index('idx_agent_runs_created_at').on(t.createdAt),
      autoRetryOfIdx: uniqueIndex('uq_agent_run_auto_retry_of').on(t.autoRetryOfRunId),
      escalatedFromIdx: uniqueIndex('uq_agent_run_escalated_from').on(t.escalatedFromRunId),
    }),
);

// —— run_execution_owner（G8-2：活跃 CLI 的安全重启归属）——
// 与 agent_run 的业务终态分离：仅当前仍由本服务执行的子进程保留一行；
// 崩溃后仅当 PID + 不可逆启动指纹可复核，才允许请求 kill tree。
export const runExecutionOwners = sqliteTable(
  'run_execution_owner',
  {
    runId: text('run_id')
      .primaryKey()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    pid: integer('pid').notNull(),
    fingerprint: text('fingerprint').notNull(),
    // cwd 同时也在 agent_run.cwd_path；侧表保留快照，便于孤儿诊断无需猜测。
    cwdPath: text('cwd_path'),
    recordedAt: integer('recorded_at').notNull(),
  },
);

// —— run_message（S03 执行轨迹回放，对齐 multica task_message）——
export const runMessages = sqliteTable(
  'run_message',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => agentRuns.id),
    seq: integer('seq').notNull(),
    kind: text('kind', {
      enum: ['assistant', 'user', 'tool_start', 'tool_end', 'system'],
    }).notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    // 按 runId + seq 排序（用于轨迹回放）
    runSeqIdx: index('idx_run_message_run_seq').on(t.runId, t.seq),
    // 按 runId + createdAt 范围查询（用于时间窗口过滤）
    runCreatedIdx: index('idx_run_message_run_created').on(t.runId, t.createdAt),
  }),
);

// —— squad_member（成员关系，简化版，不建 member_type/role，成员恒 agent）——
// S04：照 multica 084_squad.up.sql:17，但简化——我们纯本地成员恒是 agent
// leader 不进此表（leader 在 squad.leaderId 单独存，roster 是"可被 @mention 的成员"）
export const squadMembers = sqliteTable(
  'squad_member',
  {
    squadId: text('squad_id')
      .notNull()
      .references(() => squads.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.squadId, t.agentId] }),
    squadIdx: index('idx_squad_member_squad').on(t.squadId),
  }),
);

// —— wiki_ingest_job（S08：ingest 队列 + DLQ，spec §4）——
export const wikiIngestJobs = sqliteTable(
  'wiki_ingest_job',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id').notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'completed', 'failed', 'dead'],
    }).notNull(),
    failCount: integer('fail_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(3),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    // Slice 39 / R6：失败重试指数退避；null=可立即 claim
    nextAttemptAt: integer('next_attempt_at'),
  },
  (t) => ({
    statusCreatedIdx: index('idx_wiki_ingest_job_status_created').on(t.status, t.createdAt),
    issueIdx: index('idx_wiki_ingest_job_issue').on(t.issueId),
  }),
);

// —— memory_item（S09：可插拔记忆文本存储）——
export const memoryItems = sqliteTable(
  'memory_item',
  {
    id: text('id').primaryKey(),
    scope: text('scope').notNull().default('workspace'),
    // null = global memory; non-null rows are isolated to one project.
    projectId: text('project_id'),
    issueId: text('issue_id'),
    agentId: text('agent_id'),
    runId: text('run_id'),
    text: text('text').notNull(),
    validAt: integer('valid_at'),
    invalidAt: integer('invalid_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    createdIdx: index('idx_memory_item_created').on(t.createdAt),
    projectIdx: index('idx_memory_item_project').on(t.projectId),
    issueIdx: index('idx_memory_item_issue').on(t.issueId),
  }),
);

// —— chat_thread / chat_message（agent-chat：人↔agent 会话，对齐 Multica /chat）——
export const chatThreads = sqliteTable(
  'chat_thread',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id').notNull(),
    title: text('title').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    // Multica：pinned_at 排序置顶；archived_at 软归档（列表默认隐藏）
    pinnedAt: integer('pinned_at'),
    archivedAt: integer('archived_at'),
    // B1 UX Trust：会话绑 project → CLI cwd = project.localPath
    projectId: text('project_id'),
    // Slice A：Session Resume 记录最近一次 Provider Session ID
    lastSessionId: text('last_session_id'),
  },
  (t) => ({
    updatedIdx: index('idx_chat_thread_updated').on(t.updatedAt),
    pinnedIdx: index('idx_chat_thread_pinned').on(t.pinnedAt),
    archivedIdx: index('idx_chat_thread_archived').on(t.archivedAt),
  }),
);

// —— chat_message（agent-chat：单条会话消息，cascade 删除）——
export const chatMessages = sqliteTable(
  'chat_message',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
    body: text('body').notNull(),
    runId: text('run_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    threadCreatedIdx: index('idx_chat_message_thread_created').on(t.threadId, t.createdAt),
  }),
);

// —— inbox_item（bu01：真 Inbox 落库；impl-1 建表，impl-2 写通知）——
export const inboxItems = sqliteTable(
  'inbox_item',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    recipientType: text('recipient_type', { enum: ['member', 'agent'] }).notNull(),
    recipientId: text('recipient_id').notNull(),
    type: text('type', {
      enum: ['comment', 'run_completed', 'run_failed', 'assigned'],
    }).notNull(),
    severity: text('severity', {
      enum: ['action_required', 'attention', 'info'],
    })
      .notNull()
      .default('info'),
    issueId: text('issue_id'),
    // run 终态 → Inbox→/runs?run=
    runId: text('run_id'),
    title: text('title').notNull(),
    body: text('body'),
    actorType: text('actor_type'),
    actorId: text('actor_id'),
    // 简单去重键：comment:<id> / run:<id>:<status> / assign:...
    dedupeKey: text('dedupe_key'),
    read: integer('read').notNull().default(0),
    archived: integer('archived').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    recipientCreatedIdx: index('idx_inbox_recipient_created').on(
      t.recipientType,
      t.recipientId,
      t.createdAt,
    ),
    dedupeIdx: index('idx_inbox_dedupe').on(
      t.recipientType,
      t.recipientId,
      t.dedupeKey,
    ),
    createdIdx: index('idx_inbox_items_created_at').on(t.createdAt),
  }),
);

// —— issue_subscriber（bu01：通知归属最小集）——
export const issueSubscribers = sqliteTable(
  'issue_subscriber',
  {
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    userType: text('user_type', { enum: ['member', 'agent'] }).notNull(),
    userId: text('user_id').notNull(),
    reason: text('reason').notNull().default('manual'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.issueId, t.userType, t.userId] }),
  }),
);

// —— automation_rule（bu05：最小自动化规则）——
export const automationRules = sqliteTable('automation_rule', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  enabled: integer('enabled').notNull().default(1),
  scheduleKind: text('schedule_kind', {
    enum: ['interval_minutes', 'daily_at', 'cron'],
  }).notNull(),
  intervalMinutes: integer('interval_minutes'),
  dailyTime: text('daily_time'), // HH:mm
  cronExpression: text('cron_expression'), // */5 * * * *
  assigneeType: text('assignee_type', { enum: ['agent', 'squad'] }).notNull(),
  assigneeId: text('assignee_id').notNull(),
  titleTemplate: text('title_template').notNull(),
  bodyTemplate: text('body_template').notNull().default(''),
  /** Multica autopilot execution_mode: create_issue | run_only */
  executionMode: text('execution_mode', {
    enum: ['create_issue', 'run_only'],
  })
    .notNull()
    .default('create_issue'),
  lastPlannedAt: integer('last_planned_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// —— automation_run（bu05：幂等 UNIQUE(rule_id, planned_at)）——
export const automationRuns = sqliteTable(
  'automation_run',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),
    plannedAt: integer('planned_at').notNull(),
    source: text('source', { enum: ['schedule', 'manual'] }).notNull(),
    status: text('status', {
      enum: [
        // G6-2：两阶段派发占位态（副作用前先落行；UNIQUE 判定赢家）
        'dispatching',
        'issue_created',
        'pending_dispatch',
        'running',
        'retrying',
        'success',
        'failed',
        'skipped',
      ],
    }).notNull(),
    issueId: text('issue_id'),
    linkedRunId: text('linked_run_id'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    uqRulePlanned: uniqueIndex('uq_automation_run_rule_planned').on(t.ruleId, t.plannedAt),
    ruleCreatedIdx: index('idx_automation_run_rule_created').on(t.ruleId, t.createdAt),
  }),
);

// —— activity_log（GAP-01：Issue 结构化活动时间线）——
export const activityLogs = sqliteTable(
  'activity_log',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    actorType: text('actor_type', { enum: ['member', 'agent', 'system'] })
      .notNull()
      .default('system'),
    actorId: text('actor_id'),
    actorName: text('actor_name').notNull().default('系统'),
    eventType: text('event_type').notNull(),
    payload: text('payload'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    issueIdx: index('idx_activity_log_issue').on(t.issueId),
  }),
);
