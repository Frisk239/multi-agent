# S08 AGENTS.md 桥梁 + ingest 队列/DLQ + CLI 契约 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **本项目工程模式：** AGENTS.md 规定的「垂直切片 × 计划者-执行者」。计划者把 Task 按自然依赖边界切成执行者片段，每个片段由用户新开的会话执行，靠 `app/.progress/` handoff 串行交接。
> **spec 真源：** [`docs/superpowers/specs/2026-07-16-s08-agents-bridge-queue-cli-design.md`](../specs/2026-07-16-s08-agents-bridge-queue-cli-design.md)
> **依赖：** S06+S07 已合 main（或本分支基于含 wiki 的 main）。所有 file:line 以 main 上 S06/S07 代码为准。

**Goal:** 用 SQLite job 队列替换 fire-and-forget ingest；成功后幂等更新 AGENTS.md managed 块并在 `buildPrompt` 注入；提供 `ma wiki` CLI（JSON Envelope + exit code）。

**Architecture:** `wiki_ingest_job` 表 + tick worker（学 RunWorker claim）；`agents-bridge.ts` marker-pair 写 AGENTS.md（学 multica）；CLI 只调 wiki 函数，输出 WeKnora 裁剪版 Envelope。

**Tech Stack:** TypeScript / Fastify / Drizzle / better-sqlite3 / Zod / tsx CLI；无 Redis、无新测试框架。

## Global Constraints

- **分支：** `feat/s08-bridge-queue-cli`（从 **含 S06+S07 的 main** 切出；若 S07 未合 main，从 `feat/s07-query-health-lint` 切并在 handoff 注明）
- **B9：** Issue done 只 `enqueueWikiIngest`，删除 `void ingestIssue().catch`
- **B8：** DLQ = 同表 `status='dead'`，不另建 dead 表
- **B7：** `maxRetries` 默认 3
- **B2/B5/B6：** AGENTS.md marker-pair；managed 块=页清单摘要+最近 ingest；`buildPrompt` 注入
- **B4/B10：** CLI Envelope + exit 0/1/4/5/7；CLI 与 HTTP 共用函数
- **ingest 单并发：** worker 每次 claim 最多 1 个 pending
- **启动 recovery：** `startWikiIngestWorker` 时把卡在 `running` 的 job 改回 `pending`
- **Git：** feature 分支，Conventional Commits，绝不 push main
- **验证：** `pnpm -r typecheck` + 手动 curl/CLI；无 vitest

## 文件结构

```
app/packages/
├── shared/src/schema.ts                 [改] WikiIngestJob* + CLI envelope 可选
├── server/
│   ├── package.json                     [改] "ma": "tsx src/cli/ma.ts"
│   ├── drizzle/0005_wiki_ingest_job.sql [新] + meta journal/snapshot
│   └── src/
│       ├── db/schema.ts                 [改] wikiIngestJobs 表
│       ├── wiki/
│       │   ├── agents-bridge.ts         [新]
│       │   ├── ingest-queue.ts          [新]
│       │   ├── ingest-worker.ts         [新]
│       │   └── ingest.ts                [改] 末尾 updateAgentsMdBridge；失败 throw
│       ├── runtime/prompt.ts            [改] wikiBridgeBlock
│       ├── routes/issues.ts             [改] enqueueWikiIngest
│       ├── routes/wiki.ts               [改] jobs API
│       ├── cli/envelope.ts              [新]
│       ├── cli/ma.ts                    [新]
│       └── index.ts                     [改] startWikiIngestWorker
```

---

# 执行者片段 A（impl-1）：shared + DB + agents-bridge

> **边界：** 契约、表、桥梁纯函数。无 worker、无 CLI。
> **完成后写** `app/.progress/s08-impl-1.md`

### Task 1.1: shared 契约

**Files:** Modify `app/packages/shared/src/schema.ts`

**Interfaces Produces:**
- `WikiIngestJobStatus`, `WikiIngestJob`
- `WikiCliEnvelope`, `WikiCliErrorEnvelope`（CLI/类型共用）

- [ ] **Step 1: 在 CreateWikiPageInput 之后插入**

```typescript
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
```

- [ ] **Step 2:** `cd app && pnpm -r typecheck` → 全绿

