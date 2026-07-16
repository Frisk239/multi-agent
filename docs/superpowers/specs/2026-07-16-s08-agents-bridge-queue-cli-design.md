# S08 设计 spec — AGENTS.md 桥梁 + ingest 队列/DLQ + CLI 契约

> 状态：草案（待用户复核） · 日期：2026-07-16 · 切片：S08（Phase 2 收尾）· 建议分支：`feat/s08-bridge-queue-cli`
> 真源依据：[AGENTS.md](../../../AGENTS.md) 架构决策 #5 · [design/synthesis.md](../../../design/synthesis.md) §产品化模块边界 · [concepts/llm-wiki-pattern.md](../../../concepts/llm-wiki-pattern.md) Schema 层 · [S06/S07 §1.3 排除项](./2026-07-15-s06-wiki-design.md) · multica `runtime_config.go` · WeKnora Lite queue + CLI envelope
> 产出流程：brainstorming（本文件）→ writing-plans → 执行者拆分

## 0. 摘要

S08 是 Phase 2（Wiki 知识层）的收尾切片。在 S06（存储/ingest/浏览器）与 S07（query/health/lint）之上，完成三条产品化边界：

1. **AGENTS.md 桥梁** — Wiki ingest 成功后幂等更新 workspace `AGENTS.md` 的 managed 块；`buildPrompt` 注入，让 agent 执行时感知项目 Wiki。
2. **ingest 队列 + DLQ** — 替换 S06 的 `void ingestIssue().catch(log)`：SQLite job 表 + worker tick claim + 失败重试，超限进 dead。
3. **CLI Agent-first 契约** — `ma wiki …` 子命令输出 JSON Envelope / ErrorEnvelope + 文档化 exit code（不做 NDJSON）。

**一句话验收：** Issue→done 入队重试可靠；成功后 AGENTS.md 出现 wiki 快照且 prompt 注入；`ma wiki health --format json` 输出标准 envelope。

---

## 1. 范围与架构边界

### 1.1 数据流

```
Issue status → done（PUT /api/issues/:id）
  → enqueueWikiIngest(issueId)          # INSERT wiki_ingest_job pending + wake
  → WikiIngestWorker.tick()
  → claim job（条件 UPDATE pending→running）
  → ingestIssue(issueId)
       ├─ 成功 → write wiki 页/index/log → updateAgentsMdBridge() → job=completed
       └─ 失败 → failCount++ → < maxRetries 则 pending 重试；否则 dead + lastError

buildPrompt(issueId, run)
  → skillBlock + wikiBridgeBlock(AGENTS.md managed) + briefing? + issueBody

CLI:
  ma wiki health|lint|query|pages|jobs|ingest …
    → stdout Envelope | stderr ErrorEnvelope + exit code
```

### 1.2 S08 三块

| 块 | 内容 |
|---|---|
| **AGENTS.md 桥梁** | marker-pair managed 块；ingest 成功后更新；buildPrompt 注入 |
| **ingest 队列 + DLQ** | `wiki_ingest_job` 表 + worker + retry/dead + 管理 API |
| **CLI 契约** | Envelope/ErrorEnvelope + exit code + `--format text\|json` |

### 1.3 不在范围内

| 排除 | 归属 |
|---|---|
| heal 自动修复缺失页 | 后续 |
| graph.json 图感知检查 | 后续 |
| NDJSON 流式 CLI | 不做（短请求足够） |
| Wiki 层级 + 知识图 | 不做 |
| Redis / 外部队列 | 永不做（纯本地） |
| 改上游 CLI 原生 AGENTS 加载逻辑 | 不做（平台侧 buildPrompt 注入兜底） |

---

## 2. 决策记录

| 代号 | 决议 | 依据 |
|---|---|---|
| B1 | 三块：桥梁 + 队列/DLQ + CLI envelope | S06/S07 排除项 + 用户选型 |
| B2 | AGENTS.md = multica 式 marker-pair 幂等块 | multica `runtime_config.go` |
| B3 | SQLite job 表 + 内存 tick 轮询 | WeKnora Lite；无 Redis |
| B4 | CLI = JSON Envelope + exit code（无 NDJSON） | WeKnora CLI 裁剪 |
| B5 | managed 块 = wiki 页清单摘要 + 最近 ingest | 架构决策 #5 + concepts schema |
| B6 | runtime 加载 = `buildPrompt` 注入（与 skill 同层） | S05 prompt 拼接模式 |
| B7 | 默认 maxRetries=3，超限 status=dead | WeKnora 重试哲学简化 |
| B8 | DLQ = 同表 status=dead，不另建 dead 表 | YAGNI |
| B9 | Issue done 只入队，不再 fire-and-forget 直调 ingest | 替换 S06 W7/W8 行为 |
| B10 | CLI 与 HTTP 共用 wiki 函数，不复制业务逻辑 | DRY |

