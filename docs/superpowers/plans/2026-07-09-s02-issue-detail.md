# S02 Issue 详情 + 时间线 + 评论 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **本项目工程模式：** AGENTS.md「垂直切片 × 计划者-执行者」。计划者把本计划按依赖切成执行者片段；每个片段由**新会话**执行；交接靠 `app/.progress/s02-*.md`。下面 `impl-1 / impl-2 / impl-3` 是参考边界（契约+DB → server → web），计划者可合并/拆分。
> **spec 真源：** [`docs/superpowers/specs/2026-07-09-s02-issue-detail-design.md`](../specs/2026-07-09-s02-issue-detail-design.md)（动手前必读对应章节）
> **前置 handoff：** [`app/.progress/s01-planner-2.md`](../../../app/.progress/s01-planner-2.md) · [`app/.progress/s02-planner-1.md`](../../../app/.progress/s02-planner-1.md)

**Goal:** 独立详情页 `/issues/[id]` + comment 时间线（含 status_change）+ 发评论 / @ 补全 agent+squad + 轻 MD/pill + WS 实时；关闭 D11/D12。

**Architecture:** 复用 S01 monorepo。一张 `comment` 表作时间线真源（`type=comment|status_change`）。PUT issue 在 status 真变时同事务写 status_change 并双广播。web 新增详情路由；看板卡片链入详情。

**Tech Stack:** 同 S01 + `react-markdown`（仅 web）

---

## Global Constraints

- **分支：** `feat/s02-issue-detail`（从最新 `main` 开），工程代码不进 main 直推
- **端口：** server :3001 · web :3000
- **本地用户：** `LOCAL_MEMBER = { id: 'user-linyuan', name: '林远' }`（已有 user 表），禁止 `member-local`
- **BusinessId（D11）：** `z.string().min(1)`，shared 内**不得**再对业务字段用 `z.string().uuid()`
- **status_change body：** `JSON.stringify({ from, to })`，禁止自由中文
- **D12：** 乐观只改 Issue cache 字段；**禁止**乐观插入 timeline 行
- **描述：** 纯文本；MD 仅 comment body
- **不动：** `references/repos/`、`chanpin/prototype/`
- **Conventional Commits：** `feat(s02):` / `docs(s02):` / `chore(s02):`
- **工作语言：** 中文注释/seed，标识符英文

## 文件结构（分解决策锁定）

```
app/packages/
├── shared/src/
│   └── schema.ts              MODIFY — D11 + Comment + 事件
├── server/src/
│   ├── db/
│   │   ├── schema.ts          MODIFY — comments 表
│   │   ├── seed.ts            MODIFY — 按 identifier 插评论
│   │   ├── reshape.ts         MODIFY — toComment + resolveAuthorLabel 可放 client
│   │   └── client.ts          MODIFY — resolveAuthorLabel
│   ├── routes/
│   │   ├── issues.ts          MODIFY — GET :id · PUT 事务 status_change
│   │   ├── comments.ts        CREATE — GET/POST comments
│   │   └── roster.ts          CREATE — GET agents/squads
│   └── app.ts                 MODIFY — 注册新路由
│   drizzle/0001_*.sql         CREATE — 经 drizzle-kit generate
└── web/
    ├── app/
    │   ├── page.tsx           保持看板
    │   ├── issues/[id]/page.tsx  CREATE
    │   └── globals.css        MODIFY — timeline/mention 样式
    ├── components/
    │   ├── IssueCard.tsx      MODIFY — Link 进详情
    │   ├── IssueDetail.tsx    CREATE
    │   ├── IssueHeader.tsx    CREATE
    │   ├── Timeline.tsx       CREATE
    │   ├── TimelineItem.tsx   CREATE
    │   ├── MarkdownBody.tsx   CREATE
    │   ├── CommentComposer.tsx CREATE
    │   └── MentionAutocomplete.tsx CREATE（可内嵌 Composer）
    └── lib/
        ├── api.ts             MODIFY — hooks + D12
        └── ws.ts              MODIFY — comment:created + issue 详情 cache
```

---

# 执行者片段 A（impl-1）：shared 契约 + comment 表 + seed

> **会话边界：** 新会话。读 AGENTS.md + S02 spec §2–§4 + 本 Task 组 + `s02-planner-1.md`。  
> 从 `main` 拉最新后：`git checkout -b feat/s02-issue-detail`（若分支已存在则 checkout 继续）。  
> 完成后写 `app/.progress/s02-impl-1.md`。

### Task 1.1: 建 feature 分支

**Files:** 无代码

- [ ] **Step 1: 分支**

```bash
cd D:/code/multi-agent
git checkout main
git pull origin main
git checkout -b feat/s02-issue-detail
git status
```

预期：在 `feat/s02-issue-detail`，working tree clean（可忽略无关 untracked）。

- [ ] **Step 2: 提交空提交可选** — 不需要；下一步直接改代码。

---

### Task 1.2: shared — D11 + Comment 契约

**Files:**
- Modify: `app/packages/shared/src/schema.ts`（整文件替换为下列完整内容，或等价 diff）
- Verify: `app/packages/shared/src/index.ts` 仍为 `export * from './schema.js'`

- [ ] **Step 1: 写入完整 `schema.ts`**