- [ ] **Step 3: Commit**

```bash
git add app/packages/shared/src/schema.ts
git commit -m "feat(s08): shared WikiIngestJob + CLI envelope 契约"
```

---

### Task 1.2: DB schema + migration

**Files:**
- Modify `app/packages/server/src/db/schema.ts`
- Create `app/packages/server/drizzle/0005_wiki_ingest_job.sql`
- Modify `app/packages/server/drizzle/meta/_journal.json`
- Create/update snapshot if project 惯例需要手写（S05 用过手写 migration；**优先手写 SQL + journal**，避免 drizzle-kit 交互）

**Interfaces Produces:** `wikiIngestJobs` table export

- [ ] **Step 1: schema.ts 追加**

```typescript
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
```

- [ ] **Step 2: 手写 migration SQL**

`app/packages/server/drizzle/0005_wiki_ingest_job.sql`:

```sql
CREATE TABLE `wiki_ingest_job` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`status` text NOT NULL,
	`fail_count` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_wiki_ingest_job_status_created` ON `wiki_ingest_job` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_wiki_ingest_job_issue` ON `wiki_ingest_job` (`issue_id`);
```

- [ ] **Step 3: journal 追加 entry idx 5, tag `0005_wiki_ingest_job`**

（照 `_journal.json` 现有条目格式复制改 idx/tag/when。）

- [ ] **Step 4: 跑迁移**

```bash
cd app/packages/server && pnpm db:migrate
```

Expected: `✓ 迁移完成`

- [ ] **Step 5: typecheck + commit**

```bash
cd app && pnpm -r typecheck
git add app/packages/server/src/db/schema.ts app/packages/server/drizzle/
git commit -m "feat(s08): wiki_ingest_job 表 + migration 0005"
```

---

### Task 1.3: agents-bridge.ts

**Files:** Create `app/packages/server/src/wiki/agents-bridge.ts`

**必读：** spec §3；`store.ts` 的 `listWikiPages` / `readLog` / `getWikiDir` 定位模式

**Interfaces Produces:**
- `MA_WIKI_BEGIN`, `MA_WIKI_END`
- `getAgentsMdPath(): string`
- `readManagedBlock(path?: string): string | null`
- `writeManagedBlock(path, begin, end, body): void`
- `renderBridgeBody(pages, recentLogText): string`
- `updateAgentsMdBridge(): void`

- [ ] **Step 1: 实现文件**