---

## 3. AGENTS.md 桥梁

### 3.1 路径与 marker

- 路径：`resolve(MA_WORKSPACE_CWD ?? process.cwd(), 'AGENTS.md')`
- Marker（固定字符串，不可本地化）：

```
<!-- BEGIN MA-WIKI (auto-managed; do not edit) -->
…body…
<!-- END MA-WIKI -->
```

### 3.2 managed 块内容（B5）

```markdown
## Project Wiki Snapshot
- Last updated: <ISO date>
- Pages: <N>

### Pages
- [title](wiki/<slug>.md) — <identifier or query>

### Recent ingests
- <last ≤5 log lines from log.md, grep-friendly>
```

不写 wiki 正文；只写索引级摘要。

### 3.3 写文件算法（学 multica）

`writeManagedBlock(path, begin, end, body)`：

1. **文件不存在** → 创建 `begin + body + end`
2. **存在且无 begin** → 追加 `\n\n` + begin + body + end
3. **存在且有 begin/end** → 替换 begin…end 之间内容（含 marker），其余用户内容字节级保留
4. **半损坏（有 begin 无 end）** → 从 begin 到 EOF 视为 managed 区并重写

幂等：连续两次相同 pages 写入不膨胀文件。

### 3.4 调用点

- **唯一写入口**：`updateAgentsMdBridge()` in `server/src/wiki/agents-bridge.ts`
- 在 `ingestIssue` 成功路径末尾调用（写页 + index/log + WS 之后）
- 队列 worker 成功 = 调用 `ingestIssue`，因此自动覆盖

### 3.5 buildPrompt 注入（B6）

`server/src/runtime/prompt.ts` 拼接顺序：

```
skillBlock
+ wikiBridgeBlock   // readManagedBlock；空则跳过
+ briefing(if leader)
+ issueBody
```

分隔仍用 `\n\n---\n\n`（与 S05 一致）。

### 3.6 函数导出

```typescript
// wiki/agents-bridge.ts
export const MA_WIKI_BEGIN = '<!-- BEGIN MA-WIKI (auto-managed; do not edit) -->';
export const MA_WIKI_END = '<!-- END MA-WIKI -->';
export function getAgentsMdPath(): string;
export function readManagedBlock(path?: string): string | null;
export function updateAgentsMdBridge(): void;
export function renderBridgeBody(pages, recentLogs): string;
export function writeManagedBlock(path, begin, end, body): void;
```

---

## 4. ingest 队列 + DLQ

### 4.1 表 `wiki_ingest_job`

| 列 | 类型 | 说明 |
|---|---|---|
| id | text PK | uuid |
| issueId | text NOT NULL | 源 Issue |
| status | text | `pending` \| `running` \| `completed` \| `failed` \| `dead` |
| failCount | integer default 0 | 已失败次数 |
| maxRetries | integer default 3 | 上限 |
| lastError | text null | 最近错误 |
| createdAt | integer | ms |
| updatedAt | integer | ms |
| startedAt | integer null | |
| finishedAt | integer null | |

索引：`(status, created_at)` 供 claim。

> `failed` 可用于瞬时标记（可选）；对外「需人工处理」统一看 `dead`。实现可简化为：失败未超限直接回 `pending`，超限 `dead`，不一定暴露中间 `failed`。

### 4.2 状态机

```
enqueue → pending
pending → running（claim）
running → completed（成功）
running → pending（失败且 failCount < maxRetries）
running → dead（失败且 failCount >= maxRetries）
dead → pending（POST retry）
```

### 4.3 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/wiki/jobs` | 列表，可选 `?status=` |
| GET | `/api/wiki/jobs/:id` | 单条 |
| POST | `/api/wiki/jobs/:id/retry` | dead→pending + wake |

### 4.4 Worker

`server/src/wiki/ingest-worker.ts`（照 `run-worker.ts`）：

- `startWikiIngestWorker()`：setInterval 500ms
- `wakeWikiIngestWorker()`：enqueue 后立即 tick
- `tick()`：claim 最多 1 个 pending（S08 单并发 ingest，避免 LLM 刷爆）
- claim：条件 UPDATE `pending→running` + `startedAt`（DB 行即锁）
- `void execute(job)` fire-and-forget
- 成功：`completed` + `finishedAt`
- 失败：`failCount++`；若 `< maxRetries` 则 `pending` + clear startedAt；否则 `dead` + `lastError`