```typescript
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
  // assignee 仍不开放（S02 N2 指派只读）
});
export type UpdateIssueInput = z.infer<typeof UpdateIssueInput>;

export function validateUpdateIssue(d: UpdateIssueInput): boolean {
  return (
    d.title !== undefined ||
    d.description !== undefined ||
    d.status !== undefined ||
    d.priority !== undefined ||
    d.position !== undefined
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
});
export type AgentSummary = z.infer<typeof AgentSummary>;

export const SquadSummary = z.object({
  id: BusinessId,
  name: z.string(),
});
export type SquadSummary = z.infer<typeof SquadSummary>;

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

export type DomainEvent = IssueCreatedEvent | IssueUpdatedEvent | CommentCreatedEvent;
```

- [ ] **Step 2: 确认无 uuid 残留**

```bash
cd D:/code/multi-agent/app
rg "z\.string\(\)\.uuid" packages/shared
```

预期：无匹配（Windows 可用 `pnpm exec` 或 IDE 搜索；无 `rg` 时用编辑器搜 `uuid()`）。

- [ ] **Step 3: typecheck shared**

```bash
cd D:/code/multi-agent/app
pnpm --filter @ma/shared typecheck
```

预期：通过。

- [ ] **Step 4: 提交**

```bash
cd D:/code/multi-agent
git add app/packages/shared
git commit -m "feat(s02): shared BusinessId(D11) + Comment/Timeline 契约 + comment:created 事件"
```

---

### Task 1.3: Drizzle comments 表 + migration

**Files:**
- Modify: `app/packages/server/src/db/schema.ts` — 追加 `comments` 表
- Create: migration via drizzle-kit（`0001_*.sql`）

- [ ] **Step 1: 在 `schema.ts` 追加 comments（保留现有表不动）**

在文件末尾 `issues` 表定义之后添加：

```typescript
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
```

确认文件顶部已 import `index`（S01 已有）。

- [ ] **Step 2: generate migration**

```bash
cd D:/code/multi-agent/app
pnpm --filter @ma/server db:generate
```

预期：`packages/server/drizzle/` 出现 `0001_*.sql`，含 `CREATE TABLE comment`。

- [ ] **Step 3: 重置 dev.db 并 migrate（R7）**

```bash
cd D:/code/multi-agent/app/packages/server
# PowerShell
Remove-Item -ErrorAction SilentlyContinue dev.db, dev.db-shm, dev.db-wal
cd D:/code/multi-agent/app
pnpm --filter @ma/server db:migrate
```

预期：`✓ 迁移完成`。

- [ ] **Step 4: 提交 schema + migration**

```bash
cd D:/code/multi-agent
git add app/packages/server/src/db/schema.ts app/packages/server/drizzle
git commit -m "feat(s02): comment 表 Drizzle schema + migration 0001"
```

---

### Task 1.4: reshape toComment + resolveAuthorLabel + seed 评论

**Files:**
- Modify: `app/packages/server/src/db/client.ts`
- Modify: `app/packages/server/src/db/reshape.ts`
- Modify: `app/packages/server/src/db/seed.ts`

- [ ] **Step 1: `client.ts` 增加 `resolveAuthorLabel`**

在现有 `resolveAssigneeLabel` 旁追加：

```typescript
export function resolveAuthorLabel(
  type: 'member' | 'agent',
  id: string,
): string {
  if (type === 'member') {
    const u = db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
    return u?.name ?? id;
  }
  const a = db.query.agents.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
  return a?.name ?? id;
}
```

- [ ] **Step 2: `reshape.ts` 增加 `toComment`**

完整文件目标形态：

```typescript
import type { Issue, Assignee, Comment } from '@ma/shared';
import type { issues, comments } from '../db/schema.js';
import { resolveAssigneeLabel, resolveAuthorLabel } from './client.js';

type IssueRow = typeof issues.$inferSelect;
type CommentRow = typeof comments.$inferSelect;

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
```

注意：`import type { issues, comments }` 若 TS 报错，改为：

```typescript
import { issues, comments } from './schema.js';
type IssueRow = typeof issues.$inferSelect;
type CommentRow = typeof comments.$inferSelect;
```

（与现网 S01 写法保持一致即可。）

- [ ] **Step 3: `seed.ts` 在 issues 循环之后插入评论**

在现有 `for (const iss of seedIssues) { ... }` **之后**追加（不要改 issue 插入逻辑）：

```typescript
import { comments } from './schema.js';
import { eq } from 'drizzle-orm';

const USER_ID = 'user-linyuan'; // 已存在则复用

// 原型 seed.js 时间线（按 identifier 挂靠；issue.id 每次 seed 新 UUID）
type SeedComment = {
  identifier: string;
  authorType: 'member' | 'agent';
  authorId: string;
  body: string;
  createdAt: number; // ms
};

const seedComments: SeedComment[] = [
  {
    identifier: 'FRI-11',
    authorType: 'member',
    authorId: USER_ID,
    body: '请基于调研写 PRD，并派原型官做可点击 demo。',
    createdAt: Date.parse('2026-07-08T05:53:00Z'),
  },
  {
    identifier: 'FRI-11',
    authorType: 'agent',
    authorId: 'agt-lead',
    body: `## Operating Protocol