```typescript
// S08 AGENTS.md 桥梁（spec §3，学 multica runtime_config.go marker-pair）
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listWikiPages, readLog } from './store.js';

export const MA_WIKI_BEGIN = '<!-- BEGIN MA-WIKI (auto-managed; do not edit) -->';
export const MA_WIKI_END = '<!-- END MA-WIKI -->';

export function getAgentsMdPath(): string {
  const cwd = process.env.MA_WORKSPACE_CWD;
  return resolve(cwd && cwd.length > 0 ? cwd : process.cwd(), 'AGENTS.md');
}

export function writeManagedBlock(
  path: string,
  begin: string,
  end: string,
  body: string,
): void {
  const block = `${begin}\n${body.trim()}\n${end}\n`;
  if (!existsSync(path)) {
    writeFileSync(path, block, 'utf-8');
    return;
  }
  const raw = readFileSync(path, 'utf-8');
  const bi = raw.indexOf(begin);
  if (bi < 0) {
    const sep = raw.endsWith('\n') ? '\n' : '\n\n';
    writeFileSync(path, raw + sep + block, 'utf-8');
    return;
  }
  const ei = raw.indexOf(end, bi);
  if (ei < 0) {
    // 半损坏：begin 到 EOF 替换
    writeFileSync(path, raw.slice(0, bi) + block, 'utf-8');
    return;
  }
  const after = raw.slice(ei + end.length).replace(/^\r?\n/, '');
  writeFileSync(path, raw.slice(0, bi) + block + after, 'utf-8');
}

export function readManagedBlock(path?: string): string | null {
  const p = path ?? getAgentsMdPath();
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf-8');
  const bi = raw.indexOf(MA_WIKI_BEGIN);
  if (bi < 0) return null;
  const contentStart = bi + MA_WIKI_BEGIN.length;
  const ei = raw.indexOf(MA_WIKI_END, contentStart);
  if (ei < 0) return raw.slice(contentStart).trim() || null;
  return raw.slice(contentStart, ei).trim() || null;
}

export function renderBridgeBody(
  pages: { slug: string; title: string }[],
  recentLogText: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const pageLines =
    pages.length === 0
      ? '- （暂无 wiki 页）'
      : pages.map((p) => `- [${p.title}](wiki/${p.slug}.md)`).join('\n');
  const logLines = recentLogText
    .split('\n')
    .filter((l) => l.startsWith('## ['))
    .slice(-5)
    .map((l) => `- ${l.replace(/^##\s+/, '')}`)
    .join('\n');
  return `## Project Wiki Snapshot
- Last updated: ${date}
- Pages: ${pages.length}

### Pages
${pageLines}

### Recent ingests
${logLines || '- （暂无）'}`;
}

export function updateAgentsMdBridge(): void {
  const pages = listWikiPages();
  const body = renderBridgeBody(pages, readLog());
  writeManagedBlock(getAgentsMdPath(), MA_WIKI_BEGIN, MA_WIKI_END, body);
}
```

- [ ] **Step 2: spike（可选临时脚本）** 验证：无文件创建、二次写入不重复 marker、用户前文保留

- [ ] **Step 3: typecheck + commit**

```bash
git add app/packages/server/src/wiki/agents-bridge.ts
git commit -m "feat(s08): agents-bridge marker-pair 读写 + updateAgentsMdBridge"
```

---

### Task 1.4: impl-1 handoff

- [ ] 写 `app/.progress/s08-impl-1.md`：完成项、迁移结果、bridge 导出签名、给 impl-2 注意点（claim 单并发、ingest 要 throw）
- [ ] commit + push

```bash
git add app/.progress/s08-impl-1.md
git commit -m "docs(s08): impl-1 handoff（shared + job 表 + agents-bridge）"
git push origin feat/s08-bridge-queue-cli
```

---

# 执行者片段 B（impl-2）：队列 + worker + 接线 ingest/issues/prompt

> **边界：** 入队、worker、替换 fire-and-forget、prompt 注入、jobs HTTP API。
> **依赖：** impl-1 的表 + bridge。
> **完成后写** `app/.progress/s08-impl-2.md`

### Task 2.1: ingest-queue.ts

**Files:** Create `app/packages/server/src/wiki/ingest-queue.ts`

**Interfaces Produces:**
- `enqueueWikiIngest(issueId: string): string | null` — 返回 jobId；若已有 pending/running 同 issue 则返回 null
- `listWikiIngestJobs(status?: string): rows`
- `getWikiIngestJob(id): row | undefined`
- `claimNextWikiIngestJob(): row | null`
- `completeWikiIngestJob(id): void`
- `failWikiIngestJob(id, error: string): void` — 内部 failCount++，决定 pending vs dead
- `retryWikiIngestJob(id): boolean` — dead→pending
- `recoverStuckRunningJobs(): number` — running→pending
- `toWikiIngestJob(row): WikiIngestJob` reshape ISO

- [ ] **Step 1: 实现**（要点）

```typescript
import { eq, and, asc, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { wikiIngestJobs } from '../db/schema.js';
import type { WikiIngestJob } from '@ma/shared';

export function toWikiIngestJob(row: typeof wikiIngestJobs.$inferSelect): WikiIngestJob {
  const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
  return {
    id: row.id,
    issueId: row.issueId,
    status: row.status as WikiIngestJob['status'],
    failCount: row.failCount,
    maxRetries: row.maxRetries,
    lastError: row.lastError,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
  };
}

export function enqueueWikiIngest(issueId: string): string | null {
  const existing = db
    .select()
    .from(wikiIngestJobs)
    .where(
      and(
        eq(wikiIngestJobs.issueId, issueId),
        inArray(wikiIngestJobs.status, ['pending', 'running']),
      ),
    )
    .get();
  if (existing) return null;

  const id = crypto.randomUUID();
  const now = Date.now();
  db.insert(wikiIngestJobs)
    .values({
      id,
      issueId,
      status: 'pending',
      failCount: 0,
      maxRetries: 3,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    })
    .run();
  return id;
}

export function claimNextWikiIngestJob() {
  const queued = db
    .select()
    .from(wikiIngestJobs)
    .where(eq(wikiIngestJobs.status, 'pending'))
    .orderBy(asc(wikiIngestJobs.createdAt))
    .limit(1)
    .get();
  if (!queued) return null;
  const now = Date.now();
  db.update(wikiIngestJobs)
    .set({ status: 'running', startedAt: now, updatedAt: now })
    .where(and(eq(wikiIngestJobs.id, queued.id), eq(wikiIngestJobs.status, 'pending')))
    .run();
  const row = db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, queued.id)).get();
  if (!row || row.status !== 'running') return null;
  return row;
}

