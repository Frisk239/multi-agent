import { sqliteTable, text, real, integer, index, check, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// —— workspace（spec §3.1，单行）——
export const workspaces = sqliteTable('workspace', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
});

// —— user（spec §3.1，单行林远）——
export const users = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  createdAt: integer('created_at').notNull(),
});

// —— agent（spec §3.1，4 行静态，用于 assignee label）——
// S04：加 concurrency（per-agent 并发槽上限，照 multica 001_init.up.sql:45 max_concurrent_tasks）
// S05：加 mcpServers（MCP 配置 JSON 字符串，spec §3.3）
export const agents = sqliteTable('agent', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category'),
  runtime: text('runtime', { enum: ['claude-code', 'opencode', 'cursor'] })
    .notNull()
    .default('claude-code'),
  concurrency: integer('concurrency').notNull().default(1),
  mcpServers: text('mcp_servers'), // S05：MCP 配置 JSON 字符串
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
export const squads = sqliteTable('squad', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  leaderId: text('leader_id'),
  operatingProtocol: text('operating_protocol').notNull().default(''),
  missionDirective: text('mission_directive').notNull().default(''),
  createdAt: integer('created_at').notNull(),
});

// S05（spec §3.2b / R6）：删 S01 的 skill 死表——skill 改文件系统真源 + 内存索引，
// 不再进 DB。分配关系见上方 agentSkills。

// —— issue（spec §3.2，照 multica 001_init.up.sql:52-72）——
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
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    statusWorkspaceIdx: index('idx_issue_status_workspace').on(t.workspaceId, t.status),
    assigneeIdx: index('idx_issue_assignee').on(t.assigneeType, t.assigneeId),
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
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    issueCreatedIdx: index('idx_comment_issue_created').on(t.issueId, t.createdAt),
  }),
);

// —— agent_run（S03 执行层，薄状态机，对齐 multica task）——
export const agentRuns = sqliteTable(
  'agent_run',
  {
    id: text('id').primaryKey(),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id),
    agentId: text('agent_id').notNull(),
    runtime: text('runtime', { enum: ['claude-code', 'opencode', 'cursor'] }).notNull(),
    status: text('status', {
      enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
    }).notNull(),
    // S04：is_leader + squad_id（照 multica 090/127 migration，标记 squad-leader run）
    isLeader: integer('is_leader').notNull().default(0),
    squadId: text('squad_id'),
    error: text('error'),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    // bu01：执行中 heartbeat；null 时 stale 回退 startedAt/createdAt
    lastHeartbeatAt: integer('last_heartbeat_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    issueIdx: index('idx_agent_run_issue').on(t.issueId),
    statusIdx: index('idx_agent_run_status').on(t.status),
  }),
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
    runSeqIdx: index('idx_run_message_run_seq').on(t.runId, t.seq),
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
    issueId: text('issue_id'),
    agentId: text('agent_id'),
    runId: text('run_id'),
    text: text('text').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    createdIdx: index('idx_memory_item_created').on(t.createdAt),
    issueIdx: index('idx_memory_item_issue').on(t.issueId),
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