本 Issue 由产品小队承接。Roster：[@产品·调研与洞察官](mention://agent/agt-research)、[@产品·需求与PRD官](mention://agent/agt-prd)、[@产品·设计·原型官](mention://agent/agt-proto)

[@产品·调研与洞察官](mention://agent/agt-research) 请先完成 research/ 交付，再串 PRD → 原型。`,
    createdAt: Date.parse('2026-07-08T05:55:00Z'),
  },
  {
    identifier: 'FRI-11',
    authorType: 'agent',
    authorId: 'agt-research',
    body: 'research/ 已交付：persona、JTBD、竞品矩阵、Multica 对标表。',
    createdAt: Date.parse('2026-07-08T05:58:00Z'),
  },
  {
    identifier: 'FRI-10',
    authorType: 'agent',
    authorId: 'agt-research',
    body: 'competitive-analysis.md 与 multica-feature-matrix.md 已写入 research/。',
    createdAt: Date.parse('2026-07-08T05:50:00Z'),
  },
  {
    identifier: 'FRI-09',
    authorType: 'member',
    authorId: USER_ID,
    body: 'Open Questions 需在 PRD 内拍板：暗色、Wiki 5 页、Cursor mock。',
    createdAt: Date.parse('2026-07-08T05:59:00Z'),
  },
  {
    identifier: 'FRI-09',
    authorType: 'agent',
    authorId: 'agt-prd',
    body: 'PRD v1.0 已交付，RTM 覆盖 ISS/SQD/AGT/SKL/NAV/WIK 全 Must 域。',
    createdAt: Date.parse('2026-07-08T06:05:00Z'),
  },
];

let commentCount = 0;
for (const c of seedComments) {
  const issue = db.select().from(issues).where(eq(issues.identifier, c.identifier)).get();
  if (!issue) {
    console.warn(`⚠ seed comment 跳过：找不到 issue ${c.identifier}`);
    continue;
  }
  db.insert(comments)
    .values({
      id: crypto.randomUUID(),
      issueId: issue.id,
      type: 'comment',
      authorType: c.authorType,
      authorId: c.authorId,
      body: c.body,
      createdAt: c.createdAt,
    })
    .run();
  commentCount++;
}

console.log(`✓ seed 完成：${seedIssues.length} 条 issue，${commentCount} 条 comment`);
```

确保 `seed.ts` 顶部 import 含 `comments`、`eq`；`USER_ID` 不重复声明（已有则只引用）。

- [ ] **Step 4: 重新 migrate（若已 migrate 可跳过）+ seed**

```bash
cd D:/code/multi-agent/app/packages/server
Remove-Item -ErrorAction SilentlyContinue dev.db, dev.db-shm, dev.db-wal
cd D:/code/multi-agent/app
pnpm --filter @ma/server db:migrate
pnpm --filter @ma/server db:seed
```

预期：日志含 `6 条 comment`（或至少 FRI-11 的 3 条）。

- [ ] **Step 5: 抽查 SQLite（可选但推荐）**

```bash
cd D:/code/multi-agent/app/packages/server
npx --yes better-sqlite3-cli 2>nul
# 或用 node 一行：
node --input-type=module -e "import Database from 'better-sqlite3'; const db=new Database('./dev.db'); console.log(db.prepare('select count(*) as n from comment').get()); console.log(db.prepare(`select i.identifier, c.type, c.author_id from comment c join issue i on i.id=c.issue_id order by c.created_at`).all());"
```

预期：FRI-11 至少 3 行 `type=comment`。

- [ ] **Step 6: typecheck server**

```bash
cd D:/code/multi-agent/app
pnpm --filter @ma/server typecheck
```

预期：通过（routes 尚未用 Comment 也可过）。

- [ ] **Step 7: 提交**

```bash
cd D:/code/multi-agent
git add app/packages/server/src/db
git commit -m "feat(s02): toComment + seed FRI 时间线评论"
```

---

### Task 1.5: impl-1 handoff

**Files:**
- Create: `app/.progress/s02-impl-1.md`

- [ ] **Step 1: 全量 typecheck**

```bash
cd D:/code/multi-agent/app
pnpm -r typecheck
```

预期：三包绿（web 可能因尚未改 DomainEvent 消费而仍绿——shared 扩展是兼容的）。

- [ ] **Step 2: 写 handoff**（照 `_TEMPLATE.md`）

必写：
- BusinessId 已清 uuid
- migration 文件名
- seed 评论条数与 FRI-11 验证
- 给 impl-2：`toComment` / `resolveAuthorLabel` 路径；`LOCAL_MEMBER=user-linyuan`；PUT 要写 status_change

- [ ] **Step 3: 提交**

```bash
git add app/.progress/s02-impl-1.md
git commit -m "docs(s02): impl-1 handoff（shared+DB+seed）"
```

---

# 执行者片段 B（impl-2）：server API + status_change + roster

> **会话边界：** 新会话。读 S02 spec §5–§6 + `s02-impl-1.md` + 计划者注意点。同一分支继续。  
> 完成后 `app/.progress/s02-impl-2.md`。

### Task 2.1: comments 路由 + roster 路由

**Files:**
- Create: `app/packages/server/src/routes/comments.ts`
- Create: `app/packages/server/src/routes/roster.ts`
- Modify: `app/packages/server/src/app.ts`

- [ ] **Step 1: 写 `comments.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { eq, asc } from 'drizzle-orm';
import { CreateCommentInput } from '@ma/shared';
import { db } from '../db/client.js';
import { comments, issues } from '../db/schema.js';
import { toComment } from '../db/reshape.js';
import { eventBus } from '../orchestration/event-bus.js';

