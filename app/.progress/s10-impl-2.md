# Handoff: s10-impl-2

> 切片：`S10` · 角色：`impl` · 序号：`2`（片段 B：接线 + 验收 · 本切片最后一棒）
> 日期：2026-07-17
> 分支：`feat/s10-pgvector-memory`
> **基线：** impl-1 已验收（`a517a47`）：compose / pool / embedder / PgvectorProvider + Manager `addCurated` await

## 上下文

S10 = Phase 3 第二刀：PostgreSQL + pgvector 向量记忆 + `buildPrompt` async。

- spec：[`docs/superpowers/specs/2026-07-17-s10-pgvector-memory-design.md`](../../docs/superpowers/specs/2026-07-17-s10-pgvector-memory-design.md) §7–§11
- 计划：[`docs/superpowers/plans/2026-07-17-s10-pgvector-memory.md`](../../docs/superpowers/plans/2026-07-17-s10-pgvector-memory.md) 片段 B + 排雷 R7–R11
- 上棒：[`app/.progress/s10-impl-1.md`](./s10-impl-1.md)

## 本会话完成了什么

| Task | 内容 | Commit |
|---|---|---|
| 2.1 | `prefetchForIssue` async；`getStatus().backend`；`addCurated` 已 await（impl-1，核对保留） | `e9a47a3` |
| 2.2 | `buildPrompt` → async；`run-worker` 唯一 call site `await`（R7） | `5ef80d0` |
| 2.3 | `index.ts`：`MEMORY_PROVIDER` 选择；**先 await initialize 再 isAvailable**（R11）；失败回退 Sqlite | `1acfa1f` |
| 2.4 | `routes/memory`：status=`getStatus`；list **一律** `Manager.search`；删除直读 `memoryItems`（R8/R9） | `77b4d89` |
| 2.5 | 双路径验收 + 本 handoff | （本 commit） |

### 关键代码行为

1. **Manager**
   - 主路径：`async prefetchForIssue` → `await provider.prefetch`
   - 兼容：`prefetchForIssueSync` 仍保留，prompt **不再**调用
   - `getStatus()` → `{ provider, available, backend: 'sqlite'|'pgvector'|'none' }`
2. **prompt / worker**
   - `export async function buildPrompt(...): Promise<string | null>`
   - `const prompt = await buildPrompt(...)`（全仓仅此一处调用）
3. **启动**
   - `MEMORY_PROVIDER=pgvector` → `new PgvectorProvider()` → `await initialize()` → `isAvailable()` 才 `setExternal`
   - 否则 / 失败 → `SqliteTextProvider` + warn，listen 不崩
4. **API**
   - `GET /api/memory/status` → `getStatus()`（含 `backend`）
   - `GET /api/memory` 无 `q` 也走 `search('')`（sqlite token 空→最近 N；pg→`ORDER BY created_at`）
   - POST 依赖 `addRaw` 返回值；无返回时只 `{ ok: true }`，**不再** fallback 读 SQLite

## 自测结果

### typecheck（全绿）

```
$ cd app && pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/web typecheck: Done
packages/server typecheck: Done
```

### 路径 A — 默认 sqlite-text（PORT=3011）

| 检查 | 结果 |
|---|---|
| 启动 log | `[memory] provider=sqlite-text` + listen OK |
| `GET /status` | `{"provider":"sqlite-text","available":true,"backend":"sqlite"}` |
| POST curated | 201 + id/text |
| `GET ?q=看板` | 命中刚写入条（sqlite-text source） |
| 空 q list | 走 Manager，返回最近条 |

### 回退 — 错误 URL（PORT=3012）

```
MEMORY_PROVIDER=pgvector
MEMORY_DATABASE_URL=postgresql://nope:nope@127.0.0.1:5999/nope
EMBEDDING_API_KEY=dummy
```

- log：`[memory] pgvector init failed, fallback sqlite-text: Error: connect ECONNREFUSED ...`
- 随后 `[memory] provider=sqlite-text` + listen 成功
- status：`backend=sqlite`

### 路径 B — compose + pgvector（部分；无真实 embedding key）

环境：`docker compose` → `memory-db` **healthy**；`MEMORY_DATABASE_URL=postgresql://ma:ma@127.0.0.1:5432/ma_memory`