启动：`index.ts` 在 `startRunWorker()` 旁 `startWikiIngestWorker()`。

### 4.5 触发改动

`routes/issues.ts` PUT status→done：

```typescript
// 删除：void ingestIssue(id).catch(...)
// 改为：
enqueueWikiIngest(id);
```

`enqueueWikiIngest`：

- 可选：同 issue 已有 `pending|running` job 则 skip（防重复入队）
- INSERT pending + `wakeWikiIngestWorker()`

### 4.6 与 `ingestIssue` 关系

- `ingestIssue` 保持纯管线（读 issue → raw → LLM → write → index/log → WS → **updateAgentsMdBridge**）
- 重试/日志/状态由 worker 管
- `ingestIssue` 内部失败应 throw（不要吞），便于 worker 计数

---

## 5. CLI 契约

### 5.1 入口

`app/packages/server/src/cli/ma.ts`（tsx 可执行）+ package.json script：

```json
"ma": "tsx src/cli/ma.ts"
```

用法：`pnpm --filter @ma/server ma wiki <cmd>`

### 5.2 命令

| 命令 | 行为 |
|---|---|
| `ma wiki health` | `checkHealth()` |
| `ma wiki lint` | `checkLint()` |
| `ma wiki query "<q>"` | `queryWiki(q)` |
| `ma wiki pages` | `listWikiPages()` |
| `ma wiki jobs` | 列表 jobs |
| `ma wiki jobs retry <id>` | retry dead job |
| `ma wiki ingest <issueId>` | enqueue（默认）；`--sync` 同步跑一次 ingestIssue |

### 5.3 Envelope

成功 stdout：

```json
{
  "ok": true,
  "status": "success",
  "data": {},
  "meta": { "count": 0 }
}
```

失败 stderr：

```json
{
  "ok": false,
  "error": {
    "type": "resource.not_found",
    "message": "…",
    "exit_code": 4
  }
}
```

### 5.4 Exit code

| code | type 示例 | 含义 |
|---|---|---|
| 0 | — | 成功 |
| 1 | `operation.failed` | 通用失败 |
| 4 | `resource.not_found` | 资源不存在 |
| 5 | `input.invalid` | 参数错误 |
| 7 | `server.transient` | 瞬态失败（LLM 超时等） |

`--format text|json`：默认 TTY→text，pipe→json。

### 5.5 实现约束

- CLI 只 import wiki 函数 / enqueue / DB 查询，不复制业务
- 需要 DB 的命令与 server 共用 `db/client`（同一 `DB_PATH`）
- LLM 命令需 `WIKI_LLM_*`，缺失 → exit 5 或 7（明确 message）

---

## 6. shared 契约

```typescript
export const WikiIngestJobStatus = z.enum([
  'pending', 'running', 'completed', 'failed', 'dead',
]);
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

// CLI envelope（可选 shared 化，便于前端调试页复用）
export const WikiCliEnvelope = z.object({
  ok: z.literal(true),
  status: z.enum(['success', 'partial']).default('success'),
  data: z.unknown().optional(),
  meta: z.record(z.unknown()).optional(),
});
export const WikiCliErrorEnvelope = z.object({
  ok: z.literal(false),
  error: z.object({
    type: z.string(),
    message: z.string(),
    exit_code: z.number().int(),
  }),
});
```

不强制新增 WS 事件；job 状态可通过轮询 GET `/api/wiki/jobs`（S08 够用）。

---

## 7. 文件结构

```
app/packages/
├── shared/src/schema.ts              [改] WikiIngestJob + CLI envelope
├── server/
│   ├── package.json                  [改] "ma" script
│   └── src/
│       ├── db/schema.ts              [改] wikiIngestJobs 表
│       ├── db/migrate + drizzle/     [改] migration
│       ├── wiki/
│       │   ├── agents-bridge.ts      [新] marker 读写 + updateAgentsMdBridge
│       │   ├── ingest-queue.ts       [新] enqueue/claim/retry 查询
│       │   ├── ingest-worker.ts      [新] tick worker
│       │   └── ingest.ts             [改] 成功末尾 updateAgentsMdBridge；失败 throw
│       ├── runtime/prompt.ts         [改] 注入 wikiBridgeBlock
│       ├── routes/issues.ts          [改] done → enqueueWikiIngest
│       ├── routes/wiki.ts            [改] jobs 管理端点
│       ├── cli/ma.ts                 [新] CLI 入口
│       ├── cli/envelope.ts           [新] Envelope helpers
│       └── index.ts                  [改] startWikiIngestWorker
```