export function completeWikiIngestJob(id: string): void {
  const now = Date.now();
  db.update(wikiIngestJobs)
    .set({ status: 'completed', finishedAt: now, updatedAt: now, lastError: null })
    .where(eq(wikiIngestJobs.id, id))
    .run();
}

export function failWikiIngestJob(id: string, error: string): void {
  const row = db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, id)).get();
  if (!row) return;
  const failCount = row.failCount + 1;
  const now = Date.now();
  if (failCount < row.maxRetries) {
    db.update(wikiIngestJobs)
      .set({
        status: 'pending',
        failCount,
        lastError: error.slice(0, 2000),
        updatedAt: now,
        startedAt: null,
      })
      .where(eq(wikiIngestJobs.id, id))
      .run();
  } else {
    db.update(wikiIngestJobs)
      .set({
        status: 'dead',
        failCount,
        lastError: error.slice(0, 2000),
        updatedAt: now,
        finishedAt: now,
      })
      .where(eq(wikiIngestJobs.id, id))
      .run();
  }
}

export function retryWikiIngestJob(id: string): boolean {
  const row = db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, id)).get();
  if (!row || row.status !== 'dead') return false;
  const now = Date.now();
  db.update(wikiIngestJobs)
    .set({
      status: 'pending',
      failCount: 0,
      lastError: null,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    })
    .where(eq(wikiIngestJobs.id, id))
    .run();
  return true;
}

export function recoverStuckRunningJobs(): number {
  const now = Date.now();
  const r = db
    .update(wikiIngestJobs)
    .set({ status: 'pending', updatedAt: now, startedAt: null })
    .where(eq(wikiIngestJobs.status, 'running'))
    .run();
  return r.changes ?? 0;
}

export function listWikiIngestJobs(status?: string) {
  if (status) {
    return db
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.status, status as 'pending'))
      .orderBy(asc(wikiIngestJobs.createdAt))
      .all();
  }
  return db.select().from(wikiIngestJobs).orderBy(asc(wikiIngestJobs.createdAt)).all();
}

export function getWikiIngestJob(id: string) {
  return db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, id)).get();
}
```

> 若 `listWikiIngestJobs` 的 status 类型断言别扭，用 `as any` 或显式 union；typecheck 过即可。

- [ ] **Step 2: typecheck + commit**

```bash
git add app/packages/server/src/wiki/ingest-queue.ts
git commit -m "feat(s08): ingest-queue enqueue/claim/fail/retry/recover"
```

---

### Task 2.2: ingest-worker.ts

**Files:** Create `app/packages/server/src/wiki/ingest-worker.ts`

**Interfaces Produces:** `startWikiIngestWorker()`, `wakeWikiIngestWorker()`

- [ ] **Step 1: 实现**

```typescript
// S08 Wiki ingest worker（spec §4.4，学 run-worker tick）
import {
  claimNextWikiIngestJob,
  completeWikiIngestJob,
  failWikiIngestJob,
  recoverStuckRunningJobs,
} from './ingest-queue.js';
import { ingestIssue } from './ingest.js';

let timer: ReturnType<typeof setInterval> | null = null;

export function startWikiIngestWorker(): void {
  if (timer) return;
  recoverStuckRunningJobs();
  timer = setInterval(() => {
    void tick();
  }, 500);
}

export function wakeWikiIngestWorker(): void {
  void tick();
}

async function tick(): Promise<void> {
  const job = claimNextWikiIngestJob();
  if (!job) return;
  void execute(job.id, job.issueId);
}

