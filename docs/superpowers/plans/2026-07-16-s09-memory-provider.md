# S09 MemoryProvider + SQLite 文本记忆 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **本项目工程模式：** AGENTS.md「垂直切片 × 计划者-执行者」。按执行者片段拆分，handoff 在 `app/.progress/`。
> **spec 真源：** [`docs/superpowers/specs/2026-07-16-s09-memory-provider-design.md`](../specs/2026-07-16-s09-memory-provider-design.md)
> **代码锚点（实现时核对）：** `runtime/prompt.ts` 同步 `buildPrompt`；`run-worker.ts` completed 分支约 line 184–216 有 `finalText`；失败路径 `failRun` 不调 memory。

**Goal:** 可插拔 MemoryProvider + SqliteText 默认实现；run **成功 completed** 写记忆；`buildPrompt` 注入 `# Memory Context`；最小 REST API。

**Architecture:** hermes 式 ABC + MemoryManager（≤1 external）；平台映射为 buildPrompt 读 + run completed 写；SQLite `memory_item` + LIKE/分词检索（向量 S10）。

**Tech Stack:** TypeScript / Fastify / Drizzle / better-sqlite3 / Zod；无 mem0、无 PG、无新测试框架。

## Global Constraints

- **分支：** `feat/s09-memory-provider`
  - 优先：从 **已合 S08 的 main** 切（prompt 已有 wiki bridge）
  - 否则：从 `feat/s08-bridge-queue-cli` 切，handoff 写明
- **M4：** 仅 `completed` 写记忆；`failed`/`cancelled` 不写
- **M5：** prompt 顺序 `skill → wiki(若有) → memory → briefing → body`
- **M6：** Manager 至多一个 external；S09 启动时 `setExternal(new SqliteTextProvider())`
- **M7：** prefetch/sync 失败只 `console.error`，不抛到 run/prompt
- **M10：** userText ≤1000 字，assistantText ≤2000 字；prefetch limit 默认 5
- **buildPrompt 保持同步：** 使用 `memoryManager.prefetchForIssueSync`（内部同步查 SQLite）
- **验证：** `pnpm -r typecheck` + 手动 API/跑一次 run；无 vitest
- **Git：** Conventional Commits，绝不 push main

## 文件结构

```
app/packages/
├── shared/src/schema.ts              [改] MemoryItem / CreateMemoryInput / MemoryStatus
├── server/
│   ├── drizzle/0006_memory_item.sql  [新] + journal/snapshot（若 0005 已是 wiki job；否则按 journal 下一号）
│   └── src/
│       ├── db/schema.ts              [改] memoryItems 表
│       ├── memory/
│       │   ├── types.ts              [新] MemoryProvider 接口
│       │   ├── manager.ts            [新] MemoryManager 单例
│       │   └── sqlite-text-provider.ts [新]
│       ├── runtime/prompt.ts         [改] memory 块
│       ├── orchestration/run-worker.ts [改] completed 后 sync
│       ├── routes/memory.ts          [新]
│       ├── app.ts                    [改] register memoryRoutes
│       └── index.ts                  [改] init memoryManager
```

---

# 执行者片段 A（impl-1）：shared + DB + Provider + Manager

> **边界：** 契约、表、内存模块纯逻辑。不改 run-worker / prompt / routes。
> **完成后写** `app/.progress/s09-impl-1.md`

### Task 1.1: shared 契约

**Files:** Modify `app/packages/shared/src/schema.ts`

在合适位置（Wiki/S08 契约之后、或 DomainEvent 前）插入：

```typescript
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
```

- [ ] `cd app && pnpm -r typecheck`
- [ ] Commit: `feat(s09): shared MemoryItem / CreateMemoryInput / MemoryStatus`

---

### Task 1.2: DB schema + migration

**Files:**
- Modify `app/packages/server/src/db/schema.ts`
- Create `app/packages/server/drizzle/0006_memory_item.sql`（**若 journal 最大 idx 不是 5，改用下一序号**）
- Update `drizzle/meta/_journal.json` + 手写 `0006_snapshot.json`（照 S05/S08 手写策略；SQL 末句无多余 breakpoint）

```typescript
// schema.ts 末尾追加
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
```

```sql
CREATE TABLE `memory_item` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text DEFAULT 'workspace' NOT NULL,
	`issue_id` text,
	`agent_id` text,
	`run_id` text,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_memory_item_created` ON `memory_item` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_memory_item_issue` ON `memory_item` (`issue_id`);
```

