import { sqliteTable, text, real, integer, index, check } from 'drizzle-orm/sqlite-core';
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
export const agents = sqliteTable('agent', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category'),
  createdAt: integer('created_at').notNull(),
});

// —— squad（spec §3.1，3 行静态，用于 assignee label）——
export const squads = sqliteTable('squad', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  leaderId: text('leader_id'),
  createdAt: integer('created_at').notNull(),
});

// —— skill（spec §3.1，5 行静态，S01 不展示，纯预留）——
export const skills = sqliteTable('skill', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url'),
  createdAt: integer('created_at').notNull(),
});

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
