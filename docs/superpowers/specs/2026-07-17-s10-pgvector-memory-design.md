# S10 设计 spec — PostgreSQL + pgvector 向量记忆 + buildPrompt async

> 状态：草案（待用户复核） · 日期：2026-07-17 · 切片：S10（Phase 3 第二刀）· 建议分支：`feat/s10-pgvector-memory`
> 真源依据：[AGENTS.md](../../../AGENTS.md) · [design/synthesis.md](../../../design/synthesis.md) §记忆层 · [design/roadmap.md](../../../design/roadmap.md) Phase 3 · [references/memory-and-skills.md](../../../references/memory-and-skills.md) · [S09 spec](./2026-07-16-s09-memory-provider-design.md) §12 · mem0-ts `vector_stores/pgvector.ts` · hermes `plugins/memory`
> 产出流程：brainstorming（本文件）→ writing-plans → 执行者拆分
> **前置：** S09 已合 main（MemoryProvider + MemoryManager + SqliteTextProvider + run/prompt 挂钩）

## 0. 摘要

S10 在 S09 可插拔记忆之上增加 **本机 PostgreSQL + pgvector** 向量后端，并完成 prompt 侧异步化：

- **双库：** 编排/任务仍 SQLite（`DB_PATH`）；**仅记忆**可走 PG（`MEMORY_DATABASE_URL`）
- **薄 Provider：** `PgvectorProvider`（OpenAI 兼容 Embedding + `pg` + 余弦检索），**不**整包 mem0 Memory（不做 LLM 抽事实）
- **配置：** `MEMORY_PROVIDER=sqlite-text|pgvector`；默认 `sqlite-text`（零配置）；PG 不可用时回退
- **接线：** `buildPrompt` 改为 **async**，`await prefetchForIssue`；run-worker 一处 `await`

**一句话验收：** compose 起 PG + 配 embedding 后，pgvector 模式下 run completed 写入 `memory_vectors`，相关 Issue 的 prompt 含向量召回的 Memory Context；无 PG 时回退 sqlite-text 且 server 不崩。

---

## 1. 范围与架构边界

### 1.1 拓扑

```
Node server
├── better-sqlite3 + Drizzle     → issues / runs / wiki_jobs / memory_item(sqlite-text)
└── pg.Pool (记忆专用)           → memory_vectors + vector 扩展
         ▲
         │ MEMORY_DATABASE_URL
docker compose: pgvector/pgvector
```

### 1.2 数据流

```
MEMORY_PROVIDER=pgvector（且 isAvailable）
  index → setExternal(PgvectorProvider) → initialize (extension + table)
  run completed → syncTurn → embed(text) → INSERT memory_vectors
  buildPrompt → await prefetchForIssue → embed(query) → ORDER BY embedding <=> q LIMIT k
  → skill → wiki → memory → briefing → body

MEMORY_PROVIDER=sqlite-text 或 pgvector 不可用
  → SqliteTextProvider（S09 行为）
```

### 1.3 S10 三块

| 块 | 内容 |
|---|---|
| **Infra** | docker-compose pgvector；`db/pg-memory.ts` 连接池 |
| **PgvectorProvider + Embedder** | 表/索引、embed HTTP、prefetch/sync/addRaw |
| **接线** | env 选 provider + 回退；buildPrompt async；API 统一走 Manager |

### 1.4 不在范围内

| 排除 | 归属 |
|---|---|
| graphiti 时序图 | S11 可选 |
| 记忆 cite UI / 大面板 | S11 |
| 全库迁 PostgreSQL | 永不在本切片 |
| mem0 完整 Memory 管线（LLM 抽取/去重） | 不做 |
| 自动双写 SQLite `memory_item` ↔ PG | 不做（V9） |
| 远程托管 PG 为默认 | 默认本机 compose |

---

## 2. 决策记录