async function execute(jobId: string, issueId: string): Promise<void> {
  try {
    await ingestIssue(issueId);
    completeWikiIngestJob(jobId);
  } catch (err) {
    console.error('[wiki-ingest-worker] job 失败:', jobId, err);
    failWikiIngestJob(jobId, String(err));
  }
}
```

- [ ] **Step 2: commit**

```bash
git add app/packages/server/src/wiki/ingest-worker.ts
git commit -m "feat(s08): wiki ingest worker tick + claim 单并发"
```

---

### Task 2.3: ingest.ts 成功后 bridge + 保证 throw

**Files:** Modify `app/packages/server/src/wiki/ingest.ts`

- [ ] **Step 1:** import `updateAgentsMdBridge` from `./agents-bridge.js`

- [ ] **Step 2:** 在 `eventBus.publish(wiki:page-created)` **之后**加：

```typescript
  // S08：更新 AGENTS.md managed 块（spec §3.4）
  updateAgentsMdBridge();
```

- [ ] **Step 3:** 确认函数无顶层 try/catch 吞错；DB 缺失等继续 throw。`createLlm` 无 key 已 throw — 保持。

- [ ] **Step 4: commit**

```bash
git add app/packages/server/src/wiki/ingest.ts
git commit -m "feat(s08): ingest 成功后 updateAgentsMdBridge"
```

---

### Task 2.4: issues.ts 改 enqueue

**Files:** Modify `app/packages/server/src/routes/issues.ts`

- [ ] **Step 1:** 删除 `import { ingestIssue }` 与 `appendLog`（若仅用于 done catch）

- [ ] **Step 2:** 改为：

```typescript
import { enqueueWikiIngest } from '../wiki/ingest-queue.js';
import { wakeWikiIngestWorker } from '../wiki/ingest-worker.js';
```

- [ ] **Step 3:** 替换 done 块：

```typescript
    // S08：Issue 完成 → 入队 wiki ingest（spec B9），不再 fire-and-forget 直调
    if (statusChanged && input.status === 'done') {
      const jobId = enqueueWikiIngest(id);
      if (jobId) wakeWikiIngestWorker();
    }
```

- [ ] **Step 4: commit**

```bash
git add app/packages/server/src/routes/issues.ts
git commit -m "feat(s08): Issue done 入队 wiki_ingest_job（移除 fire-and-forget）"
```

---

### Task 2.5: prompt.ts 注入 wikiBridgeBlock

**Files:** Modify `app/packages/server/src/runtime/prompt.ts`

- [ ] **Step 1:** import `readManagedBlock` from `../wiki/agents-bridge.js`

- [ ] **Step 2:** skillBlock 之后、briefing 之前：

```typescript
  const wikiBridge = readManagedBlock();
  if (wikiBridge) {
    parts.push(`# Project Wiki Snapshot\n${wikiBridge}`);
  }
```

（`parts` 数组在 skillBlock push 之后；若当前代码先建 body 再 parts，对齐现有结构：在 `if (skillBlock) parts.push(skillBlock);` 后插入。）

- [ ] **Step 3: commit**

```bash
git add app/packages/server/src/runtime/prompt.ts
git commit -m "feat(s08): buildPrompt 注入 AGENTS.md wiki managed 块"
```

---

### Task 2.6: wiki routes jobs + index 启动 worker

**Files:**
- Modify `app/packages/server/src/routes/wiki.ts`
- Modify `app/packages/server/src/index.ts`

- [ ] **Step 1: wiki.ts 增加**

```typescript
import {
  listWikiIngestJobs,
  getWikiIngestJob,
  retryWikiIngestJob,
  toWikiIngestJob,
} from '../wiki/ingest-queue.js';
import { wakeWikiIngestWorker } from '../wiki/ingest-worker.js';

  app.get('/api/wiki/jobs', async (req) => {
    const { status } = req.query as { status?: string };
    return listWikiIngestJobs(status).map(toWikiIngestJob);
  });

  app.get('/api/wiki/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = getWikiIngestJob(id);
    if (!row) return reply.status(404).send({ error: 'job 不存在' });
    return toWikiIngestJob(row);
  });

  app.post('/api/wiki/jobs/:id/retry', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = retryWikiIngestJob(id);
    if (!ok) return reply.status(400).send({ error: '仅 dead job 可 retry' });
    wakeWikiIngestWorker();
    const row = getWikiIngestJob(id);
    return toWikiIngestJob(row!);
  });
