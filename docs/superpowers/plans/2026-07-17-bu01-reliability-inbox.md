# 补1 — Run 可靠性 + 真 Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> 本项目也可按 **计划者-执行者** 拆两棒（impl-1 / impl-2），见文末「执行者拆分」。

**Goal:** 进程杀死/重启后不再出现永久假 `running`；Inbox 从合成 feed 升级为落库 `inbox_item`，支持 list / mark read / archive，侧栏未读角标；subscriber 最小集保证通知有归属。

**Architecture:**  
- **包 A：** `agent_run.last_heartbeat_at` + 执行中 touch；独立 stale sweeper（条件 `UPDATE … WHERE status='running' AND last_heartbeat_at < cutoff`）；启动 orphan 收尸（`running` 且内存无 AbortController）。终态仍走现有 `run:failed` 事件。  
- **包 B：** 新表 `inbox_item` + `issue_subscriber`；在 comment / run 终态 / 指派 路径写通知；`GET /api/inbox` 只读真表；`POST …/read|archive`。默认收件人 = `LOCAL_MEMBER`（纯本地单用户）。  
学 Multica `inbox_item` / FailStale 思想，**不**引入 Redis、多 host claim、dispatched 态。

**Tech Stack:** 现有 monorepo — TypeScript、Fastify、Drizzle + better-sqlite3、Zod shared、Next.js + React Query + Zustand；手写 drizzle SQL migration（禁止依赖交互式 drizzle-kit generate）。

## Global Constraints

- **分支：** `feat/bu01-reliability-inbox` from **origin/main**（须已含 S12）  
- **编号：** 补1 / bu01；handoff：`app/.progress/bu01-impl-1.md`、`bu01-impl-2.md`  
- **不 push main**；合入走 PR  
- **不 commit** `app/packages/server/wiki/`、`*.db`  
- **不落** e2e 测试目录  
- **回归门禁：** `pnpm -r typecheck`；`GET /api/issues`、`/api/wiki/pages`、`/api/memory/status` 200；done→wiki enqueue 行为不破坏  
- **常量（本切片锁定）：**  
  - `HEARTBEAT_INTERVAL_MS = 5_000`  
  - `STALE_RUNNING_MS = 120_000`（2 分钟无 heartbeat → fail）  
  - `STALE_SWEEP_INTERVAL_MS = 15_000`  
  - 默认 recipient：`LOCAL_MEMBER`（`app/packages/server/src/local-member.ts`）  
  - workspace：`ws-local`  
- **迁移序号：** 手写 `0007_bu01_reliability_inbox.sql` + 更新 `drizzle/meta/_journal.json`  
- 每任务结束 **commit**（Conventional Commits：`feat(bu01):` / `fix(bu01):` / `docs(bu01):`）

---

## File Structure

