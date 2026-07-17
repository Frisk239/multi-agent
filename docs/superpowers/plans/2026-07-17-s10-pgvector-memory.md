# S10 PostgreSQL + pgvector 向量记忆 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **本项目工程模式：** AGENTS.md「垂直切片 × 计划者-执行者」。执行者片段 + `app/.progress/` handoff。
> **spec 真源：** [`docs/superpowers/specs/2026-07-17-s10-pgvector-memory-design.md`](../specs/2026-07-17-s10-pgvector-memory-design.md)
> **前置：** S09 已合 main（`memory/`、`routes/memory.ts`、sync `buildPrompt` + `prefetchForIssueSync`）

**Goal:** 双库下可选 `PgvectorProvider`（OpenAI 兼容 embedding + 余弦检索）；`MEMORY_PROVIDER` 切换；PG 不可用回退 sqlite-text；`buildPrompt` async。

**Architecture:** 任务库仍 SQLite；记忆 PG 用 `pg.Pool` + raw SQL（抄 mem0-ts，不整包 mem0）；Manager 选 provider；prompt await prefetch。

**Tech Stack:** `pg` / `@types/pg`；现有 Fastify + MemoryManager；docker `pgvector/pgvector:pg16`。

## Global Constraints

- **分支：** `feat/s10-pgvector-memory`（从 **已合 S09 的 main/origin/main** 切）
- **V2/V9：** 不迁 issues/runs；pgvector 模式 **不双写** `memory_item`
- **V6/V7：** 默认 `sqlite-text`；`pgvector` 失败 → log + SqliteTextProvider
- **V5：** 余弦 `<=>`；默认 dims **1536**
- **V8：** `buildPrompt` → `async`；`run-worker` **唯一** call site 现为同步，改 `await`
- **不**加 `mem0ai` 依赖；**不**做 graphiti/cite UI
- **验证：** typecheck + 手动（有/无 compose 两条路径）；无 vitest
- **Git：** Conventional Commits，绝不 push main

## 文件结构

```
docker-compose.yml                         [新] 项目根
app/packages/server/
  package.json                             [改] pg, @types/pg
  src/
    db/pg-memory.ts                        [新] Pool + query helper
    memory/
      embedder.ts                          [新]
      pgvector-provider.ts                 [新]
      manager.ts                           [改] prefetchForIssue async + getStatus
      sqlite-text-provider.ts              [可微改] 无破坏
    runtime/prompt.ts                      [改] async buildPrompt
    orchestration/run-worker.ts            [改] await buildPrompt
    routes/memory.ts                       [改] list 不直读 SQLite；status 扩展
    index.ts                               [改] provider 选择 + 回退
```

---

# 执行者片段 A（impl-1）：compose + pg 连接 + embedder + PgvectorProvider

> **边界：** infra + provider 可单测/脚本验证。不改 prompt/worker（可暂不接线）。
> **完成后写** `app/.progress/s10-impl-1.md`

### Task 1.1: docker-compose.yml

**Files:** Create `docker-compose.yml` at **repo root** `D:\code\multi-agent\docker-compose.yml`

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
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ma -d ma_memory"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  ma_memory_pg:
```

- [ ] 文档一句：`docker compose up -d`；URL 示例 `postgresql://ma:ma@127.0.0.1:5432/ma_memory`
- [ ] Commit: `chore(s10): docker-compose pgvector for memory DB`

---

### Task 1.2: 依赖 pg

**Files:** Modify `app/packages/server/package.json`

```bash
cd app/packages/server
pnpm add pg
pnpm add -D @types/pg
```

- [ ] Commit: `chore(s10): add pg driver for memory database`

---

### Task 1.3: db/pg-memory.ts

**Files:** Create `app/packages/server/src/db/pg-memory.ts`