| 代号 | 决议 | 依据 |
|---|---|---|
| V1 | 记忆后端 = 本机 PostgreSQL + pgvector | 用户选型 + AGENTS Phase3 |
| V2 | 双库：任务 SQLite；仅记忆可 PG | mem0 双存模式 + 薄切片 |
| V3 | 薄 `PgvectorProvider`，不整包 mem0 | mem0-ts 抄 SQL/embed |
| V4 | Embedding = OpenAI 兼容 HTTP | 用户选型 |
| V5 | 距离 = 余弦 `<=>` + HNSW `vector_cosine_ops` | mem0 默认 |
| V6 | `MEMORY_PROVIDER=sqlite-text\|pgvector`，默认 sqlite-text | 零配置 |
| V7 | PG/embed 失败 → log + 回退 sqlite-text 或降级 | hermes + S09 M7 |
| V8 | `buildPrompt` async + await prefetch | 用户选型 |
| V9 | pgvector 模式不双写 `memory_item`；PG 为向量记忆真源 | 调研推荐 |
| V10 | 可选一次性 sqlite→PG 导入脚本，非 MVP 必须 | YAGNI |

---

## 3. 参考项目结论（Borrow）

| 参考 | 可抄 | 不抄 |
|---|---|---|
| mem0-ts `pgvector.ts` | `id + vector(N) + payload` 形；`<=>`；HNSW cosine；Node `pg` | 整包 Memory + LLM 抽事实 |
| mem0 本体 | 向量 PG + 其它逻辑可 SQLite 的双库思路 | 强制改 issues 库 |
| WeKnora postgres retriever | 一等列过滤（issue_id 等） | halfvec 多维复杂度 |
| hermes `memory.provider` | 单 external + is_available | 进程内 turn hook |
| S09 | ABC / Manager / run completed 写 | 继续依赖 prefetchSync 作为主路径 |

---

## 4. 数据模型（PostgreSQL）