```
app/packages/shared/src/schema.ts
  - AgentRun + lastHeartbeatAt?
  - InboxItem 真源字段（read/archived/severity/type…）
  - DomainEvent + inbox:item（可选）

app/packages/server/src/db/schema.ts
  - agentRuns.lastHeartbeatAt
  - inboxItems 表
  - issueSubscribers 表

app/packages/server/drizzle/0007_bu01_reliability_inbox.sql
app/packages/server/drizzle/meta/_journal.json

app/packages/server/src/db/reshape.ts
  - toAgentRun 含 lastHeartbeatAt
  - toInboxItem

app/packages/server/src/orchestration/run-control.ts
  - listActiveRunIds() / hasRunAbort(runId)

app/packages/server/src/orchestration/run-worker.ts
  - claim 时写 lastHeartbeatAt
  - 执行循环内 heartbeat timer
  - 终态清理 timer

app/packages/server/src/orchestration/stale-runs.ts   [新]
  - failStaleRunningRuns()
  - recoverOrphanedRunningRuns()
  - startStaleRunSweeper()

app/packages/server/src/orchestration/inbox-writer.ts [新]
  - ensureSubscriber / createInboxItem / notify*
  - 幂等：同 (recipient, type, issueId, dedupeKey) 可选简单去重

app/packages/server/src/routes/inbox.ts
  - 替换合成实现 → 真表 + read/archive/unread-count

app/packages/server/src/routes/comments.ts
  - POST comment 后写 inbox + subscriber

app/packages/server/src/routes/issues.ts
  - create/assign 时 subscriber + assigned 通知

app/packages/server/src/orchestration/run-worker.ts 或 inbox-writer 挂钩
  - run completed/failed → inbox

app/packages/server/src/index.ts
  - recoverOrphanedRunningRuns() 在 startRunWorker 前
  - startStaleRunSweeper()

app/packages/web/lib/api.ts
  - useInbox / useMarkInboxRead / useArchiveInbox / useInboxUnreadCount

app/packages/web/components/InboxPage.tsx
  - 已读/归档 UI；未读样式

app/packages/web/components/Sidebar.tsx
  - Inbox 未读角标

app/packages/web/lib/ws.ts
  - 可选：inbox:item → invalidate ['inbox']
  - run:failed 已有 → 列表自会变；inbox 需 invalidate
```

---

### Task 1: Shared 契约 + DB schema + migration

**Files:**
- Modify: `app/packages/shared/src/schema.ts`
- Modify: `app/packages/server/src/db/schema.ts`
- Create: `app/packages/server/drizzle/0007_bu01_reliability_inbox.sql`
- Modify: `app/packages/server/drizzle/meta/_journal.json`
- Modify: `app/packages/server/src/db/reshape.ts`

**Interfaces:**
- Produces:
  - `AgentRun.lastHeartbeatAt: string | null`（ISO）
  - `InboxItem` 真源形状（见下）
  - 表 `inbox_item`、`issue_subscriber`；列 `agent_run.last_heartbeat_at`

- [ ] **Step 1: 扩展 `AgentRun`**

在 `AgentRun` object 增加（保持其余字段不变）：

```ts
lastHeartbeatAt: z.string().datetime().nullable().optional(),
```

（API 始终返回字段更清晰：用 `.nullable()` 非 optional，reshape 永远给 `string | null`。）

推荐：

```ts
lastHeartbeatAt: z.string().datetime().nullable(),
```

- [ ] **Step 2: 替换 S12 合成 `InboxItem` 为真源契约**

删除/替换 `InboxItemKind` / `InboxItem` 为：

```ts
export const InboxItemType = z.enum([
  'comment',
  'run_completed',
  'run_failed',
  'assigned',
]);
export type InboxItemType = z.infer<typeof InboxItemType>;

export const InboxSeverity = z.enum(['action_required', 'attention', 'info']);
export type InboxSeverity = z.infer<typeof InboxSeverity>;

// 兼容旧前端：kind 作为 type 的别名字段（响应里同时带 type + kind，kind===type）
export const InboxItem = z.object({
  id: BusinessId,
  type: InboxItemType,
  kind: InboxItemType, // 与 type 相同，兼容 S12 UI
  severity: InboxSeverity,
  title: z.string(),
  body: z.string().nullable(),
  summary: z.string(), // title 或 title+body 截断，列表一行文案
  issueId: BusinessId.nullable(),
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
```

`DomainEvent` 增加（可选但推荐）：

```ts
| { type: 'inbox:item'; item: InboxItem }
```

若加了，`ws.ts` 后续 invalidate；不加则 mutation/onSuccess + 轮询也可（本计划 **要求加** 事件，前端 invalidate）。

- [ ] **Step 3: Drizzle schema**

`agentRuns` 增加：

```ts
lastHeartbeatAt: integer('last_heartbeat_at'),
```

新建：

```ts
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
    // 简单去重键：如 comment:<commentId> / run:<runId>:<status> / assign:<issueId>:<assigneeKey>
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
```