const LOCAL_MEMBER_ID = 'user-linyuan';

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/issues/:id/comments — R3: created_at ASC, id ASC
  app.get('/api/issues/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const issue = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issue) return reply.status(404).send({ error: 'issue 不存在' });

    const rows = db
      .select()
      .from(comments)
      .where(eq(comments.issueId, id))
      .orderBy(asc(comments.createdAt), asc(comments.id))
      .all();
    return rows.map(toComment);
  });

  // POST /api/issues/:id/comments
  app.post('/api/issues/:id/comments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const issue = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issue) return reply.status(404).send({ error: 'issue 不存在' });

    const parsed = CreateCommentInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const commentId = crypto.randomUUID();
    const now = Date.now();
    db.insert(comments)
      .values({
        id: commentId,
        issueId: id,
        type: 'comment',
        authorType: 'member',
        authorId: LOCAL_MEMBER_ID,
        body: parsed.data.body,
        createdAt: now,
      })
      .run();

    const row = db.select().from(comments).where(eq(comments.id, commentId)).get();
    const comment = toComment(row!);
    eventBus.publish({ type: 'comment:created', comment });
    return reply.status(201).send(comment);
  });
}
```

若 `orderBy(asc(comments.createdAt), asc(comments.id))` 类型报错，改用：

```typescript
.orderBy(sql`${comments.createdAt} ASC, ${comments.id} ASC`)
```

并 `import { eq, sql } from 'drizzle-orm'`。

- [ ] **Step 2: 写 `roster.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { agents, squads } from '../db/schema.js';

export async function rosterRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/agents', async () => {
    const rows = db.select().from(agents).all();
    return rows.map((a) => ({ id: a.id, name: a.name }));
  });

  app.get('/api/squads', async () => {
    const rows = db.select().from(squads).all();
    return rows.map((s) => ({ id: s.id, name: s.name }));
  });
}
```

- [ ] **Step 3: 注册路由 `app.ts`**

```typescript
import { commentRoutes } from './routes/comments.js';
import { rosterRoutes } from './routes/roster.js';

// 在 issueRoutes / wsRoutes 旁：
await app.register(commentRoutes);
await app.register(rosterRoutes);
```

- [ ] **Step 4: 提交**

```bash
git add app/packages/server/src/routes app/packages/server/src/app.ts
git commit -m "feat(s02): comments + agents/squads 只读路由"
```

---

### Task 2.2: GET issue by id + PUT 事务写 status_change

**Files:**
- Modify: `app/packages/server/src/routes/issues.ts`

- [ ] **Step 1: 增加 imports 与常量**

```typescript
import { comments } from '../db/schema.js';
import { toIssue, toComment } from '../db/reshape.js';
import { sqlite } from '../db/client.js';
```

（`db` 已从 client 导入则扩展同一 import：`import { db, sqlite } from '../db/client.js'`）

- [ ] **Step 2: 在 GET list 后增加 GET :id**

```typescript
  app.get('/api/issues/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!row) return reply.status(404).send({ error: 'issue 不存在' });
    return toIssue(row);
  });
```

注意：Fastify 路由顺序——若 `GET /api/issues/:id` 与更具体路径冲突，comments 已挂在 `/api/issues/:id/comments`，由独立 plugin 注册通常无冲突。保持 `commentRoutes` 注册即可。

- [ ] **Step 3: 改写 PUT 事务段**

将现有 PUT 中「update → publish」替换为：

```typescript
    const statusChanged = input.status !== undefined && input.status !== prev.status;

    const run = sqlite.transaction(() => {
      db.update(issues).set(updates).where(eq(issues.id, id)).run();

      let statusCommentId: string | null = null;
      if (statusChanged && input.status) {
        statusCommentId = crypto.randomUUID();
        db.insert(comments)
          .values({
            id: statusCommentId,
            issueId: id,
            type: 'status_change',
            authorType: 'member',
            authorId: USER_ID, // 已有 user-linyuan
            body: JSON.stringify({ from: prev.status, to: input.status }),
            createdAt: Date.now(),
          })
          .run();
      }
      return statusCommentId;
    });

    const statusCommentId = run();

    const row = db.select().from(issues).where(eq(issues.id, id)).get();
    const issue = toIssue(row!);
    eventBus.publish({
      type: 'issue:updated',
      issue,
      statusChanged,
      prevStatus: statusChanged ? prev.status : null,
    });

    if (statusCommentId) {
      const cRow = db.select().from(comments).where(eq(comments.id, statusCommentId)).get();
      eventBus.publish({ type: 'comment:created', comment: toComment(cRow!) });
    }

    return reply.send(issue);