| 检查 | 结果 |
|---|---|
| 有 dummy `EMBEDDING_API_KEY` | log `provider=pgvector`；status `backend=pgvector, available=true` |
| 空 q list | `[]`（表空，无 embed） |
| `memory_vectors` DDL | 表存在；`embedding vector(1536)`；HNSW `vector_cosine_ops` + issue/created 索引 |
| POST curated（假 key） | 500 `fetch failed`（预期：假 key 无法 embed；**不崩 server**） |
| **无 key** + 好 URL | log `pgvector unavailable, fallback sqlite-text`；status sqlite |

**未跑（环境无 `EMBEDDING_*` / `OPENAI_API_KEY`）：** 真实 `addRaw`→余弦 `?q=` 与 run completed 写向量。代码路径 + 假向量 cosine 已在 impl-1 spike；有 key 时：

```bash
export MEMORY_PROVIDER=pgvector
export MEMORY_DATABASE_URL=postgresql://ma:ma@127.0.0.1:5432/ma_memory
export EMBEDDING_API_KEY=...
# optional: EMBEDDING_BASE_URL / EMBEDDING_MODEL
# POST /api/memory → GET /api/memory?q=... 应有 score
```

## 与计划的偏离

1. **真实 embedding 端到端未完成** — 与 impl-1 相同环境限制；DDL + 启动选择/回退/空 list 已验。
2. **POST 无 `created` 时去掉 SQLite fallback** — 计划「优先删除直读」；返回 `{ ok: true }` 而非读错库（R9）。
3. **Git Bash curl** 对 JSON body 有 Content-Length 问题；验收改用 Node `fetch`。

## 验收清单（spec §11）

### 11.1 工程
- [x] `pnpm -r typecheck` 全绿
- [x] 无 compose 时默认 sqlite-text 可开发
- [x] `docker compose up -d` 可起 pgvector（healthy）

### 11.2 pgvector 模式
- [x] 配置齐全（URL + key 非空）时 `status.available=true` + `backend=pgvector`
- [ ] run completed / POST → `memory_vectors` 有行且维数正确 — **需真实 EMBEDDING key**（表结构已 1536）
- [ ] prefetch 带 score；prompt 含 `# Memory Context` — **需真实 key**；async 路径代码已接
- [x] `buildPrompt` async + worker `await`（R7 rg 仅一处）

### 11.3 回退
- [x] 错误 URL → warn + sqlite-text + listen 成功
- [x] embed 失败 POST → 500 JSON，server 继续；sync/prefetch 外层仍 catch（S09 Manager）

### 11.4 回归
- [x] status 多 `backend` 字段，旧字段保留
- [x] list 不再直读 SQLite（pg 模式安全）
- [x] Issue/看板仍走 SQLite（未改任务库）

### 11.5 非目标
- 未做 graphiti / cite UI / 全库 PG / mem0ai / 自动迁移

## 遗留 / 给计划者

1. 有 embedding key 时补路径 B 全链路（POST + `?q=` score + 可选 run completed）。
2. 合并前可考虑 rebase `origin/main`（impl-1 注 docs 重复 commit 可能）。
3. 切片可开 PR：`feat/s10-pgvector-memory` → main。
4. 勿 push main。

## 验收结论（仅计划者填）

- [x] 片段 B 代码审查 — typecheck 全绿；async prompt/worker；index 回退；API 无直读 SQLite
- [x] §11 工程/回退/回归达标；pgvector 真 embed 端到端标「需 key」（同 S09 LLM 政策，不阻塞合并）
- [ ] 开 PR / 合并（人）

### 代码审查要点

1. `export async function buildPrompt` + worker `await`；全仓仅一处。
2. `initMemoryProvider` 先 initialize 再 isAvailable；失败 sqlite。
3. `GET /api/memory` 一律 `search`；status 含 backend。
4. 真实 embed 未测不挡：假 key 500 不崩、DDL 1536、dummy key 可选 provider=pgvector 已证。

### S10 切片总结（impl-1~2）

| impl | 内容 | 结论 |
|---|---|---|
| 1 | compose/pg/embedder/PgvectorProvider | 通过 |
| 2 | async prompt + 选择回退 + API | 通过 |

**Phase 3 第二刀代码层达标，可开 PR 合并。** 建议有 key 时补路径 B 冒烟。

- 结论：**达标可合并**