- [ ] **Step 4: 手写 migration `0007_bu01_reliability_inbox.sql`**

```sql
ALTER TABLE `agent_run` ADD `last_heartbeat_at` integer;
--> statement-breakpoint
CREATE TABLE `inbox_item` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`recipient_type` text NOT NULL,
	`recipient_id` text NOT NULL,
	`type` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`issue_id` text,
	`title` text NOT NULL,
	`body` text,
	`actor_type` text,
	`actor_id` text,
	`dedupe_key` text,
	`read` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_recipient_created` ON `inbox_item` (`recipient_type`,`recipient_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_inbox_dedupe` ON `inbox_item` (`recipient_type`,`recipient_id`,`dedupe_key`);
--> statement-breakpoint
CREATE TABLE `issue_subscriber` (
	`issue_id` text NOT NULL,
	`user_type` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`issue_id`, `user_type`, `user_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON UPDATE no action ON DELETE cascade
);
```

`_journal.json` 增加 idx 7 条目（`when` 用当前合理时间戳，`tag`: `0007_bu01_reliability_inbox`）。

- [ ] **Step 5: reshape**

`toAgentRun`：

```ts
lastHeartbeatAt: row.lastHeartbeatAt != null
  ? new Date(row.lastHeartbeatAt).toISOString()
  : null,
```

新增 `toInboxItem(row, issueMeta?)`：`read: row.read === 1`，`kind: row.type`，`summary` = body ? `${title}: ${trunc(body,100)}` : title。

- [ ] **Step 6: typecheck + migrate smoke**

```bash
cd app && pnpm --filter @ma/shared typecheck
cd app/packages/server && pnpm exec tsx src/db/migrate.ts
```

Expected: shared 绿；migrate 打印 `✓ 迁移完成`（对已有 dev.db 可加列；若本地 db 锁死可删 worktree 内 dev.db 再 migrate+seed）。

- [ ] **Step 7: Commit**

```bash
git add app/packages/shared app/packages/server/src/db app/packages/server/drizzle
git commit -m "feat(bu01): schema for run heartbeat + inbox_item + subscriber"
```

---

### Task 2: Run 可靠性 — heartbeat / stale / orphan

**Files:**
- Modify: `app/packages/server/src/orchestration/run-control.ts`
- Create: `app/packages/server/src/orchestration/stale-runs.ts`
- Modify: `app/packages/server/src/orchestration/run-worker.ts`
- Modify: `app/packages/server/src/index.ts`

**Interfaces:**
- Consumes: `agentRuns.lastHeartbeatAt`；`eventBus`；`toAgentRun`
- Produces:
  - `listActiveRunIds(): string[]`
  - `hasRunAbort(runId: string): boolean`
  - `touchRunHeartbeat(runId: string): void`
  - `failStaleRunningRuns(now?: number): number` // 返回失败条数
  - `recoverOrphanedRunningRuns(): number`
  - `startStaleRunSweeper(): void`

- [ ] **Step 1: 扩展 run-control**

```ts
export function hasRunAbort(runId: string): boolean {
  return aborts.has(runId);
}

export function listActiveRunIds(): string[] {
  return [...aborts.keys()];
}
```

- [ ] **Step 2: 实现 `stale-runs.ts`**

```ts
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { hasRunAbort } from './run-control.js';

export const STALE_RUNNING_MS = 120_000;
export const STALE_SWEEP_INTERVAL_MS = 15_000;

export function touchRunHeartbeat(runId: string, at = Date.now()): void {
  db.update(agentRuns)
    .set({ lastHeartbeatAt: at })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.status, 'running')))
    .run();
}

/** running 且 (heartbeat 过旧 或 null 且 startedAt 过旧) → failed */
export function failStaleRunningRuns(now = Date.now()): number {
  const cutoff = now - STALE_RUNNING_MS;
  const candidates = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'running'))
    .all();

  let n = 0;
  for (const row of candidates) {
    const hb = row.lastHeartbeatAt ?? row.startedAt ?? row.createdAt;
    if (hb > cutoff) continue;
    // 仍有内存 abort 且 hb 只是漏写：若 hasRunAbort 且 hb 很新不会进；若有 abort 但 hb 过旧仍 fail（进程假死）
    const finishedAt = now;
    db.update(agentRuns)
      .set({
        status: 'failed',
        finishedAt,
        error: 'stale: heartbeat timeout',
      })
      .where(and(eq(agentRuns.id, row.id), eq(agentRuns.status, 'running')))
      .run();
    const next = db.select().from(agentRuns).where(eq(agentRuns.id, row.id)).get();
    if (next?.status === 'failed') {
      eventBus.publish({ type: 'run:failed', run: toAgentRun(next) });
      n++;
    }
  }
  return n;
}

/** 启动时：DB 中 running 但本进程无 AbortController → 上轮崩溃残留 */
export function recoverOrphanedRunningRuns(now = Date.now()): number {
  const rows = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'running'))
    .all();
  let n = 0;
  for (const row of rows) {
    if (hasRunAbort(row.id)) continue;
    db.update(agentRuns)
      .set({
        status: 'failed',
        finishedAt: now,
        error: 'orphan: no live executor after restart',
      })
      .where(and(eq(agentRuns.id, row.id), eq(agentRuns.status, 'running')))
      .run();
    const next = db.select().from(agentRuns).where(eq(agentRuns.id, row.id)).get();
    if (next?.status === 'failed') {
      eventBus.publish({ type: 'run:failed', run: toAgentRun(next) });
      n++;
    }
  }
  if (n > 0) console.warn(`[run] recovered ${n} orphaned running run(s)`);
  return n;
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startStaleRunSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    try {
      failStaleRunningRuns();
    } catch (e) {
      console.error('[run] stale sweep failed', e);
    }
  }, STALE_SWEEP_INTERVAL_MS);
}
```

注意：去掉未使用的 import（`isNull`/`or`/`sql`/`inArray` 若未用则不要写）。

- [ ] **Step 3: run-worker 接入 heartbeat**

在 **claim 成功** 的 `set({ status: 'running', startedAt: now })` 同步设 `lastHeartbeatAt: now`。

在 `executeRun` 开头 `registerRunAbort` 之后：

```ts
const hb = setInterval(() => {
  touchRunHeartbeat(runRow.id);
}, 5_000);
```

在所有退出路径（completed / failed / cancelled / catch）`finally` 式：

```ts
clearInterval(hb);
```

（用 try/finally 包住 execute 主体，避免漏清。）

- [ ] **Step 4: index.ts 启动序**

```ts
import {
  recoverOrphanedRunningRuns,
  startStaleRunSweeper,
} from './orchestration/stale-runs.js';

// listen 前：
recoverOrphanedRunningRuns();
startRunWorker();
startStaleRunSweeper();
startWikiIngestWorker();
```

- [ ] **Step 5: 手动可靠性 smoke（可写在 handoff）**

1. migrate + seed  
2. 起 server  
3. 用 sqlite 或临时脚本把某 run 标 `running` 且 `last_heartbeat_at = Date.now()-180000`  
4. 等 15s+ 或直接调 `failStaleRunningRuns`（可在 node repl / 临时 script）  
5. 确认 status=failed、error 含 `stale`  
6. 再插一条 running 无 abort，重启 server，确认 orphan fail  

最小内联脚本（仅 dev，不提交）：

```bash
cd app/packages/server && pnpm exec tsx -e "
import { db } from './src/db/client.ts';
import { agentRuns } from './src/db/schema.ts';
import { failStaleRunningRuns, recoverOrphanedRunningRuns } from './src/orchestration/stale-runs.ts';
console.log('stale', failStaleRunningRuns());
console.log('orphan', recoverOrphanedRunningRuns());
"
```

（若 tsx 路径别名失败，用已 listen 的日志 + SQL 手改验收。）

- [ ] **Step 6: typecheck + commit**

```bash
cd app && pnpm -r typecheck
git add app/packages/server/src/orchestration app/packages/server/src/index.ts
git commit -m "feat(bu01): run heartbeat, stale sweeper, orphan recovery"
```

---

### Task 3: Inbox writer + subscriber + 替换 GET /api/inbox + mutations

**Files:**
- Create: `app/packages/server/src/orchestration/inbox-writer.ts`
- Modify: `app/packages/server/src/routes/inbox.ts`
- Modify: `app/packages/server/src/routes/comments.ts`
- Modify: `app/packages/server/src/routes/issues.ts`
- Modify: `app/packages/server/src/orchestration/run-worker.ts`（终态钩子；cancel 路径可选不写或写 info）

**Interfaces:**
- Produces:
  - `ensureIssueSubscriber(issueId, userType, userId, reason): void`
  - `notifyInbox(input): InboxItem | null` // dedupe 命中返回 null
  - `notifyCommentCreated(comment, issue): void`
  - `notifyRunTerminal(run): void` // completed | failed only
  - `notifyAssigned(issue, actor): void`
- API:
  - `GET /api/inbox?includeArchived=0&limit=50` → `{ items, unreadCount }` **或** 仍返回数组且 `X-Unread-Count` —— **本计划固定 JSON：`InboxListResponse`**
  - `POST /api/inbox/:id/read` → item
  - `POST /api/inbox/:id/archive` → item
  - `GET /api/inbox/unread-count` → `{ count }`（角标轻量；也可只靠 list.unreadCount）

- [ ] **Step 1: `inbox-writer.ts` 核心**

```ts
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { inboxItems, issueSubscribers, issues } from '../db/schema.js';
import { toInboxItem } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { LOCAL_MEMBER } from '../local-member.js';
import type { Comment, AgentRun, Issue } from '@ma/shared';

const WS = 'ws-local';

export function ensureIssueSubscriber(
  issueId: string,
  userType: 'member' | 'agent',
  userId: string,
  reason: string,
): void {
  const now = Date.now();
  // INSERT OR IGNORE 语义
  const existing = db
    .select()
    .from(issueSubscribers)
    .where(
      and(
        eq(issueSubscribers.issueId, issueId),
        eq(issueSubscribers.userType, userType),
        eq(issueSubscribers.userId, userId),
      ),
    )
    .get();
  if (existing) return;
  db.insert(issueSubscribers)
    .values({
      issueId,
      userType,
      userId,
      reason,
      createdAt: now,
    })
    .run();
}

export function notifyInbox(opts: {
  type: 'comment' | 'run_completed' | 'run_failed' | 'assigned';
  severity: 'action_required' | 'attention' | 'info';
  title: string;
  body?: string | null;
  issueId: string | null;
  actorType?: string | null;
  actorId?: string | null;
  dedupeKey: string;
  recipientType?: 'member' | 'agent';
  recipientId?: string;
}): ReturnType<typeof toInboxItem> | null {
  const recipientType = opts.recipientType ?? 'member';
  const recipientId = opts.recipientId ?? LOCAL_MEMBER.id;

  if (opts.dedupeKey) {
    const dup = db
      .select()
      .from(inboxItems)
      .where(
        and(
          eq(inboxItems.recipientType, recipientType),
          eq(inboxItems.recipientId, recipientId),
          eq(inboxItems.dedupeKey, opts.dedupeKey),
        ),
      )
      .get();
    if (dup) return null;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  db.insert(inboxItems)
    .values({
      id,
      workspaceId: WS,
      recipientType,
      recipientId,
      type: opts.type,
      severity: opts.severity,
      issueId: opts.issueId,
      title: opts.title,
      body: opts.body ?? null,
      actorType: opts.actorType ?? null,
      actorId: opts.actorId ?? null,
      dedupeKey: opts.dedupeKey,
      read: 0,
      archived: 0,
      createdAt: now,
    })
    .run();

  const row = db.select().from(inboxItems).where(eq(inboxItems.id, id)).get()!;
  let issueMeta: { identifier: string; title: string } | undefined;
  if (row.issueId) {
    const iss = db.select().from(issues).where(eq(issues.id, row.issueId)).get();
    if (iss) issueMeta = { identifier: iss.identifier, title: iss.title };
  }
  const item = toInboxItem(row, issueMeta);
  eventBus.publish({ type: 'inbox:item', item });
  return item;
}

export function notifyCommentCreated(comment: Comment, issue: Issue): void {
  // status_change 不进 inbox（补1 收敛 S12 噪音）
  if (comment.type !== 'comment') return;
  ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'creator_or_participant');
  // 自己写的评论：仍通知（本地单用户可看到动态）；若要跳过 member 自己可在此 return
  notifyInbox({
    type: 'comment',
    severity: 'attention',
    title: `新评论 · ${issue.identifier}`,
    body: comment.body.slice(0, 500),
    issueId: issue.id,
    actorType: comment.authorType,
    actorId: comment.authorId,
    dedupeKey: `comment:${comment.id}`,
  });
}

export function notifyRunTerminal(run: AgentRun): void {
  if (run.status !== 'completed' && run.status !== 'failed') return;
  const issue = db.select().from(issues).where(eq(issues.id, run.issueId)).get();
  if (!issue) return;
  ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'run_watcher');
  const failed = run.status === 'failed';
  notifyInbox({
    type: failed ? 'run_failed' : 'run_completed',
    severity: failed ? 'action_required' : 'info',
    title: failed
      ? `Run 失败 · ${issue.identifier}`
      : `Run 完成 · ${issue.identifier}`,
    body: run.error ?? null,
    issueId: issue.id,
    actorType: 'agent',
    actorId: run.agentId,
    dedupeKey: `run:${run.id}:${run.status}`,
  });
}

export function notifyAssigned(issue: Issue): void {
  ensureIssueSubscriber(issue.id, 'member', LOCAL_MEMBER.id, 'assignee_watch');
  notifyInbox({
    type: 'assigned',
    severity: 'attention',
    title: `已指派 · ${issue.identifier}`,
    body: issue.title,
    issueId: issue.id,
    actorType: 'member',
    actorId: LOCAL_MEMBER.id,
    dedupeKey: `assign:${issue.id}:${issue.assignee?.type ?? ''}:${issue.assignee?.id ?? ''}:${issue.updatedAt}`,
  });
}
```

- [ ] **Step 2: 接线 comments / issues / run-worker**

- `comments.ts` POST 成功、`toComment` 后：`notifyCommentCreated(comment, toIssue(issueRow))`（issue 行转 Issue）。  
- `issues.ts` POST 创建成功：`ensureIssueSubscriber(..., 'creator')`；若有 assignee → `notifyAssigned`。  
- `issues.ts` PUT 指派变更成功：subscriber + `notifyAssigned`。  
- `run-worker.ts`：在 `run:completed` / `run:failed` publish **之后** 调 `notifyRunTerminal(r)`（cancelled 默认不写 inbox，避免噪声）。

- [ ] **Step 3: 重写 `routes/inbox.ts`**

```ts
// GET /api/inbox → { items, unreadCount }
// 默认 archived=0；query includeArchived=1 可含归档
// limit 默认 50 max 200
// POST /api/inbox/:id/read
// POST /api/inbox/:id/archive
// GET /api/inbox/unread-count → { count }
```

Read/archive：仅 `recipient = LOCAL_MEMBER`；404 若无行。  
条件更新 `read=1` / `archived=1`。

**Breaking：** S12 客户端期望数组 —— Task 4 同步改 web；server 以 `InboxListResponse` 为准。

- [ ] **Step 4: API smoke**

```bash
# migrate seed 后起 server PORT=3013
curl -s localhost:3013/api/inbox | head
# 应含 items 数组字段
curl -s -X POST localhost:3013/api/issues/ISSUED/comments -H 'content-type: application/json' -d '{"body":"bu01 inbox"}'
curl -s localhost:3013/api/inbox | jq '.unreadCount, .items[0]'
curl -s -X POST localhost:3013/api/inbox/ITEM_ID/read
curl -s localhost:3013/api/inbox/unread-count
```

Expected: 评论后 unreadCount≥1；read 后降；items[].id 为 UUID 非 `comment:…`。

- [ ] **Step 5: typecheck + commit**

```bash
cd app && pnpm -r typecheck
git add app/packages/server/src
git commit -m "feat(bu01): persisted inbox_item + writer hooks + APIs"
```

---

### Task 4: Web Inbox UI + 未读角标 + WS

**Files:**
- Modify: `app/packages/web/lib/api.ts`
- Modify: `app/packages/web/components/InboxPage.tsx`
- Modify: `app/packages/web/components/Sidebar.tsx`
- Modify: `app/packages/web/lib/ws.ts`
- Modify: `app/packages/web/app/globals.css`（未读样式，如有）

**Interfaces:**
- Consumes: `InboxListResponse`、`POST read/archive`
- Produces: 可用的真 Inbox UX

- [ ] **Step 1: api hooks**

```ts
export function useInbox() {
  return useQuery<InboxListResponse>({
    queryKey: ['inbox'],
    queryFn: async () => {
      const res = await fetch(`${API}/inbox`);
      if (!res.ok) throw new Error('加载 Inbox 失败');
      return res.json();
    },
  });
}

export function useInboxUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: ['inbox-unread'],
    queryFn: async () => {
      const res = await fetch(`${API}/inbox/unread-count`);
      if (!res.ok) throw new Error('加载未读失败');
      return res.json();
    },
    refetchInterval: 30_000,
  });
}

export function useMarkInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API}/inbox/${id}/read`, { method: 'POST' });
      if (!res.ok) throw new Error('标记已读失败');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['inbox-unread'] });
    },
  });
}