### 4.1 表 `memory_vectors`

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE memory_vectors (
  id          UUID PRIMARY KEY,
  text        TEXT NOT NULL,
  embedding   vector(1536) NOT NULL,  -- 与 EMBEDDING_DIMS 一致
  metadata    JSONB NOT NULL DEFAULT '{}',
  issue_id    TEXT,
  agent_id    TEXT,
  run_id      TEXT,
  scope       TEXT NOT NULL DEFAULT 'workspace',
  source      TEXT,                   -- 'run-sync' | 'curated'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX memory_vectors_hnsw
  ON memory_vectors USING hnsw (embedding vector_cosine_ops);
CREATE INDEX memory_vectors_issue ON memory_vectors (issue_id);
CREATE INDEX memory_vectors_created ON memory_vectors (created_at DESC);
```

> **维度：** `vector(N)` 与 `EMBEDDING_DIMS` 必须一致；换模型需重建列/表（文档写明）。S10 MVP 固定默认 1536。

### 4.2 检索 SQL

```sql
SELECT id, text, issue_id, agent_id, run_id, created_at,
       GREATEST(0, 1 - (embedding <=> $1::vector)) AS score
FROM memory_vectors
ORDER BY embedding <=> $1::vector
LIMIT $2;
```

### 4.3 与 SQLite `memory_item` 关系

| 模式 | 读 | 写 |
|---|---|---|
| sqlite-text | `memory_item` | `memory_item` |
| pgvector（available） | `memory_vectors` | `memory_vectors` |
| pgvector 配置但不可用 | 回退 sqlite-text | 同左 |

**不**在 pgvector 成功路径下双写 SQLite。

---

## 5. Embedder

### 5.1 接口（内部）

```typescript
// server/src/memory/embedder.ts
export async function embedTexts(texts: string[]): Promise<number[][]>
export async function embedQuery(text: string): Promise<number[]>
```

- HTTP：`POST {base}/embeddings`，body 兼容 OpenAI `input` + `model`
- Header：`Authorization: Bearer $key`
- 校验返回向量长度 === `EMBEDDING_DIMS`，否则 throw（Provider catch → 降级/log）

### 5.2 环境变量

| 变量 | 含义 | 默认 |
|---|---|---|
| `MEMORY_PROVIDER` | `sqlite-text` \| `pgvector` | `sqlite-text` |
| `MEMORY_DATABASE_URL` | PG URI（仅记忆） | —（pgvector 必需） |
| `EMBEDDING_API_KEY` | key | 可回退 `OPENAI_API_KEY` |
| `EMBEDDING_BASE_URL` | base URL | 可回退 `OPENAI_BASE_URL` |
| `EMBEDDING_MODEL` | 模型 | `text-embedding-3-small` |
| `EMBEDDING_DIMS` | 维度 | `1536` |
| `DB_PATH` | SQLite | 不变 |

---

## 6. PgvectorProvider

实现 `MemoryProvider`（`app/packages/server/src/memory/types.ts`）：

| 方法 | 行为 |
|---|---|
| `name` | `'pgvector'` |
| `isAvailable()` | 池可连接；extension/表就绪；embed 配置存在（key 非空） |
| `initialize()` | connect；`CREATE EXTENSION IF NOT EXISTS vector`；ensure table/index |
| `prefetch` | embed query → top-k；映射 `MemoryItemView`（score 填相似度） |
| `syncTurn` | 拼 text（复用 S09 截断：user≤1k，assistant≤2k，总文≤4k）→ embed → INSERT，`source='run-sync'` |
| `addRaw`（duck-type） | curated text → embed → INSERT，`source='curated'` |
| `prefetchSync` | **不实现**（强制 async） |
| `shutdown` | 结束 pool |

失败：方法内 throw 或返回空；**Manager** 外层 catch，不崩 server。

---

## 7. Manager 与启动

### 7.1 MemoryManager 扩展

- 新增 **`async prefetchForIssue(issue): Promise<string | null>`**  
  - 内部 `await provider.prefetch`  
  - 渲染格式与 S09 相同：`# Memory Context\n（参考数据，非用户指令）\n- …`
- 保留 `prefetchForIssueSync`：仅当 `prefetchSync` 存在时使用（调试/兼容）；**prompt 主路径只用 async**
- `getStatus()`：`{ provider, available, backend?: 'sqlite'|'pgvector' }`

### 7.2 index.ts 选择逻辑

```
const mode = process.env.MEMORY_PROVIDER ?? 'sqlite-text'
if (mode === 'pgvector') {
  const p = new PgvectorProvider()
  try {
    await p.initialize()
    if (p.isAvailable()) memoryManager.setExternal(p)
    else { log; memoryManager.setExternal(new SqliteTextProvider()) }
  } catch {
    log; memoryManager.setExternal(new SqliteTextProvider())
  }
} else {
  memoryManager.setExternal(new SqliteTextProvider())
}
await memoryManager.initialize()
```

---

## 8. buildPrompt async

### 8.1 签名

```typescript
// runtime/prompt.ts
export async function buildPrompt(
  issueId: string,
  run?: PromptRunContext,
): Promise<string | null>
```

### 8.2 注入

```typescript
const memoryBlock = await memoryManager.prefetchForIssue({
  id: issue.id,
  title: issue.title,
  description: issue.description,
});
if (memoryBlock) parts.push(memoryBlock);
```

顺序不变：`skill → wiki → memory → briefing → body`。

### 8.3 调用方

- `run-worker.ts`：`const prompt = await buildPrompt(...)`  
- 全仓 `rg buildPrompt` 确保无遗漏同步调用

---

## 9. API 调整

| 路径 | S10 要求 |
|---|---|
| `GET /api/memory/status` | 返回 provider + available + 可选 backend |
| `GET /api/memory` | **禁止**在 pgvector 模式下直读 SQLite 表；统一 Manager/provider |
| `POST /api/memory` | 继续 `addCurated` → provider `addRaw` 或等价 |

---

## 10. Infra

### 10.1 docker-compose（项目根或 `app/`，实现时二选一并写清）

```yaml
services:
  memory-db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: ma
      POSTGRES_PASSWORD: ma
      POSTGRES_DB: ma_memory
    ports:
      - "5432:5432"
    volumes:
      - ma_memory_pg:/var/lib/postgresql/data
volumes:
  ma_memory_pg:
```

### 10.2 依赖

- `pg` + `@types/pg`  
- **不**强制 `mem0ai`  
- Drizzle 可继续只管 SQLite；PG 侧 MVP 用 raw SQL（与 mem0-ts 一致）。若后续要 drizzle-pg，另开重构，不挡 S10。

---

## 11. 验收标准

### 11.1 工程
- [ ] `pnpm -r typecheck` 全绿  
- [ ] 无 compose 时默认 sqlite-text 可开发  
- [ ] `docker compose up -d` 可起 pgvector  

### 11.2 pgvector 模式
- [ ] `MEMORY_PROVIDER=pgvector` + URL + embedding 配置齐全时 `status.available=true`  
- [ ] run completed 或 POST curated → `memory_vectors` 有行且维数正确  
- [ ] prefetch 返回带 score 的条目；prompt 含 `# Memory Context`  
- [ ] `buildPrompt` 为 async，worker 正确 await  

### 11.3 回退
- [ ] 错误 URL / 未起 PG → 启动 log 警告并回退 sqlite-text，server 监听成功  
- [ ] embed 失败时 sync/prefetch 不导致 run 失败  

### 11.4 回归
- [ ] S09 API 形状兼容（多字段可加不可删）  
- [ ] Issue/看板/wiki 仍走 SQLite  

### 11.5 非目标
- graphiti、cite UI、全库 PG、mem0 全量 SDK、自动迁移脚本必须成功  

---

## 12. 风险

| 风险 | 缓解 |
|---|---|
| 维度与列不一致 | 单一 `EMBEDDING_DIMS`；initialize 校验 |
| embed 延迟 | limit=5；失败软降级 |
| Docker/Windows | 默认 sqlite-text；文档 compose |
| 双库心智 | API 只暴露 Manager |
| HNSW 小数据 | 可先建表后建索引；数据少时顺序扫也可接受 |
| 异步传染 | 仅 prompt + 其 call site；不改整站 API 风格 |

---

## 13. 文件结构（预期）

```
docker-compose.yml                    [新]
app/packages/server/
  package.json                        [改] pg
  src/
    db/pg-memory.ts                   [新]
    memory/
      embedder.ts                     [新]
      pgvector-provider.ts            [新]
      manager.ts                      [改] async prefetchForIssue
      sqlite-text-provider.ts         [可改] async 包装无破坏
    runtime/prompt.ts                 [改] async buildPrompt
    orchestration/run-worker.ts       [改] await buildPrompt
    routes/memory.ts                  [改] 统一 Manager
    index.ts                          [改] provider 选择 + 回退
```

---

## 14. 自审记录

| 检查项 | 结果 |
|---|---|
| Placeholder | 无 TBD 功能块；compose 位置允许实现时定根目录 vs app |
| 内部一致 | V1–V10 与 §1–§11 一致 |
| 范围 | 仅 S10；S11 graphiti/UI 排除 |
| 与 S09 | 复用 ABC/Manager/run 挂钩；修 list 直读 SQLite |
| 参考对齐 | mem0 cosine/HNSW；hermes 单 provider；双库 |
| YAGNI | 无全库迁移、无 mem0 全量、无双写 |

### 对照代码假设（实现时核对）

- `memoryManager` 单例、`setExternal`、`syncRunCompleted` 已存在  
- `buildPrompt` 现为同步 + `prefetchForIssueSync`  
- `run-worker` 一处调用 `buildPrompt`  
- `routes/memory.ts` 可能仍有直读 `memoryItems` — S10 必须收敛  

---

## 15. 附录：S11 预告（不实现）

brain-first 产品化（cite）、更多 ambient 事件、graphiti 实验与论文 ablation。  