- [ ] `cd app/packages/server && pnpm db:migrate` → `✓ 迁移完成`
- [ ] typecheck + commit: `feat(s09): memory_item 表 + migration`

---

### Task 1.3: memory/types.ts

**Files:** Create `app/packages/server/src/memory/types.ts`

```typescript
// S09 MemoryProvider 契约（spec §4.1，学 hermes ABC 裁剪）
export interface MemoryItemView {
  id: string;
  text: string;
  score?: number;
  source?: string;
  issueId?: string | null;
  runId?: string | null;
  createdAt?: string;
}

export interface MemoryPrefetchResult {
  items: MemoryItemView[];
}

export interface MemorySyncInput {
  sessionId: string;
  issueId: string;
  runId: string;
  agentId?: string | null;
  userText: string;
  assistantText: string;
}

export interface MemoryProvider {
  readonly name: string;
  isAvailable(): boolean;
  initialize(): void | Promise<void>;
  prefetch(
    query: string,
    opts?: { sessionId?: string; limit?: number },
  ): Promise<MemoryPrefetchResult>;
  /** 同步变体：S09 buildPrompt 用；默认可 throw 或委托 async */
  prefetchSync?(
    query: string,
    opts?: { sessionId?: string; limit?: number },
  ): MemoryPrefetchResult;
  syncTurn(input: MemorySyncInput): Promise<void>;
  shutdown?(): void | Promise<void>;
}
```

- [ ] commit: `feat(s09): MemoryProvider 类型契约`

---

### Task 1.4: SqliteTextProvider

**Files:** Create `app/packages/server/src/memory/sqlite-text-provider.ts`

**Interfaces:**
- Consumes: `db`, `memoryItems`
- Produces: `SqliteTextProvider` class, `name = 'sqlite-text'`

实现要点：

```typescript
import { desc, like, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { memoryItems } from '../db/schema.js';
import type { MemoryProvider, MemoryPrefetchResult, MemorySyncInput } from './types.js';

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

/** 简易分词：ASCII 词长≥2 + CJK 双字 gram */
export function tokenize(query: string): string[] {
  const tokens = new Set<string>();
  for (const m of query.match(/\w{2,}/g) ?? []) tokens.add(m.toLowerCase());
  const cjk = query.match(/[\u4e00-\u9fff]+/g)?.join('') ?? '';
  for (let i = 0; i < cjk.length - 1; i++) tokens.add(cjk.slice(i, i + 2));
  return [...tokens];
}

export class SqliteTextProvider implements MemoryProvider {
  readonly name = 'sqlite-text';

  isAvailable(): boolean {
    return true;
  }

  initialize(): void {
    // no-op：表靠 migration
  }

  prefetchSync(query: string, opts?: { limit?: number }): MemoryPrefetchResult {
    const limit = opts?.limit ?? 5;
    const tokens = tokenize(query);
    let rows;
    if (tokens.length === 0) {
      rows = db
        .select()
        .from(memoryItems)
        .orderBy(desc(memoryItems.createdAt))
        .limit(limit)
        .all();
    } else {
      // 简化：取最近 200 条再内存过滤（S09 数据量小）
      const all = db
        .select()
        .from(memoryItems)
        .orderBy(desc(memoryItems.createdAt))
        .limit(200)
        .all();
      rows = all
        .map((r) => {
          const lower = r.text.toLowerCase();
          let score = 0;
          for (const t of tokens) {
            if (lower.includes(t.toLowerCase()) || r.text.includes(t)) score += 1;
          }
          return { r, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || b.r.createdAt - a.r.createdAt)
        .slice(0, limit)
        .map((x) => x.r);
    }
    return {
      items: rows.map((r) => ({
        id: r.id,
        text: r.text,
        source: 'sqlite-text',
        issueId: r.issueId,
        runId: r.runId,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    };
  }

  async prefetch(query: string, opts?: { limit?: number }): Promise<MemoryPrefetchResult> {
    return this.prefetchSync(query, opts);
  }

  async syncTurn(input: MemorySyncInput): Promise<void> {
    const text = truncate(
      `Issue session ${input.sessionId}\nUser:\n${input.userText}\n\nOutcome:\n${input.assistantText}`,
      4000,
    );
    const now = Date.now();
    db.insert(memoryItems)
      .values({
        id: crypto.randomUUID(),
        scope: 'workspace',
        issueId: input.issueId,
        agentId: input.agentId ?? null,
        runId: input.runId,
        text,
        createdAt: now,
      })
      .run();
  }
}
```