```typescript
// S10：记忆专用 PostgreSQL 连接（与 SQLite 任务库分离，spec V2）
import pg from 'pg';

let pool: pg.Pool | null = null;

export function getMemoryDatabaseUrl(): string | undefined {
  const u = process.env.MEMORY_DATABASE_URL;
  return u && u.length > 0 ? u : undefined;
}

export function getMemoryPgPool(): pg.Pool {
  if (pool) return pool;
  const url = getMemoryDatabaseUrl();
  if (!url) throw new Error('MEMORY_DATABASE_URL 未配置');
  pool = new pg.Pool({ connectionString: url, max: 5 });
  return pool;
}

export async function memoryPgQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getMemoryPgPool().query<T>(text, params);
}

export async function closeMemoryPgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
```

- [ ] typecheck + commit: `feat(s10): memory PG pool helper`

---

### Task 1.4: embedder.ts

**Files:** Create `app/packages/server/src/memory/embedder.ts`

```typescript
// S10 OpenAI 兼容 Embedding（spec §5）
export function getEmbeddingConfig(): {
  apiKey: string;
  baseURL: string;
  model: string;
  dims: number;
} {
  const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseURL = (
    process.env.EMBEDDING_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  const dims = Number(process.env.EMBEDDING_DIMS || 1536);
  return { apiKey, baseURL, model, dims };
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { apiKey, baseURL, model, dims } = getEmbeddingConfig();
  if (!apiKey) throw new Error('EMBEDDING_API_KEY / OPENAI_API_KEY 未配置');
  if (texts.length === 0) return [];

  const res = await fetch(`${baseURL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`embedding HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => {
    if (d.embedding.length !== dims) {
      throw new Error(
        `embedding dims ${d.embedding.length} !== EMBEDDING_DIMS ${dims}`,
      );
    }
    return d.embedding;
  });
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

/** pgvector 字面量 */
export function vectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
```

- [ ] typecheck + commit: `feat(s10): OpenAI-compatible embedding client`

---

### Task 1.5: pgvector-provider.ts

**Files:** Create `app/packages/server/src/memory/pgvector-provider.ts`

实现 `MemoryProvider` + duck-type `addRaw`：

```typescript
// S10 PgvectorProvider（spec §6，余弦检索抄 mem0-ts）
import { randomUUID } from 'node:crypto';
import {
  getMemoryDatabaseUrl,
  memoryPgQuery,
  closeMemoryPgPool,
} from '../db/pg-memory.js';
import { embedQuery, embedTexts, getEmbeddingConfig, vectorLiteral } from './embedder.js';
import type {
  MemoryItemView,
  MemoryPrefetchResult,
  MemoryProvider,
  MemorySyncInput,
} from './types.js';

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n);
}

const DDL = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS memory_vectors (
  id UUID PRIMARY KEY,
  text TEXT NOT NULL,
  embedding vector(${/* filled at runtime */} ) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  issue_id TEXT,
  agent_id TEXT,
  run_id TEXT,
  scope TEXT NOT NULL DEFAULT 'workspace',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

// 注意：vector(N) 不能参数化。initialize 时用 dims 拼 SQL（dims 来自 env 整数，防注入只允许 /^\d+$/）。

export class PgvectorProvider implements MemoryProvider {
  readonly name = 'pgvector';
  private ready = false;

  isAvailable(): boolean {
    return (
      this.ready &&
      Boolean(getMemoryDatabaseUrl()) &&
      Boolean(getEmbeddingConfig().apiKey)
    );
  }

  async initialize(): Promise<void> {
    if (!getMemoryDatabaseUrl()) {
      this.ready = false;
      return;
    }
    const { dims } = getEmbeddingConfig();
    if (!Number.isInteger(dims) || dims <= 0) throw new Error('EMBEDDING_DIMS 非法');

    await memoryPgQuery('CREATE EXTENSION IF NOT EXISTS vector');
    await memoryPgQuery(`
CREATE TABLE IF NOT EXISTS memory_vectors (
  id UUID PRIMARY KEY,
  text TEXT NOT NULL,
  embedding vector(${dims}) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  issue_id TEXT,
  agent_id TEXT,
  run_id TEXT,
  scope TEXT NOT NULL DEFAULT 'workspace',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`);
    // HNSW 可能已存在
    try {
      await memoryPgQuery(`
CREATE INDEX IF NOT EXISTS memory_vectors_hnsw
  ON memory_vectors USING hnsw (embedding vector_cosine_ops)`);
    } catch (e) {
      console.warn('[pgvector] HNSW index skip:', e);
    }
    await memoryPgQuery(
      `CREATE INDEX IF NOT EXISTS memory_vectors_issue ON memory_vectors (issue_id)`,
    );
    await memoryPgQuery(
      `CREATE INDEX IF NOT EXISTS memory_vectors_created ON memory_vectors (created_at DESC)`,
    );
    this.ready = true;
  }

  async prefetch(
    query: string,
    opts?: { sessionId?: string; limit?: number },
  ): Promise<MemoryPrefetchResult> {
    if (!this.isAvailable()) return { items: [] };
    const limit = opts?.limit ?? 5;
    const q = query.trim();
    if (!q) {
      const r = await memoryPgQuery<{
        id: string;
        text: string;
        issue_id: string | null;
        run_id: string | null;
        created_at: Date;
      }>(
        `SELECT id, text, issue_id, run_id, created_at
         FROM memory_vectors ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return {
        items: r.rows.map((row) => ({
          id: row.id,
          text: row.text,
          source: 'pgvector',
          issueId: row.issue_id,
          runId: row.run_id,
          createdAt: new Date(row.created_at).toISOString(),
        })),
      };
    }
    const vec = await embedQuery(q);
    const lit = vectorLiteral(vec);
    const r = await memoryPgQuery<{
      id: string;
      text: string;
      issue_id: string | null;
      run_id: string | null;
      created_at: Date;
      score: number;
    }>(
      `SELECT id, text, issue_id, run_id, created_at,
              GREATEST(0, 1 - (embedding <=> $1::vector))::float8 AS score
       FROM memory_vectors
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [lit, limit],
    );
    return {
      items: r.rows.map((row) => ({
        id: row.id,
        text: row.text,
        score: Number(row.score),
        source: 'pgvector',
        issueId: row.issue_id,
        runId: row.run_id,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    };
  }

  async syncTurn(input: MemorySyncInput): Promise<void> {
    const text = truncate(
      `Issue session ${input.sessionId}\nUser:\n${input.userText}\n\nOutcome:\n${input.assistantText}`,
      4000,
    );
    await this.insert(text, {
      issueId: input.issueId,
      agentId: input.agentId ?? null,
      runId: input.runId,
      source: 'run-sync',
    });
  }

  addRaw(
    text: string,
    meta?: {
      issueId?: string | null;
      agentId?: string | null;
      runId?: string | null;
    },
  ): Promise<MemoryItemView> {
    return this.insert(text, {
      issueId: meta?.issueId ?? null,
      agentId: meta?.agentId ?? null,
      runId: meta?.runId ?? null,
      source: 'curated',
    });
  }

  private async insert(
    text: string,
    meta: {
      issueId: string | null;
      agentId: string | null;
      runId: string | null;
      source: string;
    },
  ): Promise<MemoryItemView> {
    if (!this.isAvailable()) throw new Error('pgvector provider 不可用');
    const id = randomUUID();
    const [embedding] = await embedTexts([text]);
    const lit = vectorLiteral(embedding);
    await memoryPgQuery(
      `INSERT INTO memory_vectors
        (id, text, embedding, metadata, issue_id, agent_id, run_id, scope, source)
       VALUES ($1, $2, $3::vector, '{}'::jsonb, $4, $5, $6, 'workspace', $7)`,
      [id, text, lit, meta.issueId, meta.agentId, meta.runId, meta.source],
    );
    return {
      id,
      text,
      source: 'pgvector',
      issueId: meta.issueId,
      runId: meta.runId,
      createdAt: new Date().toISOString(),
    };
  }

  async shutdown(): Promise<void> {
    this.ready = false;
    await closeMemoryPgPool();
  }
}
```

> **实现注意：** `addRaw` 在 S09 Sqlite 上是同步返回 `MemoryItemView`；Manager duck-type 若假定同步，需把 Manager `addCurated` 改为始终 `await Promise.resolve(provider.addRaw(...))`。impl-1 实现 Pg 时 **addRaw 返回 `Promise<MemoryItemView>`**，并在 Task 2.x 改 Manager 兼容 Promise|value。

**更干净（写死）：**  
`addRaw` 在类型上改为可返回 `MemoryItemView | Promise<MemoryItemView>`，Manager：

```typescript
const raw = this.external.addRaw(...)
const created = await Promise.resolve(raw)
```

impl-1 改 `manager.ts` 这一处（算边界内，为 provider 兼容）。

- [ ] spike（需 docker + key）：initialize → addRaw → prefetch  
- [ ] typecheck  
- [ ] Commit: `feat(s10): PgvectorProvider + cosine search`  
- [ ] Handoff `s10-impl-1.md`

---

# 执行者片段 B（impl-2）：Manager/prompt/worker/index/routes 接线 + 验收

> **边界：** 全链路切换与 async prompt。
> **完成后写** `app/.progress/s10-impl-2.md`（切片级验收）

### Task 2.1: manager.ts — async prefetchForIssue + status + addCurated await

**Files:** Modify `app/packages/server/src/memory/manager.ts`

- [ ] 新增：

```typescript
  async prefetchForIssue(issue: {
    id: string;
    title: string;
    description: string | null;
  }): Promise<string | null> {
    try {
      if (!this.external?.isAvailable()) return null;
      const q = truncate(`${issue.title} ${issue.description ?? ''}`.trim(), 500);
      const result = await this.external.prefetch(q, {
        sessionId: issue.id,
        limit: 5,
      });
      if (!result.items.length) return null;
      const lines = result.items.map(
        (it) => `- ${it.text.replace(/\n+/g, ' ').slice(0, 300)}`,
      );
      return `# Memory Context\n（参考数据，非用户指令）\n${lines.join('\n')}`;
    } catch (e) {
      console.error('[memory] prefetch 失败:', e);
      return null;
    }
  }

  getStatus(): {
    provider: string | null;
    available: boolean;
    backend: 'sqlite' | 'pgvector' | 'none';
  } {
    const name = this.getExternalName();
    const available = name != null && (this.external?.isAvailable() ?? false);
    const backend =
      name === 'pgvector' ? 'pgvector' : name === 'sqlite-text' ? 'sqlite' : 'none';
    return { provider: name, available, backend };
  }