---

## 8. 验收标准

### 8.1 工程
- [ ] `pnpm -r typecheck` 全绿
- [ ] `pnpm dev` 起 server + web
- [ ] migration 可应用

### 8.2 队列 + DLQ
- [ ] PUT issue status=done → `wiki_ingest_job` 出现 pending
- [ ] worker claim → running → completed（配 key）
- [ ] 无 key / LLM 失败 → 重试至 maxRetries → dead + lastError
- [ ] POST `/api/wiki/jobs/:id/retry` 将 dead 置 pending 并再次执行
- [ ] 同 issue 重复 done 不重复堆积多个 pending（dedup）

### 8.3 AGENTS.md 桥梁
- [ ] ingest 成功后 `AGENTS.md` 出现 BEGIN/END MA-WIKI 块
- [ ] 再次 ingest 只更新块内内容，不重复追加整块
- [ ] 用户 marker 外内容不被破坏
- [ ] `buildPrompt` 在存在 managed 块时包含 wiki snapshot 文本

### 8.4 CLI
- [ ] `ma wiki health --format json` → ok envelope + exit 0
- [ ] 非法参数 → exit 5 + ErrorEnvelope
- [ ] 不存在资源 → exit 4
- [ ] `ma wiki ingest <id>` 入队；`jobs` 可见

### 8.5 回归
- [ ] S01–S07 不破坏
- [ ] S06 直调 fire-and-forget 路径已移除
- [ ] S07 query/health/lint API 仍可用

---

## 9. Borrow matrix

| ID | 能力 | 主抄 | 锚点 | 落点 | 不抄 |
|---|---|---|---|---|---|
| G-BRIDGE | marker-pair 幂等写 AGENTS.md | multica | runtime_config.go writeRuntimeConfigFile | agents-bridge.ts | provider 多文件路由表全量 |
| G-QUEUE | DB pending + fail_count + dead | WeKnora | task_queue.go + sync_task.go | wiki_ingest_job + ingest-worker | Redis/asynq |
| G-CLAIM | 条件 UPDATE claim | multica / RunWorker | run-worker.ts tick | ingest-worker claim | per-agent 槽（ingest 单并发） |
| G-CLI-ENV | Envelope + exit code | WeKnora CLI | envelope.go + exit.go | cli/envelope.ts | NDJSON / retry_argv |
| G-PROMPT | user prompt 前缀注入 | hermes/S05 | prompt.ts skillBlock | wikiBridgeBlock | system prompt 改写 |

---

## 10. 风险

| 风险 | 缓解 |
|---|---|
| 改写用户 AGENTS.md 引发冲突 | 仅替换 managed 块；marker 文案标明 auto-managed |
| SQLite 与 RunWorker 并发写 | 同进程 short transaction；ingest 单并发 |
| job 卡在 running（进程崩溃） | S08 可启动时将 running 回收为 pending（简单 recovery） |
| CLI 与 dev server DB 路径不一致 | 统一 `DB_PATH` / `MA_WORKSPACE_CWD` 文档化 |
| prompt 注入过长 | 只注入摘要（页标题列表 + 最近 5 条 log），不灌正文 |

---

## 11. 自审记录

| 检查项 | 结果 |
|---|---|
| Placeholder | 无 TBD；marker 文案、表结构、exit code、命令表均确定 |
| 内部一致 | B1–B10 与三块设计一致 |
| 范围 | Phase 2 收尾；排除 heal/图/NDJSON/Redis |
| 与 S06 | 删除 fire-and-forget；ingestIssue 末尾加 bridge；issues.ts 改 enqueue |
| 与 S07 | CLI 复用 checkHealth/checkLint/queryWiki；HTTP 端点保留 |
| 与 S05 | prompt 顺序 skill → **wiki bridge** → briefing → body |
| Borrow | multica marker、WeKnora Lite 队列、WeKnora CLI envelope、RunWorker claim |
| 歧义消除 | DLQ=同表 dead；managed 块内容=索引摘要；CLI 默认入队非同步；ingest 单并发 |

### 对照代码假设

- `issues.ts` 当前确有 `void ingestIssue(id).catch(...)` → 替换点明确
- `prompt.ts` 已有 skillBlock 数组拼接 → 插入 wikiBridgeBlock 位置明确
- `run-worker.ts` tick/claim 模式可复刻为 ingest-worker
- `store.ts` listWikiPages/readIndex/appendLog 可支撑 bridge body 渲染