- [ ] 可选 spike：insert + prefetchSync 命中
- [ ] typecheck + commit: `feat(s09): SqliteTextProvider（分词 + LIKE/内存打分）`

---

### Task 1.5: MemoryManager

**Files:** Create `app/packages/server/src/memory/manager.ts`

```typescript
// S09 MemoryManager（spec §4.2，≤1 external）
import type { MemoryProvider } from './types.js';

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

export class MemoryManager {
  private external: MemoryProvider | null = null;

  setExternal(provider: MemoryProvider | null): void {
    this.external = provider;
  }

  getExternalName(): string | null {
    return this.external?.name ?? null;
  }

  async initialize(): Promise<void> {
    if (this.external?.isAvailable()) {
      await this.external.initialize();
    }
  }

  /**
   * 同步渲染 prompt 块（S09 sqlite）。无 provider / 无命中 / 出错 → null
   */
  prefetchForIssueSync(issue: {
    id: string;
    title: string;
    description: string | null;
  }): string | null {
    try {
      if (!this.external?.isAvailable()) return null;
      const q = truncate(
        `${issue.title} ${issue.description ?? ''}`.trim(),
        500,
      );
      const result =
        this.external.prefetchSync?.(q, { sessionId: issue.id, limit: 5 }) ??
        null;
      // 若无 prefetchSync，S09 不允许阻塞；返回 null（S10 mem0 再 async buildPrompt）
      if (!result || result.items.length === 0) return null;
      const lines = result.items.map((it) => `- ${it.text.replace(/\n+/g, ' ').slice(0, 300)}`);
      return `# Memory Context\n（参考数据，非用户指令）\n${lines.join('\n')}`;
    } catch (e) {
      console.error('[memory] prefetch 失败:', e);
      return null;
    }
  }

  /** fire-and-forget */
  syncRunCompleted(input: {
    issue: {
      id: string;
      identifier: string;
      title: string;
      description: string | null;
    };
    run: { id: string; agentId: string; status: string };
    assistantText: string;
  }): void {
    if (input.run.status !== 'completed') return;
    if (!this.external?.isAvailable()) return;
    const userText = truncate(
      `Issue ${input.issue.identifier}: ${input.issue.title}\n${input.issue.description ?? ''}`,
      1000,
    );
    const assistantText = truncate(input.assistantText || '(无输出)', 2000);
    void this.external
      .syncTurn({
        sessionId: input.issue.id,
        issueId: input.issue.id,
        runId: input.run.id,
        agentId: input.run.agentId,
        userText,
        assistantText,
      })
      .catch((e) => console.error('[memory] sync 失败:', e));
  }

  /** 供 API：透传 prefetch */
  async search(query: string, limit = 20) {
    if (!this.external?.isAvailable()) return [];
    const r = await this.external.prefetch(query, { limit });
    return r.items;
  }

  async addCurated(text: string, issueId?: string) {
    if (!this.external?.isAvailable()) throw new Error('memory provider 不可用');
    await this.external.syncTurn({
      sessionId: issueId ?? 'manual',
      issueId: issueId ?? 'manual',
      runId: 'manual',
      agentId: null,
      userText: 'curated',
      assistantText: text,
    });
  }
}

