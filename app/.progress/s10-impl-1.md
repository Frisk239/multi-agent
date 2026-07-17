# Handoff: s10-impl-1

> 切片：`S10` · 角色：`impl` · 序号：`1`（片段 A：infra + provider）
> 日期：2026-07-17
> 分支：`feat/s10-pgvector-memory`（基于已合 S09 的 origin/main；含计划排雷附录 commit）
> **基线：** S09 MemoryProvider / MemoryManager / SqliteTextProvider 已在 main

## 上下文（给下一个会话读）

S10 = Phase 3 第二刀：PostgreSQL + pgvector 向量记忆 + buildPrompt async。

- spec：[`docs/superpowers/specs/2026-07-17-s10-pgvector-memory-design.md`](../../docs/superpowers/specs/2026-07-17-s10-pgvector-memory-design.md)
- 计划：[`docs/superpowers/plans/2026-07-17-s10-pgvector-memory.md`](../../docs/superpowers/plans/2026-07-17-s10-pgvector-memory.md) 片段 A + **排雷 R1–R14**
- 本会话 = 执行者片段 A（Task 1.1–1.5）：compose / pg / pool / embedder / PgvectorProvider + Manager `addCurated` await
- **未做（留给 impl-2 片段 B）：** `prefetchForIssue` async、`buildPrompt` async、`run-worker` await、`index.ts` MEMORY_PROVIDER 选择、`routes/memory` 统一 Manager

## 本会话完成了什么

| Task | 内容 | Commit |
|---|---|---|
| 1.1 | 项目根 `docker-compose.yml`（`pgvector/pgvector:pg16`，user/db `ma`/`ma_memory`，healthcheck） | `8a513a6` |
| 1.2 | `@ma/server` 依赖 `pg` + `@types/pg`（注意 monorepo 在 `app/` 下，勿在仓库根 `pnpm add`） | `6fa597d` |
| 1.3 | `src/db/pg-memory.ts`：`getMemoryDatabaseUrl` / `getMemoryPgPool` / `memoryPgQuery` / `closeMemoryPgPool` | `a688ddc` |
| 1.4 | `src/memory/embedder.ts`：OpenAI 兼容 `embedTexts` / `embedQuery` / `vectorLiteral`；dims 校验 | `b6b679c` |
| 1.5 | `src/memory/pgvector-provider.ts`：DDL + HNSW cosine + prefetch/syncTurn/addRaw(async) | `d61e282` |
| 1.5 边界 | `manager.addCurated`：`await Promise.resolve(addRaw(...))`；duck-type 返回 `MemoryItemView \| Promise<...>`（R6） | 同 `d61e282` |

**导出供 impl-2 接线：**

- `PgvectorProvider` ← `./memory/pgvector-provider.js`
- `getMemoryDatabaseUrl` / pool helpers ← `./db/pg-memory.js`
- `getEmbeddingConfig` / embed* ← `./memory/embedder.js`
- `memoryManager.addCurated` 已兼容 async `addRaw`

**compose 用法（文档一句）：**

```bash
docker compose up -d
# MEMORY_DATABASE_URL=postgresql://ma:ma@127.0.0.1:5432/ma_memory
```

## 自测结果

### typecheck（全绿）

```
$ cd app && pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/web typecheck: Done
packages/server typecheck: Done
```

### 环境

| 项 | 状态 |
|---|---|
| Docker | 有（29.x）；`docker compose up -d` → `memory-db` **healthy** |
| `MEMORY_DATABASE_URL` | 本机未预置；spike 时临时注入 `postgresql://ma:ma@127.0.0.1:5432/ma_memory` |
| `EMBEDDING_API_KEY` / `OPENAI_API_KEY` | **无** — 无法跑真实 embed → addRaw/prefetch 全链路 |

### Spike（R13 部分：无真实 embedding）

临时脚本验证（**未入库**）：

1. `SELECT 1` OK  
2. `PgvectorProvider.initialize()` 后 `isAvailable()===true`（需 dummy `EMBEDDING_API_KEY` + URL）  
3. extension `vector` 存在  
4. 表列：`embedding:vector` 等齐全  
5. 写入 1536 维假向量 + `<=>` 自检索 **score=1**  
6. 清理 spike 行 + `shutdown`