```

- [ ] **Step 2: index.ts**

```typescript
import { startWikiIngestWorker } from './wiki/ingest-worker.js';
// startRunWorker() 旁：
startWikiIngestWorker();
```

- [ ] **Step 3: typecheck + 手动测**

```bash
# 终端1
cd app && pnpm --filter @ma/server dev
# 终端2
curl -X PUT http://localhost:3001/api/issues/<id> -H 'Content-Type: application/json' -d '{"status":"done"}'
curl 'http://localhost:3001/api/wiki/jobs'
# 无 key：job 应 pending→running→pending 重试→dead
```

- [ ] **Step 4: commit**

```bash
git add app/packages/server/src/routes/wiki.ts app/packages/server/src/index.ts
git commit -m "feat(s08): wiki jobs API + 启动 wiki ingest worker"
```

---

### Task 2.7: impl-2 handoff

- [ ] 写 `s08-impl-2.md`：队列行为证据、AGENTS.md 是否生成、prompt 注入说明、给 impl-3 CLI 的函数列表
- [ ] push

---

# 执行者片段 C（impl-3）：CLI envelope + ma wiki 命令 + 验收

> **边界：** CLI 入口 + 端到端验收。
> **完成后写** `app/.progress/s08-impl-3.md`（勾选 spec §8）

### Task 3.1: cli/envelope.ts

**Files:** Create `app/packages/server/src/cli/envelope.ts`

```typescript
export function emitOk(data?: unknown, meta?: Record<string, unknown>): never {
  const body = { ok: true as const, status: 'success' as const, data, meta };
  process.stdout.write(JSON.stringify(body) + '\n');
  process.exit(0);
}

export function emitErr(
  type: string,
  message: string,
  exitCode: number,
): never {
  const body = {
    ok: false as const,
    error: { type, message, exit_code: exitCode },
  };
  process.stderr.write(JSON.stringify(body) + '\n');
  process.exit(exitCode);
}
```

- [ ] commit: `feat(s08): CLI envelope helpers`

---

### Task 3.2: cli/ma.ts + package.json script

**Files:**
- Create `app/packages/server/src/cli/ma.ts`
- Modify `app/packages/server/package.json` scripts: `"ma": "tsx src/cli/ma.ts"`

**最小 argv 解析（不强制 commander）：**

```typescript
// 用法: ma wiki <cmd> [...]
// --format json|text  默认 json（Agent-first）；text 时 human 简表
import { ensureWikiDir } from '../wiki/store.js';
import { listWikiPages } from '../wiki/store.js';
import { checkHealth } from '../wiki/health.js';
import { checkLint } from '../wiki/lint.js';
import { queryWiki } from '../wiki/query.js';
import { enqueueWikiIngest, listWikiIngestJobs, retryWikiIngestJob, toWikiIngestJob, getWikiIngestJob } from '../wiki/ingest-queue.js';
import { wakeWikiIngestWorker } from '../wiki/ingest-worker.js';
import { ingestIssue } from '../wiki/ingest.js';
import { emitOk, emitErr } from './envelope.js';