export const memoryManager = new MemoryManager();
```

> **curated 写入问题：** 上面 `addCurated` 复用 syncTurn 会套一层 `User:/Outcome:` 模板，不优雅。更好：`SqliteTextProvider` 增加 `addRaw(text, meta)` 或 Manager 直接 insert。

**决议（写死）：** `SqliteTextProvider` 增加：

```typescript
addRaw(text: string, meta?: { issueId?: string | null; agentId?: string | null; runId?: string | null }): MemoryItemView
```

Manager.addCurated 调 `addRaw`；若 provider 无 addRaw，fallback syncTurn。

在 Task 1.4 实现里补上 `addRaw`，1.5 Manager 调用它（可用 duck-type：`'addRaw' in provider`）。

- [ ] typecheck
- [ ] commit: `feat(s09): MemoryManager 单例（prefetchSync + syncRunCompleted）`

---

### Task 1.6: impl-1 handoff

写 `app/.progress/s09-impl-1.md`：导出签名、migration 号、tokenize、给 impl-2（prompt/worker 接线点）。

```bash
git add app/.progress/s09-impl-1.md
git commit -m "docs(s09): impl-1 handoff"
git push origin feat/s09-memory-provider
```

---

# 执行者片段 B（impl-2）：prompt + run-worker + API + 启动

> **边界：** 全接线 + 验收路径。
> **依赖：** impl-1 memory 模块。
> **完成后写** `app/.progress/s09-impl-2.md`（可兼切片最终 handoff 若只两刀；或再拆 impl-3 仅验收——**本计划 2 个执行者足够**）

### Task 2.1: prompt.ts 注入 memory

**Files:** Modify `app/packages/server/src/runtime/prompt.ts`

- [ ] import `memoryManager` from `../memory/manager.js`
- [ ] 在 wiki bridge 之后、briefing 之前：

```typescript
  // S09：memory prefetch（spec M5）
  const memoryBlock = memoryManager.prefetchForIssueSync({
    id: issue.id,
    title: issue.title,
    description: issue.description,
  });
  if (memoryBlock) parts.push(memoryBlock);
```

确认顺序注释更新为：

```
skillBlock → wikiBridgeBlock → memoryBlock → briefing → issueBody
```

- [ ] typecheck + commit: `feat(s09): buildPrompt 注入 Memory Context`

---

### Task 2.2: run-worker completed 挂钩

**Files:** Modify `app/packages/server/src/orchestration/run-worker.ts`

- [ ] import `memoryManager` from `../memory/manager.js`
- [ ] import `issues` 已有则复用；需读 issue 行

在 **completed 成功路径**、`eventBus.publish({ type: 'run:completed' ...})` **附近**（写 comment 之后或之前均可，推荐 publish 之后）：

```typescript
    // S09：成功 run 才写记忆（失败/取消路径禁止调用）
    try {
      const issueRow = db.select().from(issues).where(eq(issues.id, runRow.issueId)).get();
      if (issueRow) {
        memoryManager.syncRunCompleted({
          issue: {
            id: issueRow.id,
            identifier: issueRow.identifier,
            title: issueRow.title,
            description: issueRow.description,
          },
          run: {
            id: runRow.id,
            agentId: runRow.agentId,
            status: 'completed',
          },
          assistantText: finalText,
        });
      }
    } catch (e) {
      console.error('[memory] syncRunCompleted 包装失败:', e);
    }
```

**确认：** `failRun` / cancelled 分支 **零** memory 调用。

- [ ] typecheck + commit: `feat(s09): run completed 触发 memory sync`

---

### Task 2.3: memory routes + app + index

**Files:**
- Create `app/packages/server/src/routes/memory.ts`
- Modify `app/packages/server/src/app.ts`
- Modify `app/packages/server/src/index.ts`

```typescript
// routes/memory.ts
import type { FastifyInstance } from 'fastify';
import { CreateMemoryInput } from '@ma/shared';
import { memoryManager } from '../memory/manager.js';
import { db } from '../db/client.js';
import { memoryItems } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/memory/status', async () => ({
    provider: memoryManager.getExternalName(),
    available: memoryManager.getExternalName() != null,
  }));

  app.get('/api/memory', async (req) => {
    const { q, limit } = req.query as { q?: string; limit?: string };
    const lim = Math.min(Number(limit) || 20, 100);
    if (q && q.trim()) {
      return memoryManager.search(q.trim(), lim);
    }
    // 最近 lim 条
    const rows = db
      .select()
      .from(memoryItems)
      .orderBy(desc(memoryItems.createdAt))
      .limit(lim)
      .all();
    return rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      issueId: r.issueId,
      agentId: r.agentId,
      runId: r.runId,
      text: r.text,
      createdAt: new Date(r.createdAt).toISOString(),
    }));
  });

  app.post('/api/memory', async (req, reply) => {
    const parsed = CreateMemoryInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      // 使用 provider addRaw 或 manager 封装
      const { addCuratedMemory } = await import('../memory/manager.js');
      // 更好：memoryManager 上已有 addCurated
      await memoryManager.addCurated(parsed.data.text, parsed.data.issueId);
      // 返回最新一条（同 text 近似）—— 简化 201 + body
      const row = db
        .select()
        .from(memoryItems)
        .orderBy(desc(memoryItems.createdAt))
        .limit(1)
        .get();
      return reply.status(201).send(
        row
          ? {
              id: row.id,
              scope: row.scope,
              issueId: row.issueId,
              agentId: row.agentId,
              runId: row.runId,
              text: row.text,
              createdAt: new Date(row.createdAt).toISOString(),
            }
          : { ok: true },
      );
    } catch (e) {
      return reply.status(500).send({ error: String(e) });
    }
  });
}
```

**清理：** 不要动态 import 胡写；在 manager 实现 `addCurated` 调 `SqliteTextProvider.addRaw`。

`app.ts`：`import { memoryRoutes } from './routes/memory.js';` + `await app.register(memoryRoutes);`

`index.ts`：

```typescript
import { memoryManager } from './memory/manager.js';
import { SqliteTextProvider } from './memory/sqlite-text-provider.js';

  memoryManager.setExternal(new SqliteTextProvider());
  await memoryManager.initialize();