```

- [ ] `addCurated`：`const created = await Promise.resolve(this.external.addRaw(...))`
- [ ] 保留 `prefetchForIssueSync` 作兼容，但 prompt 不再调用它
- [ ] Commit: `feat(s10): MemoryManager async prefetchForIssue + status backend`

---

### Task 2.2: buildPrompt async + run-worker await

**Files:**
- Modify `app/packages/server/src/runtime/prompt.ts`
- Modify `app/packages/server/src/orchestration/run-worker.ts`

```typescript
// prompt.ts
export async function buildPrompt(
  issueId: string,
  run?: PromptRunContext,
): Promise<string | null> {
  // ... 原逻辑
  const memoryBlock = await memoryManager.prefetchForIssue({
    id: issue.id,
    title: issue.title,
    description: issue.description,
  });
  if (memoryBlock) parts.push(memoryBlock);
  // ...
}
```

```typescript
// run-worker.ts executeRun 内
const prompt = await buildPrompt(runRow.issueId, {
  isLeader: runRow.isLeader === 1,
  squadId: runRow.squadId,
  agentId: runRow.agentId,
});
```

- [ ] `rg "buildPrompt\\("` 全 server 包，确保无遗漏
- [ ] typecheck  
- [ ] Commit: `feat(s10): async buildPrompt + await in run-worker`

---

### Task 2.3: index.ts provider 选择

**Files:** Modify `app/packages/server/src/index.ts`

替换硬编码 Sqlite：

```typescript
import { PgvectorProvider } from './memory/pgvector-provider.js';
import { SqliteTextProvider } from './memory/sqlite-text-provider.js';

