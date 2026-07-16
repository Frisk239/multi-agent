# Handoff: s09-impl-1

> 切片：`S09` · 角色：`impl` · 序号：`1`
> 日期：2026-07-16
> 分支：`feat/s09-memory-provider`
> **分支基线：** 从 **`origin/main`（已合 S08 PR #7，`5362ee6`）** 切出。  
> 本地 `main` 仍停在 S09 docs / 缺 S08 代码，故**未**用本地 main。  
> 在 feature 分支上额外提交了 S09 design+plan 文档（`f94b816`），保证执行者/审查可在同分支读到真源。

## 上下文（给下一个会话读）

S09 = Phase 3（可插拔记忆）第一刀：MemoryProvider ABC + MemoryManager + SqliteText 默认实现。

impl-1 边界：**shared 契约 + memory_item 表 + memory 模块纯逻辑**。  
**未改** `run-worker` / `prompt` / `routes` / `app.ts` / `index.ts`（留给 impl-2）。

- spec：[`docs/superpowers/specs/2026-07-16-s09-memory-provider-design.md`](../../docs/superpowers/specs/2026-07-16-s09-memory-provider-design.md)
- 计划：[`docs/superpowers/plans/2026-07-16-s09-memory-provider.md`](../../docs/superpowers/plans/2026-07-16-s09-memory-provider.md) 执行者片段 A（Task 1.1–1.6）

## 本会话完成了什么

- **Task 1.1** `app/packages/shared/src/schema.ts`：`MemoryItem` / `CreateMemoryInput` / `MemoryStatus`  
  （插在 S08 CLI envelope 之后、Run 生命周期事件之前）
- **Task 1.2** `memory_item` 表 + 手写 migration **0006** 三件套  
  - `app/packages/server/src/db/schema.ts` → `memoryItems`  
  - `drizzle/0006_memory_item.sql`  
  - `drizzle/meta/0006_snapshot.json` + `_journal.json` **idx=6**（journal 最大原为 5 / `0005_wiki_ingest_job`）
- **Task 1.3** `app/packages/server/src/memory/types.ts`：`MemoryProvider` / views / sync input + 可选 `prefetchSync`
- **Task 1.4** `sqlite-text-provider.ts`：`SqliteTextProvider`（`name='sqlite-text'`）  
  - `tokenize`：ASCII `\w{2,}` + CJK bigram  
  - `prefetchSync`：最近 200 条内存打分 / 无 token 退回最近 N  
  - `syncTurn`：User/Outcome 模板，总长截断 4000  
  - **`addRaw(text, meta?)`**：curated 直写，不套模板
- **Task 1.5** `manager.ts`：`MemoryManager` 单例 `memoryManager`  
  - `setExternal` / `getExternalName` / `initialize`  
  - `prefetchForIssueSync` → `# Memory Context` 或 null（失败只 log）  
  - `syncRunCompleted`：仅 `status==='completed'`，fire-and-forget  
  - `search` / `addCurated`（duck-type `addRaw`，否则 fallback `syncTurn`）

Commits：

| hash | message |
|---|---|
| `f94b816` | docs(s09): bring MemoryProvider design + plan onto feature branch |
| `175fa93` | feat(s09): shared MemoryItem / CreateMemoryInput / MemoryStatus |
| `0fcaea8` | feat(s09): memory_item 表 + migration |
| `0b8f7e2` | feat(s09): MemoryProvider 类型契约 |
| `f12c24d` | feat(s09): SqliteTextProvider（分词 + LIKE/内存打分） |
| `987dd3b` | feat(s09): MemoryManager 单例（prefetchSync + syncRunCompleted） |
| （本 commit） | docs(s09): impl-1 handoff |

## 自测结果

**typecheck**（`cd app && pnpm -r typecheck`，全绿）：