```

（`main` 已是 async。）

- [ ] typecheck
- [ ] 手动：

```bash
curl -X POST http://localhost:3001/api/memory -H 'Content-Type: application/json' \
  -d '{"text":"S09 测试记忆：看板拖拽优先用 position"}'
curl 'http://localhost:3001/api/memory?q=看板'
curl http://localhost:3001/api/memory/status
```

- [ ] commit: `feat(s09): memory API + 启动注入 SqliteTextProvider`

---

### Task 2.4: 端到端验收 + handoff

**验收（spec §8）：**

- [ ] typecheck 全绿
- [ ] POST memory → GET 能搜到
- [ ] （可选）触发真实/假 completed：若难跑 CLI，可用最小脚本调 `memoryManager.syncRunCompleted` 或 SQL 检查
- [ ] 构造 issue 标题含关键词后，用临时脚本 `buildPrompt(issueId)` 打印，应含 `# Memory Context`
- [ ] 确认 run-worker failed 路径无 memory 调用（`rg memoryManager run-worker.ts` 仅 completed 一处）
- [ ] 回归：issues/wiki 路由仍注册

写 `app/.progress/s09-impl-2.md`（切片总结级），push。

---

## 验收总览（计划者）

| spec §8 | Task |
|---|---|
| memory_item + Provider/Manager | 1.2–1.5 |
| run completed 写 / fail 不写 | 2.2 |
| buildPrompt Memory Context | 2.1 |
| API | 2.3 |
| 失败隔离 | Manager catch + worker try |

| 决策 | Task |
|---|---|
| M2 sqlite | 1.4 |
| M3/M5 prompt | 2.1 |
| M4 completed only | 2.2 |
| M6 setExternal | 2.3 index |
| M9 curated POST | 2.3 |

---

## 计划自审

1. **Spec 覆盖：** §4–§8 均有 Task。  
2. **无 TBD 功能：** buildPrompt 同步策略写死为 `prefetchForIssueSync`。  
3. **类型一致：** MemoryProvider / Manager / addRaw 命名统一。  
4. **锚点：** run-worker `finalText` 已存在于 completed 分支。  
5. **迁移号：** 执行者按 journal 下一 idx 调整，勿死抄 0006 若冲突。  
6. **执行者数量：** 2 个片段（impl-1 数据层，impl-2 接线+验收），符合「不必凑三个」。  

---

## 执行者启动提示词

### impl-1

```
你是 S09 MemoryProvider 切片的执行者 impl-1。

必读：AGENTS.md；docs/superpowers/specs/2026-07-16-s09-memory-provider-design.md；
docs/superpowers/plans/2026-07-16-s09-memory-provider.md 片段 A（Task 1.1–1.6）。

分支 feat/s09-memory-provider：优先含 S08 的 main，否则 feat/s08-bridge-queue-cli，handoff 写明。
完成 shared + memory_item migration + types + SqliteTextProvider(+addRaw) + MemoryManager。
不改 run-worker/prompt/routes。typecheck 全绿后写 s09-impl-1.md 并 push。
```

### impl-2（impl-1 通过后）

```
你是 S09 执行者 impl-2。

必读：计划片段 B + app/.progress/s09-impl-1.md。
接线 prompt memory 块、run-worker completed sync、memory routes、index setExternal。
验收 API + buildPrompt 含 Memory Context；确认 failed 路径无 sync。
写 s09-impl-2.md 并 push。
```