```

删除旧的单独 `db.update` + 单次 publish（避免双写）。`updates` 对象构造逻辑保持 S01。

- [ ] **Step 4: typecheck**

```bash
cd D:/code/multi-agent/app
pnpm --filter @ma/server typecheck
```

预期：通过。

- [ ] **Step 5: 提交**

```bash
git add app/packages/server/src/routes/issues.ts
git commit -m "feat(s02): GET issue/:id + PUT 事务 status_change 双事件"
```

---

### Task 2.3: API 自测 + impl-2 handoff

**Files:**
- Create: `app/.progress/s02-impl-2.md`

- [ ] **Step 1: 确保 DB 有数据后启动 server**

```bash
cd D:/code/multi-agent/app/packages/server
# 若无 dev.db：migrate + seed
cd D:/code/multi-agent/app
pnpm --filter @ma/server dev
```

另开终端：

```bash
# 列表取 FRI-11 id
curl -s http://localhost:3001/api/issues | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const i=j.find(x=>x.identifier==='FRI-11');console.log(i.id);});"
```

设 `$ID` 为该 uuid，然后：

```bash
curl -s http://localhost:3001/api/issues/$ID
curl -s http://localhost:3001/api/issues/$ID/comments
curl -s http://localhost:3001/api/agents
curl -s http://localhost:3001/api/squads
curl -s -X POST http://localhost:3001/api/issues/$ID/comments -H "Content-Type: application/json" -d "{\"body\":\"计划自测评论\"}"
curl -s -X PUT http://localhost:3001/api/issues/$ID -H "Content-Type: application/json" -d "{\"status\":\"done\"}"
curl -s http://localhost:3001/api/issues/$ID/comments
```

预期：
- GET issue 含 identifier FRI-11、assignee.label 产品小队
- comments ≥3 seed + 自测评论
- PUT 后多一条 `type=status_change`，body 为 `{"from":"...","to":"done"}`
- agents ≥4 · squads ≥1

PowerShell 可用 `Invoke-RestMethod` 等价调用；**handoff 必须贴真实输出摘要**。

- [ ] **Step 2: 写 `s02-impl-2.md`**

注意点给 impl-3：
- API base `http://localhost:3001`
- `comment:created` payload 形状
- D12 不要乐观插 comment
- mention 语法
- status_change body 是 JSON 字符串

- [ ] **Step 3: 提交 handoff**

```bash
git add app/.progress/s02-impl-2.md
git commit -m "docs(s02): impl-2 handoff（server API 自测）"
```

---

# 执行者片段 C（impl-3）：web 详情 + MD + @ + D12 + WS

> **会话边界：** 新会话。读 spec §7/§9 + `s02-impl-2.md`。同一分支。完成后 `s02-impl-3.md` 并勾验收。

### Task 3.1: 依赖 + api hooks + WS

**Files:**
- Modify: `app/packages/web/package.json` — 加 `react-markdown`
- Modify: `app/packages/web/lib/api.ts`
- Modify: `app/packages/web/lib/ws.ts`

- [ ] **Step 1: 安装 react-markdown**

```bash
cd D:/code/multi-agent/app
pnpm --filter @ma/web add react-markdown
```

- [ ] **Step 2: 重写/扩展 `api.ts` 为完整内容**

```typescript
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Issue,
  Comment,
  CreateIssueInput,
  UpdateIssueInput,
  CreateCommentInput,
  AgentSummary,
  SquadSummary,
} from '@ma/shared';

const API = 'http://localhost:3001/api';

export function useIssues() {
  return useQuery<Issue[]>({
    queryKey: ['issues'],
    queryFn: async () => {
      const res = await fetch(`${API}/issues`);
      if (!res.ok) throw new Error('加载失败');
      return res.json();
    },
  });
}

export function useIssue(id: string) {
  return useQuery<Issue>({
    queryKey: ['issue', id],
    queryFn: async () => {
      const res = await fetch(`${API}/issues/${id}`);
      if (!res.ok) throw new Error('issue 不存在');
      return res.json();
    },
    enabled: !!id,
  });
}

export function useComments(issueId: string) {
  return useQuery<Comment[]>({
    queryKey: ['comments', issueId],
    queryFn: async () => {
      const res = await fetch(`${API}/issues/${issueId}/comments`);
      if (!res.ok) throw new Error('加载评论失败');
      return res.json();
    },
    enabled: !!issueId,
  });
}

export function useAgents() {
  return useQuery<AgentSummary[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const res = await fetch(`${API}/agents`);
      if (!res.ok) throw new Error('加载 agents 失败');
      return res.json();
    },
  });
}

export function useSquads() {
  return useQuery<SquadSummary[]>({
    queryKey: ['squads'],
    queryFn: async () => {
      const res = await fetch(`${API}/squads`);
      if (!res.ok) throw new Error('加载 squads 失败');
      return res.json();
    },
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateIssueInput) => {
      const res = await fetch(`${API}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('创建失败');
      return res.json() as Promise<Issue>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues'] }),
  });
}

export function useCreateComment(issueId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCommentInput) => {
      const res = await fetch(`${API}/issues/${issueId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('评论失败');
      return res.json() as Promise<Comment>;
    },
    // R9：不做乐观插入；写入 cache + 依赖 WS 幂等
    onSuccess: (comment) => {
      qc.setQueryData<Comment[]>(['comments', issueId], (old) => {
        if (!old) return [comment];
        if (old.some((c) => c.id === comment.id)) return old;
        return [...old, comment];
      });
    },
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateIssueInput }) => {
      const res = await fetch(`${API}/issues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('更新失败');
      return res.json() as Promise<Issue>;
    },
    // D12 + R2：只乐观 Issue 字段
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: ['issues'] });
      await qc.cancelQueries({ queryKey: ['issue', id] });
      const prevList = qc.getQueryData<Issue[]>(['issues']);
      const prevOne = qc.getQueryData<Issue>(['issue', id]);
      qc.setQueryData<Issue[]>(['issues'], (old) =>
        old?.map((i) => (i.id === id ? { ...i, ...input } : i)),
      );
      if (prevOne) {
        qc.setQueryData<Issue>(['issue', id], { ...prevOne, ...input });
      }
      return { prevList, prevOne };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prevList) qc.setQueryData(['issues'], ctx.prevList);
      if (ctx?.prevOne) qc.setQueryData(['issue', id], ctx.prevOne);
    },
    onSuccess: (issue) => {
      qc.setQueryData<Issue[]>(['issues'], (old) =>
        old?.map((i) => (i.id === issue.id ? issue : i)),
      );
      qc.setQueryData(['issue', issue.id], issue);
      // 时间线条等 WS comment:created；也可 invalidate 兜底
      qc.invalidateQueries({ queryKey: ['comments', issue.id] });
    },
  });
}
```

- [ ] **Step 3: 扩展 `ws.ts` 消息处理**

在 `ws.onmessage` 内，保留 issue 列表更新，并追加：

```typescript
import type { Issue, Comment, DomainEvent } from '@ma/shared';