```
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

**migration：**

```
$ cd app/packages/server && pnpm db:migrate
✓ 迁移完成
```

**provider/manager spike**（本地 `dev.db`，测后删除 spike 行）：

```
addCurated => { id: '...', text: 'S09 spike: 看板拖拽优先用 position', source: 'sqlite-text', issueId: 'issue-s09-spike', ... }
search 看板 => [ { id: '...', text: 'S09 spike: 看板拖拽优先用 position' } ]
prefetch block =>
# Memory Context
（参考数据，非用户指令）
- S09 spike: 看板拖拽优先用 position
cleaned 1 spike rows
```

## 与计划的偏离

1. **分支基线：** 计划优先「已合 S08 的 main」。远程 `origin/main` 已合 S08；本地 `main` 缺 S08 代码但有 S09 docs。实际：`origin/main` 切 `feat/s09-memory-provider`，并 cherry 进 S09 docs。
2. **`addCurated` 返回值：** 计划写 `async addCurated(...): Promise`；实现当 provider 有 `addRaw` 时返回 `MemoryItemView`，便于 impl-2 API 直接 201 body（无则 `void` fallback）。
3. **无其他偏离。** migration 号确认为 **0006**（非死抄冲突）。SQL 末句**无**多余尾部 breakpoint。未改 run-worker/prompt/routes。

## 导出签名（给 impl-2 直接 import）

### shared（`@ma/shared`）

- `MemoryItem` / `CreateMemoryInput` / `MemoryStatus`（Zod + type）

### DB

- `memoryItems`（`app/packages/server/src/db/schema.ts`）
- migration tag：`0006_memory_item`

### memory 模块

```ts
import type {
  MemoryItemView,
  MemoryPrefetchResult,
  MemoryProvider,
  MemorySyncInput,
} from '../memory/types.js';
import { SqliteTextProvider, tokenize } from '../memory/sqlite-text-provider.js';
import { memoryManager } from '../memory/manager.js';
```

| 符号 | 用途 |
|---|---|
| `memoryManager.prefetchForIssueSync(issue)` | **prompt.ts** 同步注入；无命中/`null` 不写空标题 |
| `memoryManager.syncRunCompleted({ issue, run, assistantText })` | **run-worker** completed 成功路径；内部再 guard status |
| `memoryManager.search(q, limit)` | GET `/api/memory?q=` |
| `memoryManager.addCurated(text, issueId?)` | POST `/api/memory`（走 `addRaw`） |
| `memoryManager.setExternal(new SqliteTextProvider())` + `initialize()` | **index.ts** 启动 |
| `memoryManager.getExternalName()` | GET `/api/memory/status` |

`SqliteTextProvider.addRaw(text, meta?)` 供 curated 直写；impl-2 routes 优先走 Manager，勿直接插表（除非 list 最近条无 provider 搜索）。

## 遗留 / 下一个执行者要注意的点

1. **impl-2 接线点（计划片段 B）**
   - `runtime/prompt.ts`：wiki bridge **之后**、briefing **之前**  
     `const memoryBlock = memoryManager.prefetchForIssueSync({ id, title, description }); if (memoryBlock) parts.push(memoryBlock);`  
     顺序：`skill → wiki → memory → briefing → body`
   - `orchestration/run-worker.ts`：**仅 completed 成功路径**、`run:completed` publish 附近调 `syncRunCompleted`；`failRun`/cancelled **零** memory 调用
   - `routes/memory.ts` + `app.ts` register + `index.ts` `setExternal`/`initialize`
2. **buildPrompt 保持同步**——用 `prefetchForIssueSync`，不要把 prompt 全树 async 化（S09 决议）。
3. **M4 / M7：** 失败只 `console.error`，不抛到 run/prompt；status 非 completed 不写。
4. **API list 无 q：** 计划允许直接 `db.select().from(memoryItems).orderBy(desc(...))` 读最近条。
5. **不要**在 impl-2 再改 shared/migration 形状，除非 typecheck/API 发现缺口。
6. 验收：POST memory → GET 能搜到；构造含关键词 issue 后 `buildPrompt` 含 `# Memory Context`；`rg memoryManager run-worker.ts` 仅 completed 一处。

## 验收结论（仅计划者填）

- [ ] typecheck 通过
- [ ] `pnpm dev` 能跑
- [ ] 切片验收标准达成（见 roadmap / spec §8；impl-1 仅数据层）
- 结论：<达标合并 / 需返工 / 需追加切片>