async function initMemoryProvider(): Promise<void> {
  const mode = (process.env.MEMORY_PROVIDER ?? 'sqlite-text').toLowerCase();
  if (mode === 'pgvector') {
    const p = new PgvectorProvider();
    try {
      await p.initialize();
      if (p.isAvailable()) {
        memoryManager.setExternal(p);
        console.log('[memory] provider=pgvector');
        return;
      }
      console.warn('[memory] pgvector unavailable, fallback sqlite-text');
    } catch (e) {
      console.warn('[memory] pgvector init failed, fallback sqlite-text:', e);
    }
  }
  memoryManager.setExternal(new SqliteTextProvider());
  console.log('[memory] provider=sqlite-text');
}

// main 内：
await initMemoryProvider();
await memoryManager.initialize();
```

- [ ] Commit: `feat(s10): MEMORY_PROVIDER selection with sqlite fallback`

---

### Task 2.4: routes/memory.ts 统一 Manager

**Files:** Modify `app/packages/server/src/routes/memory.ts`

- [ ] `GET /status` → `memoryManager.getStatus()`
- [ ] `GET /` 无 `q` 时：`return memoryManager.search('', lim)`  
  （PgvectorProvider.prefetch 空 query = 最近 N 条；Sqlite 已支持）
- [ ] **删除** 直读 `memoryItems` 的分支（或仅当 backend===sqlite 时保留——**优先删除，全走 search**）
- [ ] 确认 SqliteTextProvider.prefetch 空 query 路径：S09 已有「无 token → 最近 N」；空字符串 tokenize 为空 → 走最近 N。**核对 sqlite-text-provider**：`query` 为 `''` 时 tokens 空，应返回最近条。

若 sqlite `search('')` 行为不对，在 SqliteTextProvider.prefetchSync 开头：

```typescript
if (!query.trim()) {
  // 最近 limit 条
}
```

- [ ] Commit: `fix(s10): memory API always via Manager (no raw SQLite list)`

---

### Task 2.5: 端到端验收 + handoff

**路径 A — 无 Docker（默认）**

```bash
cd app && pnpm -r typecheck
# MEMORY_PROVIDER 不设或 sqlite-text
pnpm --filter @ma/server dev
curl http://localhost:3001/api/memory/status
# provider sqlite-text
```

**路径 B — 有 Docker + embedding**

```bash
docker compose up -d
export MEMORY_PROVIDER=pgvector
export MEMORY_DATABASE_URL=postgresql://ma:ma@127.0.0.1:5432/ma_memory
export EMBEDDING_API_KEY=...
export EMBEDDING_BASE_URL=...   # 可选
export EMBEDDING_MODEL=text-embedding-3-small
# 重启 server
curl -X POST .../api/memory -d '{"text":"向量记忆测试 看板 position"}'
curl '.../api/memory?q=看板'
# 有 score 更佳
# 可选：成功 run 后查 PG: SELECT id, left(text,40) FROM memory_vectors;
```

**回退**

```bash
# 错误 URL
export MEMORY_DATABASE_URL=postgresql://nope
# 启动应 warn + sqlite-text，listen 成功
```

写 `app/.progress/s10-impl-2.md`，勾 spec §11，push。

---

## 验收总览（计划者）

| spec | Task |
|---|---|
| compose + pool | 1.1–1.3 |
| embedder + PgvectorProvider | 1.4–1.5 |
| async prompt | 2.1–2.2 |
| env 选择/回退 | 2.3 |
| API 统一 | 2.4 |
| 双路径验收 | 2.5 |

---

## 计划自审

1. Spec V1–V10 全有 Task  
2. `buildPrompt` 仅 run-worker 一处（已核对）  
3. 无 mem0ai；无全库迁 PG  
4. `addRaw` Promise 兼容写明  
5. 空 query list 行为 sqlite/pg 对齐  

---

## 执行者排雷（预调研 · 必读）

> 调研源：mem0-ts `vector_stores/pgvector.ts`、mem0 Python pgvector、WeKnora postgres retriever、本仓 S09 代码、本机 Docker 可用性。  
> **原则：踩过的坑写进 handoff，别让下一个执行者再踩。**

### R1 — `vector(N)` 不能用 `$1` 参数化

- **现象：** `CREATE TABLE ... embedding vector($1)` 会失败或变成错误类型。
- **做法：** `dims = Math.floor(Number(EMBEDDING_DIMS||1536))`，校验 `Number.isInteger(dims) && dims > 0` 后**字符串拼进 DDL**（dims 来自受控 env，不是用户输入）。
- **证据：** mem0-ts `createCol` 用 `` vector(${dims}) ``；Python 用 `sql.Literal(embedding_model_dims)`。

### R2 — 写入向量用字面量字符串 + `::vector` 强转

- **推荐：** 参数传 `'[0.1,0.2,...]'`，SQL 写 `$n::vector`（mem0-ts `insert`：`vector: \`[${vector.join(",")}]\`` + `$2::vector`）。
- **避免：** 直接传 JS `number[]` 当绑定参数（驱动不一定映射为 pgvector）。
- **辅助：** 计划里的 `vectorLiteral(v)` 即此用途。