```
SELECT 1 => { ok: 1 }
before init isAvailable= false
after init isAvailable= true
extension => [ { extname: 'vector' } ]
columns => id:uuid, text:text, embedding:vector, metadata:jsonb, ...
cosine self-retrieve => [ { id: '...', t: 'spike vector memory kanban position', score: 1 } ]
spike ok
```

**未跑：** 真实 `embedTexts` / `addRaw`→`prefetch` 语义检索（缺 API key）。代码路径按计划实现；impl-2 有 key 时走路径 B 验收。

### 代码自审（对照 R1–R6 / R11–R12）

- [x] R1：`vector(${dims})` 字符串拼接，dims 校验整数  
- [x] R2：`vectorLiteral` + `$n::vector`  
- [x] R3：`<=>` + HNSW `vector_cosine_ops`；HNSW fail catch warn  
- [x] R5：baseURL 去尾斜杠；dims 不匹配 throw  
- [x] R6：Manager await Promise.resolve(addRaw)  
- [x] R11：`ready` 仅 initialize 成功后 true；无 URL 则 ready=false  
- [x] 无 `mem0ai`；未改 prompt/worker/index/routes（impl-2）

## 与计划的偏离

1. **真实 embedding spike 未完成** — 环境无 `EMBEDDING_*` / `OPENAI_API_KEY`。PG DDL + 假向量余弦已验证。  
2. **排雷附录 `c88108d`** 在切分支后进入本分支历史（main 上另有 cherry-pick `7125270`）。impl-2 合并前建议 rebase `origin/main` 消重复 docs。  
3. **未单独 commit 文档式「URL 示例」文件** — 写在 compose 文件头注释 + 本 handoff。

## 遗留 / 下一个执行者要注意的点

1. **片段 B 全接线**（计划 Task 2.1–2.5）：  
   - `manager.prefetchForIssue` async + `getStatus().backend`  
   - `buildPrompt` → async；**仅** `run-worker.ts` 一处 `await`（R7）  
   - `index.ts`：`MEMORY_PROVIDER=pgvector` 时 **先 await initialize 再 isAvailable**（R11）；失败回退 `SqliteTextProvider`  
   - `routes/memory`：**禁止**无 `q` 时直读 `memoryItems`；一律 Manager（R8/R9）；POST 依赖 addRaw 返回值（Pg 已返回）  
2. **默认仍 sqlite-text**；未接线前本分支代码对运行中 server **无行为变化**（index 仍硬编码 Sqlite）。  
3. **维度锁死 1536**（默认）；换模型需重建 `memory_vectors`。  
4. monorepo：`cd app/packages/server` 再 `pnpm add`，锁文件在 `app/pnpm-lock.yaml`。  
5. 验收路径 B 需：`docker compose up -d` + `MEMORY_PROVIDER=pgvector` + URL + 真实 embedding key。  
6. `isAvailable()` 要求 **apiKey 非空**；仅有 PG 无 key 会回退（符合 spec）。  
7. 勿 push main；feature 分支已含 1.1–1.5 commits。

## 验收结论（仅计划者填）

- [x] typecheck 通过 — 计划者复核全绿
- [x] docker-compose + pool + embedder + PgvectorProvider 落地
- [x] R1–R6 / R11 代码自审 + 假向量 cosine self-retrieve 证据
- [x] Manager `await Promise.resolve(addRaw)`（R6）
- [x] 边界：未改 prompt/worker/index/routes
- [ ] 真实 EMBEDDING_* spike — 环境无 key，允许；impl-2 路径 B 补
- [ ] 全切片 §11 — 待 impl-2

### 代码审查要点

1. **DDL** `vector(${dims})` 拼字符串；dims 整数校验。
2. **isAvailable** 需 ready + URL + apiKey；无 key 不会半残写入。
3. **HNSW** try/catch warn — 符合 R3。
4. **未接线** index 仍 Sqlite — 预期；impl-2 必须做选择逻辑。

- 结论：**impl-1 验收通过**。可进 impl-2（async prompt + 回退 + API 统一）。