// 在 onmessage 内：
if (event.type === 'issue:created' || event.type === 'issue:updated') {
  qc.setQueryData<Issue[]>(['issues'], (old) => {
    if (!old) return old;
    if (event.type === 'issue:created') {
      if (old.some((i) => i.id === event.issue.id)) return old;
      return [...old, event.issue];
    }
    return old.map((i) => (i.id === event.issue.id ? event.issue : i));
  });
  qc.setQueryData<Issue>(['issue', event.issue.id], event.issue);
}

if (event.type === 'comment:created') {
  const { comment } = event;
  qc.setQueryData<Comment[]>(['comments', comment.issueId], (old) => {
    if (!old) return [comment];
    if (old.some((c) => c.id === comment.id)) return old;
    return [...old, comment];
  });
}
```

删除旧的仅处理 issues 数组、忽略单条 issue key 的逻辑，以本节为准（保持幂等）。

- [ ] **Step 4: typecheck web**

```bash
pnpm --filter @ma/web typecheck
```

- [ ] **Step 5: 提交**

```bash
git add app/packages/web/package.json app/pnpm-lock.yaml app/packages/web/lib
git commit -m "feat(s02): web hooks + D12 乐观更新 + WS comment:created"
```

---

### Task 3.2: MarkdownBody + Timeline + Composer + 详情页

**Files:**
- Create: 下列 components
- Create: `app/packages/web/app/issues/[id]/page.tsx`
- Modify: `globals.css`
- Modify: `IssueCard.tsx`

- [ ] **Step 1: `MarkdownBody.tsx`**

```tsx
'use client';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

const MENTION_RE = /^mention:\/\/(agent|squad)\/(.+)$/;