### R3 — 余弦检索：`ORDER BY embedding <=> $q` 必须与 HNSW ops 一致

- **距离：** `<=>` = cosine distance；score 可用 `GREATEST(0, 1 - (embedding <=> $q))`（mem0 常见映射）。
- **索引：** `USING hnsw (embedding vector_cosine_ops)`；若用 L2 会与 cosine ops 不匹配。
- **HNSW 创建失败：** 数据过少/扩展版本时可能失败——**catch + warn 继续**（mem0 同样 try/catch warn）。无索引时顺序扫仍可验收。

### R4 — `CREATE EXTENSION vector` 需要权限

- compose 默认超级用户 `ma` 一般 OK。
- 若接外部托管 PG 且无建扩展权限 → `initialize` 失败 → **回退 sqlite-text**（不要硬崩 listen）。

### R5 — Embedding API 兼容性坑

| 坑 | 处理 |
|---|---|
| baseURL 尾斜杠 | `replace(/\/$/, '')` 再拼 `/embeddings` |
| 部分国产只实现 chat 不实现 embeddings | 启动后 spike 一条 embed；失败明确 log |
| 返回 dims ≠ `EMBEDDING_DIMS` | **throw**，避免写入错误维向量（计划 embedder 已要求校验） |
| `text-embedding-3-*` 支持 `dimensions` 缩维 | MVP 可不传；若传必须与表 `vector(N)` 一致 |
| 空字符串 embed | 上层 truncate/拒空；勿把空串批量送给 API |