async function main() {
  ensureWikiDir();
  const args = process.argv.slice(2);
  const formatJson = !args.includes('--format') || args.includes('--format=json') || args.includes('json');
  // 简化：默认始终 JSON envelope（spec Agent-first）；--format text 时 print 简短文本
  const wantText = args.includes('--format=text') || args.includes('--format') && args[args.indexOf('--format') + 1] === 'text';

  if (args[0] !== 'wiki') {
    emitErr('input.invalid', '用法: ma wiki <health|lint|query|pages|jobs|ingest> ...', 5);
  }
  const cmd = args[1];
  try {
    switch (cmd) {
      case 'health': {
        const data = checkHealth();
        if (wantText) {
          console.log(`pages=${data.total} orphans=${data.orphans.length} broken=${data.brokenLinks.length} stubs=${data.stubs.length}`);
          process.exit(0);
        }
        emitOk(data, { count: data.total });
      }
      case 'lint': {
        const data = await checkLint();
        if (wantText) {
          console.log(data.report);
          process.exit(0);
        }
        emitOk(data);
      }
      case 'query': {
        const q = args[2];
        if (!q) emitErr('input.invalid', 'ma wiki query "<question>"', 5);
        const data = await queryWiki(q);
        if (wantText) {
          console.log(data.answer);
          process.exit(0);
        }
        emitOk(data);
      }
      case 'pages': {
        const data = listWikiPages();
        emitOk(data, { count: data.length });
      }
      case 'jobs': {
        if (args[2] === 'retry') {
          const id = args[3];
          if (!id) emitErr('input.invalid', 'ma wiki jobs retry <id>', 5);
          const ok = retryWikiIngestJob(id);
          if (!ok) emitErr('input.invalid', '仅 dead job 可 retry', 5);
          wakeWikiIngestWorker();
          const row = getWikiIngestJob(id);
          emitOk(row ? toWikiIngestJob(row) : null);
        }
        const status = args[2]?.startsWith('--status=') ? args[2].slice(9) : undefined;
        const rows = listWikiIngestJobs(status).map(toWikiIngestJob);
        emitOk(rows, { count: rows.length });
      }
      case 'ingest': {
        const issueId = args[2];
        if (!issueId) emitErr('input.invalid', 'ma wiki ingest <issueId> [--sync]', 5);
        if (args.includes('--sync')) {
          await ingestIssue(issueId);
          emitOk({ issueId, mode: 'sync' });
        }
        const jobId = enqueueWikiIngest(issueId);
        if (jobId) wakeWikiIngestWorker();
        emitOk({ issueId, jobId, mode: 'enqueue' });
      }
      default:
        emitErr('input.invalid', `未知命令: ${cmd}`, 5);
    }
  } catch (e) {
    const msg = String(e);
    if (msg.includes('不存在')) emitErr('resource.not_found', msg, 4);
    if (msg.includes('WIKI_LLM_API_KEY') || msg.includes('未配置')) emitErr('input.invalid', msg, 5);
    emitErr('server.transient', msg, 7);
  }
}

main();
```

> 实现时注意 `emitOk`/`emitErr` 是 `never`；switch 分支不要 fallthrough。可用 if 链替代。

- [ ] package.json:

```json
"ma": "tsx src/cli/ma.ts"
```

- [ ] typecheck + 手动：

```bash
cd app/packages/server && pnpm ma wiki health
# → {"ok":true,...} exit 0
pnpm ma wiki
# → exit 5
```

- [ ] commit: `feat(s08): ma wiki CLI（Envelope + exit code）`

---

### Task 3.3: 端到端验收 + handoff

按 spec §8 勾选：

- [ ] Issue done → job 生命周期 → dead/retry
- [ ] 成功路径（有 key）→ wiki 页 + AGENTS.md marker + buildPrompt 含 snapshot（可 log prompt 或读文件）
- [ ] CLI health/jobs/ingest
- [ ] 确认 issues.ts 无 `void ingestIssue`
- [ ] 回归：S07 query/health API 仍 200

写 `app/.progress/s08-impl-3.md`，push。

---

## 验收总览（计划者）

| spec §8 | Task |
|---|---|
| 队列 + DLQ + retry | 2.1–2.4, 2.6, 3.3 |
| AGENTS.md bridge + prompt | 1.3, 2.3, 2.5, 3.3 |
| CLI envelope | 3.1–3.2, 3.3 |
| 移除 fire-and-forget | 2.4 |
| migration | 1.2 |

| 决策 | Task |
|---|---|
| B2 marker | 1.3 |
| B3 SQLite queue | 1.2, 2.1–2.2 |
| B4 CLI | 3.1–3.2 |
| B6 prompt | 2.5 |
| B9 enqueue | 2.4 |

---

## 计划自审

1. **Spec 覆盖：** §3 bridge / §4 queue / §5 CLI / §6 shared / §8 验收均有 Task。
2. **无 placeholder：** 关键代码与路径写死。
3. **类型一致：** `enqueueWikiIngest` / `claimNext` / `updateAgentsMdBridge` / `emitOk` 跨 Task 同名。
4. **与 S07：** CLI import `checkHealth`/`checkLint`/`queryWiki`——**要求分支含 S07**；handoff 写明若缺则先合 S07。