const components: Components = {
  a: ({ href, children }) => {
    if (href && MENTION_RE.test(href)) {
      const text = String(children ?? href);
      return <span className="mention-pill">{text.startsWith('@') ? text : `@${text}`}</span>;
    }
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
};

export function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown components={components}>{source}</ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: `TimelineItem.tsx`**

```tsx
'use client';
import type { Comment, IssueStatus } from '@ma/shared';
import { StatusChangeBody } from '@ma/shared';
import { MarkdownBody } from './MarkdownBody';

const STATUS_ZH: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function TimelineItemView({ item }: { item: Comment }) {
  if (item.type === 'status_change') {
    let text = item.body;
    try {
      const parsed = StatusChangeBody.safeParse(JSON.parse(item.body));
      if (parsed.success) {
        text = `${item.authorLabel} 将状态从 ${STATUS_ZH[parsed.data.from]} 改为 ${STATUS_ZH[parsed.data.to]}`;
      }
    } catch {
      /* raw */
    }
    return (
      <div className="timeline-item timeline-item--status">
        <div className="timeline-meta">
          <span className="timeline-author">{item.authorLabel}</span>
          <span className="timeline-time">{formatTime(item.createdAt)}</span>
          <span className="timeline-badge">状态变更</span>
        </div>
        <div className="timeline-body timeline-body--status">{text}</div>
      </div>
    );
  }

  return (
    <div className="timeline-item">
      <div className="timeline-meta">
        <span className="timeline-author">{item.authorLabel}</span>
        <span className="timeline-time">{formatTime(item.createdAt)}</span>
      </div>
      <div className="timeline-body">
        <MarkdownBody source={item.body} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `Timeline.tsx`**

```tsx
'use client';
import type { Comment } from '@ma/shared';
import { TimelineItemView } from './TimelineItem';

export function Timeline({ items }: { items: Comment[] }) {
  return (
    <section className="timeline">
      <div className="timeline-header">动态 · {items.length} 条</div>
      {items.map((c) => (
        <TimelineItemView key={c.id} item={c} />
      ))}
    </section>
  );
}
```

- [ ] **Step 4: `CommentComposer.tsx`（含 @ 补全）**

```tsx
'use client';
import { useMemo, useState, useRef } from 'react';
import { useAgents, useSquads, useCreateComment } from '@/lib/api';

export function CommentComposer({ issueId }: { issueId: string }) {
  const [body, setBody] = useState('');
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const create = useCreateComment(issueId);

  const roster = useMemo(
    () => [
      ...agents.map((a) => ({ kind: 'agent' as const, id: a.id, name: a.name })),
      ...squads.map((s) => ({ kind: 'squad' as const, id: s.id, name: s.name, tag: '小队' })),
    ],
    [agents, squads],
  );

  const filtered = useMemo(() => {
    if (mentionQ === null) return [];
    const q = mentionQ.toLowerCase();
    return roster.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mentionQ, roster]);

  function onChange(v: string) {
    setBody(v);
    const el = taRef.current;
    const pos = el?.selectionStart ?? v.length;
    const before = v.slice(0, pos);
    const m = before.match(/@([^\s@]*)$/);
    setMentionQ(m ? m[1] : null);
  }

  function insertMention(kind: 'agent' | 'squad', id: string, name: string) {
    const el = taRef.current;
    const pos = el?.selectionStart ?? body.length;
    const before = body.slice(0, pos);
    const after = body.slice(pos);
    const replaced = before.replace(/@([^\s@]*)$/, `[@${name}](mention://${kind}/${id}) `);
    setBody(replaced + after);
    setMentionQ(null);
  }

  function submit() {
    const t = body.trim();
    if (!t || create.isPending) return;
    create.mutate(
      { body: t },
      {
        onSuccess: () => setBody(''),
      },
    );
  }

  return (
    <div className="composer">
      <textarea
        ref={taRef}
        className="composer-input"
        placeholder="留下评论… 输入 @ 提及 agent/小队"
        value={body}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
      {filtered.length > 0 && (
        <ul className="mention-menu">
          {filtered.map((r) => (
            <li key={`${r.kind}-${r.id}`}>
              <button type="button" onClick={() => insertMention(r.kind, r.id, r.name)}>
                @{r.name}
                {'tag' in r && r.tag ? ` · ${r.tag}` : ` · ${r.kind}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-primary" onClick={submit} disabled={create.isPending || !body.trim()}>
        发送
      </button>
      {create.isError && <span className="error">发送失败</span>}
    </div>
  );
}
```

- [ ] **Step 5: `IssueHeader.tsx`**

```tsx
'use client';
import Link from 'next/link';
import type { Issue, IssueStatus } from '@ma/shared';
import { IssueStatus as IssueStatusEnum } from '@ma/shared';
import { useUpdateIssue } from '@/lib/api';

const ALL_STATUS = IssueStatusEnum.options;

const STATUS_ZH: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

export function IssueHeader({ issue }: { issue: Issue }) {
  const update = useUpdateIssue();

  return (
    <header className="issue-header">
      <div className="issue-header-top">
        <Link href="/">← 看板</Link>
        <span className="issue-id">{issue.identifier}</span>
        <select
          value={issue.status}
          onChange={(e) =>
            update.mutate({ id: issue.id, input: { status: e.target.value as IssueStatus } })
          }
          aria-label="状态"
        >
          {ALL_STATUS.map((s) => (
            <option key={s} value={s}>
              {STATUS_ZH[s]}
            </option>
          ))}
        </select>
      </div>
      <h1 className="issue-title">{issue.title}</h1>
      {issue.description && (
        <p className="issue-desc">{issue.description}</p>
      )}
      <div className="issue-meta">
        <span>优先级：{issue.priority}</span>
        <span>指派：{issue.assignee?.label ?? '未指派'}</span>
      </div>
    </header>
  );
}
```

若 `IssueStatusEnum.options` 在当前 zod 版本不可用，改用字面量数组：

```typescript
const ALL_STATUS: IssueStatus[] = [
  'backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled',
];
```

- [ ] **Step 6: `IssueDetail.tsx` + 页面**

`components/IssueDetail.tsx`：

```tsx
'use client';
import { useIssue, useComments } from '@/lib/api';
import { IssueHeader } from './IssueHeader';
import { Timeline } from './Timeline';
import { CommentComposer } from './CommentComposer';

export function IssueDetail({ id }: { id: string }) {
  const { data: issue, isLoading: il, error: ie } = useIssue(id);
  const { data: comments, isLoading: cl } = useComments(id);

  if (il || cl) return <div className="issue-detail">加载中…</div>;
  if (ie || !issue) return <div className="issue-detail">Issue 不存在</div>;

  return (
    <div className="issue-detail">
      <IssueHeader issue={issue} />
      <Timeline items={comments ?? []} />
      <CommentComposer issueId={id} />
    </div>
  );
}
```

`app/issues/[id]/page.tsx`：

```tsx
import { IssueDetail } from '@/components/IssueDetail';

export default function Page({ params }: { params: { id: string } }) {
  return <IssueDetail id={params.id} />;
}
```

若 Next 版本 `params` 为 Promise，按项目 Next 15 实际类型调整（S01 若为 Next 14 则同步 params 同步即可）。检查 `package.json` 的 next 大版本：

```bash
node -p "require('./packages/web/package.json').dependencies.next"
```

Next 15 App Router 可能需要：

```tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IssueDetail id={id} />;
}
```

- [ ] **Step 7: `IssueCard` 标题可点进详情**

```tsx
import Link from 'next/link';
// ...
// identifier 可保留纯文本；标题改为：
<div style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)' }}>
  <Link
    href={`/issues/${issue.id}`}
    onClick={(e) => e.stopPropagation()}
    draggable={false}
    style={{ color: 'inherit', textDecoration: 'none' }}
  >
    {issue.title}
  </Link>
</div>
```

整卡仍 `draggable`；链接 `draggable={false}` + `stopPropagation` 降低拖拽冲突。

- [ ] **Step 8: `globals.css` 追加**

```css
.mention-pill {
  display: inline-block;
  padding: 0 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  color: var(--accent-hover);
  font-size: var(--text-xs, 12px);
}
.issue-detail {
  max-width: 800px;
  margin: 0 auto;
  padding: var(--space-4);
}
.issue-header-top {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  margin-bottom: var(--space-3);
}
.issue-id {
  font-family: var(--font-mono, monospace);
  color: var(--accent);
}
.issue-title {
  font-size: 1.5rem;
  margin: 0 0 var(--space-2);
}
.issue-desc {
  white-space: pre-wrap;
  color: var(--text-muted);
  margin: 0 0 var(--space-3);
}
.issue-meta {
  display: flex;
  gap: var(--space-4);
  color: var(--text-dim);
  font-size: var(--text-sm, 13px);
  margin-bottom: var(--space-4);
}
.timeline-header {
  font-weight: 600;
  margin-bottom: var(--space-3);
}
.timeline-item {
  border-left: 2px solid var(--border);
  padding: 0 var(--space-3) var(--space-3);
  margin-bottom: var(--space-2);
}
.timeline-item--status {
  border-left-color: var(--color-orange, #f97316);
}
.timeline-meta {
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-xs, 12px);
  color: var(--text-dim);
  margin-bottom: 4px;
}
.timeline-author {
  color: var(--text-primary);
  font-weight: 600;
}
.timeline-badge {
  background: var(--bg-hover);
  border-radius: 4px;
  padding: 0 6px;
}
.timeline-body--status {
  color: var(--text-muted);
  font-size: var(--text-sm, 13px);
}
.md-body h1, .md-body h2, .md-body h3 {
  margin: 0.6em 0 0.3em;
}
.md-body p {
  margin: 0.4em 0;
}
.md-body pre {
  background: var(--bg-elevated);
  padding: var(--space-2);
  overflow: auto;
  border-radius: var(--radius-md, 6px);
}
.composer {
  margin-top: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  position: relative;
}
.composer-input {
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius-md, 6px);
  padding: var(--space-3);
  font: inherit;
}
.mention-menu {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 6px;
  max-height: 200px;
  overflow: auto;
}
.mention-menu button {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  color: var(--text-primary);
  padding: 8px 12px;
  cursor: pointer;
}
.mention-menu button:hover {
  background: var(--bg-hover);
}
.btn-primary {
  align-self: flex-end;
  background: var(--accent);
  color: white;
  border: 0;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.error {
  color: var(--color-red, #ef4444);
}
```

- [ ] **Step 9: typecheck + 提交**

```bash
cd D:/code/multi-agent/app
pnpm -r typecheck
git add app/packages/web
git commit -m "feat(s02): 详情页时间线 + MD/pill + @补全 + 卡片入口"
```

---

### Task 3.3: 端到端验收 + impl-3 handoff

**Files:**
- Create: `app/.progress/s02-impl-3.md`

- [ ] **Step 1: 重置 DB（若脏）并 dev**

```bash
cd D:/code/multi-agent/app/packages/server
Remove-Item -ErrorAction SilentlyContinue dev.db, dev.db-shm, dev.db-wal
cd D:/code/multi-agent/app
pnpm --filter @ma/server db:migrate
pnpm --filter @ma/server db:seed
pnpm dev
```

- [ ] **Step 2: 按 spec §9 浏览器验收（逐项打勾）**

1. 看板 FRI-11 → 点标题 → `/issues/<uuid>`，identifier=FRI-11  
2. 描述可见；指派「产品小队」  
3. 时间线 ≥3；队长条 MD 标题 + mention pill  
4. 发评论 → 作者林远  
5. 改状态 → status_change 条  
6. 看板拖另一 issue 改状态 → 进详情可见 status_change  
7. `@` 补全 agent + 小队  
8. 双窗口评论/改状态实时  
9. 看板新建回归  

- [ ] **Step 3: handoff `s02-impl-3.md`**

贴 typecheck 输出 + §9 勾选结果 + 偏离。

- [ ] **Step 4: 提交**

```bash
git add app/.progress/s02-impl-3.md
git commit -m "docs(s02): impl-3 handoff（web 验收）"
```

---

## 计划者收尾（非执行者）

验收三段 handoff 后写 `app/.progress/s02-planner-2.md`（切片总结），开 PR 合 main。

---

## Self-Review（写计划后对照 spec）

| Spec 需求 | Task |
|---|---|
| D11 BusinessId | 1.2 |
| comment 表 + migration | 1.3 |
| seed FRI-11+ 评论 | 1.4 |
| toComment / authorLabel | 1.4 |
| GET/POST comments | 2.1 |
| GET agents/squads | 2.1 |
| GET issue/:id | 2.2 |
| PUT status_change 事务 + 双事件 | 2.2 |
| D12 useUpdateIssue | 3.1 |
| WS comment:created | 3.1 |
| 详情路由 + Header/Timeline/Composer | 3.2 |
| MD + mention agent\|squad | 3.2 |
| @ 补全 | 3.2 |
| IssueCard Link | 3.2 |
| §9 验收 | 3.3 |
| 不做 mention 入队 / 改指派 | 全局约束，无对应 task（正确） |

**Placeholder scan：** 无 TBD；Next params 同步/async 已给探测命令。  
**类型一致：** `Comment` / `comment:created` / queryKey `['comments', issueId]` 全链路统一。