export function useArchiveInbox() {
  // 同理 POST .../archive
}
```

- [ ] **Step 2: InboxPage**

- 使用 `data.items`；展示 severity / read 态（未读加粗或左侧条）  
- 行点击：可选先 mark read 再 `router.push(/issues/id)`  
- 行内按钮：「已读」「归档」  
- `assigned` kind 标签文案「指派」  
- EmptyState 保持  

- [ ] **Step 3: Sidebar 角标**

`useInboxUnreadCount()`，在 Inbox nav 项旁显示 count（0 不显示）。

- [ ] **Step 4: ws.ts**

```ts
if (event.type === 'inbox:item') {
  qc.invalidateQueries({ queryKey: ['inbox'] });
  qc.invalidateQueries({ queryKey: ['inbox-unread'] });
}
// run 终态已有 cache 更新；另 invalidate inbox 以防 writer 延迟
if (event.type === 'run:completed' || event.type === 'run:failed') {
  qc.invalidateQueries({ queryKey: ['inbox'] });
  qc.invalidateQueries({ queryKey: ['inbox-unread'] });
}
```

确保 shared `DomainEvent` 含 `inbox:item` 后 TS 通过。

- [ ] **Step 5: typecheck + 页面 smoke**

```bash
cd app && pnpm -r typecheck
# web 起在 3000，打开 /inbox，评论后角标与列表
```

- [ ] **Step 6: Commit**

```bash
git add app/packages/web app/packages/shared
git commit -m "feat(bu01): inbox UI read/archive + unread badge"
```

---

### Task 5: 回归、handoff、计划者验收清单

**Files:**
- Create: `app/.progress/bu01-impl-1.md` 和/或 `bu01-impl-2.md`（按执行棒）
- Modify: `docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md` 进度表（补1 → 进行中/完成）

- [ ] **Step 1: 全量 typecheck**

```bash
cd app && pnpm -r typecheck
```

Expected: shared / server / web 全绿。

- [ ] **Step 2: 回归 API**

```bash
curl -s -o /dev/null -w "%{http_code}" localhost:PORT/api/issues
curl -s -o /dev/null -w "%{http_code}" localhost:PORT/api/wiki/pages
curl -s -o /dev/null -w "%{http_code}" localhost:PORT/api/memory/status
curl -s localhost:PORT/api/inbox | head -c 200
```

Expected: 200；inbox JSON 含 `items`。

- [ ] **Step 3: 验收勾选（写入 handoff）**

- [ ] 启动 orphan：预置 running → 重启 → failed + error `orphan:`  
- [ ] stale：running + 旧 heartbeat → sweep 后 failed `stale:`  
- [ ] 评论 → inbox 行 UUID + unread+1  
- [ ] mark read → unread-1  
- [ ] archive → 默认列表消失  
- [ ] run fail/complete → inbox  
- [ ] 指派 → assigned 类型  
- [ ] status_change **不**进 inbox  
- [ ] 侧栏角标  
- [ ] typecheck 绿  
- [ ] wiki/memory/issues 回归  

- [ ] **Step 4: handoff + commit docs**

```bash
git add app/.progress/bu01-*.md docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md
git commit -m "docs(bu01): handoff and progress"
```

- [ ] **Step 5: push 分支（非 main）**

```bash
git push -u origin feat/bu01-reliability-inbox
```

---

## 执行者拆分（本项目惯例）

| 棒 | Tasks | 产出 |
|---|---|---|
| **impl-1** | Task 1–2 | migration、heartbeat/stale/orphan；handoff `bu01-impl-1.md` |
| **impl-2** | Task 3–5 | inbox 落库 API+钩子+UI+角标+回归；`bu01-impl-2.md` |

契约：impl-1 合并前 shared 的 `AgentRun.lastHeartbeatAt` 必须落地；impl-2 改 `InboxItem` 形状时 **同一分支连续提交**，避免 main 半残（整刀一个 PR）。

---

## Self-Review（计划自检）

| Spec 要求 | 对应 Task |
|---|---|
| heartbeat + stale sweeper | Task 2 |
| 启动 orphan 收尸 | Task 2 |
| `inbox_item` 落库 | Task 1 + 3 |
| subscriber 最小集 | Task 3 |
| read / archive API | Task 3 |
| 替换合成 GET | Task 3 |
| Inbox UI + 角标 | Task 4 |
| 不引入 Redis/多 host | Global Constraints |
| Wiki/Memory 回归 | Task 5 |
| status_change 降噪 | Task 3 notifyCommentCreated |

无 TBD 占位；类型前后一致：`InboxListResponse`、`notifyRunTerminal`、`lastHeartbeatAt`。

---

## 明确不做（补1）

- Agent 作为 inbox recipient 全量  
- deferred / dispatched 状态  
- Autopilot / Agent CRUD / Quick-create（补2+）  
- 固化 e2e  

---

## 执行交接

**Plan complete and saved to `docs/superpowers/plans/2026-07-17-bu01-reliability-inbox.md`.**

**Two execution options:**

1. **Subagent-Driven（recommended）** — 每 Task 新子代理 + 任务间审查（`superpowers:subagent-driven-development`）  
2. **Inline / 计划者-执行者** — 本会话或新会话按 impl-1 → impl-2 执行（`executing-plans` 或项目 handoff 模式）

**Which approach?** 默认推荐：**worktree + 执行者 impl-1 先跑 Task 1–2**。