- **实现选择：** 原生 `fetch`（计划）即可，**不必**装 `openai` SDK；mem0-ts 用 SDK 是为了省事，我们为少依赖可 fetch。
- **鉴权：** `Authorization: Bearer <key>`；key 优先 `EMBEDDING_API_KEY`，回退 `OPENAI_API_KEY`。

### R6 — `addRaw` 同步 vs Promise（会炸 Manager）

- **现状：** S09 `SqliteTextProvider.addRaw` **同步**返回 `MemoryItemView`；`manager.addCurated` **直接 return this.external.addRaw(...)**（未 `await`）。
- **S10：** `PgvectorProvider.addRaw` 必须 **async**（要 embed + INSERT）。
- **必改（impl-1 或 impl-2 最早做）：**

```typescript
const created = await Promise.resolve(
  this.external.addRaw(text, { issueId: issueId ?? null, agentId: null, runId: null }),
);
return created;
```

- 类型上 duck-type 返回 `MemoryItemView | Promise<MemoryItemView>`。

### R7 — `buildPrompt` async 改动面极小但必全

- **全仓 call site（已 rg）：** 仅  
  - 定义：`runtime/prompt.ts:28`  
  - 调用：`run-worker.ts:83`  
- 改签名后 **worker 必须 `await buildPrompt`**，否则 prompt 变成 Promise 对象喂给 CLI。
- 无其它包引用（web 不调 buildPrompt）。

### R8 — `GET /api/memory` 无 `q` 时直读 SQLite（S09 债）

- **现状：** `routes/memory.ts` 无 query 时 `db.select().from(memoryItems)`——**pgvector 模式下会读错库/空表**。
- **S10 必须：** 一律 `memoryManager.search(q || '', lim)`。
- **sqlite 空串：** `tokenize('')` → 无 token → 已有「最近 N 条」分支（`sqlite-text-provider` tokens.length===0）。OK。
- **pg 空串：** Provider.prefetch 对 trim 空 query 走 `ORDER BY created_at DESC`（计划已写）。

### R9 — POST 201 fallback 仍读 SQLite

- **现状：** `addCurated` 无返回值时 fallback `memoryItems` 最新行。
- **pgvector：** 必须让 `addRaw` **始终返回** `MemoryItemView`（含 id/text），避免 fallback 读错库。

### R10 — Docker / 连接串

- **本机已有：** Docker 29.x + Compose v5（预调研环境）。
- **URL 示例：** `postgresql://ma:ma@127.0.0.1:5432/ma_memory`（compose 用户/库与文档一致）。
- **Windows：** 若 5432 被占用，改 compose 端口映射并同步 URL。
- **健康检查：** 等 `pg_isready` 再跑 initialize spike，避免 race。

### R11 — `isAvailable()` 时序

- `initialize()` 成功前 `ready=false` → `isAvailable()===false`。
- index 逻辑必须：**先 await initialize()，再 isAvailable()**；不要颠倒。
- embed key 缺失：pgvector `isAvailable()` 应为 false → 回退 sqlite（避免写入路径半残）。

### R12 — 安全与运维

- **勿**把 `MEMORY_DATABASE_URL` / embedding key 写进 git；只用 env。
- DDL 中 dims 只允许数字；表名/列名用固定常量，勿拼用户字符串。
- Pool `max: 5` 够本地；`shutdown`/`closeMemoryPgPool` 可选，server 长驻可不关。

### R13 — 建议 spike 顺序（impl-1）

```
1. docker compose up -d
2. pnpm add pg
3. 裸 pg 客户端 SELECT 1
4. CREATE EXTENSION vector
5. embedder 单条文本 → 打印 dims
6. INSERT ... $n::vector → SELECT <=> 自检索应 top1 自己
```

任一步失败在 handoff 写清环境，勿 silently skip 却报完成。

### R14 — 明确不碰

- 不引入 `mem0ai` 包、不迁 issues 到 PG、不双写 `memory_item`、不建 graphiti。

---

## 执行者启动提示词

### impl-1

```
你是 S10 执行者 impl-1。

必读：
1. AGENTS.md
2. docs/superpowers/specs/2026-07-17-s10-pgvector-memory-design.md
3. docs/superpowers/plans/2026-07-17-s10-pgvector-memory.md
   —— 片段 A + **「执行者排雷 R1–R14」**（必读）

分支 feat/s10-pgvector-memory 从 origin/main（已合 S09）切。

完成：docker-compose、pg 依赖、pg-memory pool、embedder、PgvectorProvider；
Manager addCurated 必须 await Promise.resolve(addRaw)（排雷 R6）。
按 R13 spike；handoff 记录 docker/embed/dims 是否跑通。
可不改 prompt/worker。写 s10-impl-1.md 并 push。绝不 push main。
```

### impl-2

```
你是 S10 执行者 impl-2。

必读：计划片段 B + 排雷 R7–R9 + app/.progress/s10-impl-1.md。

接线：prefetchForIssue async、buildPrompt async、run-worker 唯一 await、
index MEMORY_PROVIDER 回退（R11 时序）、memory routes 禁止直读 SQLite（R8/R9）。
验收：无 PG 默认 sqlite；有 PG+embed 写向量+检索；错误 URL 回退不崩。
写 s10-impl-2.md 并 push。
```
