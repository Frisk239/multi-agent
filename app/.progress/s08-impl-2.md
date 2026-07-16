# Handoff: s08-impl-2

> 切片：`S08` · 角色：`impl` · 序号：`2`
> 日期：2026-07-16
> 分支：`feat/s08-bridge-queue-cli`
> **分支基线：** 接 impl-1（`84a4892`）；基线仍是 `feat/s07-query-health-lint` 衍生（S07 未合 main）。

## 上下文（给下一个会话读）

S08 = Phase 2 收尾：AGENTS.md 桥梁 + ingest 队列/DLQ + CLI Envelope。

impl-2 边界：**队列 + worker + ingest/issues/prompt/routes/index 接线**。无 CLI。

- 前序：[`app/.progress/s08-impl-1.md`](./s08-impl-1.md)（表/bridge 已就绪）
- spec：`docs/superpowers/specs/2026-07-16-s08-agents-bridge-queue-cli-design.md` §3.4–3.5 / §4
- 计划：`docs/superpowers/plans/2026-07-16-s08-bridge-queue-cli.md` 执行者片段 B（Task 2.1–2.7）

> 注：S08 plan/spec 目前只在 `main` 上；本 feature 分支 working tree 有为阅读而 checkout 的 untracked 副本，**未 commit**。impl-3 / 计划者可按需 `git checkout main -- docs/superpowers/...s08...` 或先合文档。

## 本会话完成了什么

| Task | 内容 | Commit |
|---|---|---|
| 2.1 | `wiki/ingest-queue.ts` enqueue/claim/complete/fail/retry/recover/list/get/toWikiIngestJob | `238e078` |
| 2.2 | `wiki/ingest-worker.ts` 500ms tick + claim + wake + 启动 recover | `26b16ae` |
| 2.3 | `ingest.ts` 成功末尾 `updateAgentsMdBridge()`；失败继续 throw | `01df147` |
| 2.4 | `issues.ts` done → `enqueueWikiIngest` + `wake`；删除 `void ingestIssue().catch` | `f99e128` |
| 2.5 | `prompt.ts` skill 后注入 `readManagedBlock` wiki 快照 | `bc67b24` |
| 2.6 | `wiki.ts` GET jobs / GET id / POST retry；`index.ts` `startWikiIngestWorker` | `4c72448` |
| 2.7 | 本 handoff | （本 commit） |

## 导出签名（给 impl-3 直接 import）

### `wiki/ingest-queue.ts`

```typescript
export function toWikiIngestJob(row): WikiIngestJob;
export function enqueueWikiIngest(issueId: string): string | null; // 同 issue pending|running → null
export function claimNextWikiIngestJob(); // 最多 1 个 pending→running
export function completeWikiIngestJob(id: string): void;
export function failWikiIngestJob(id: string, error: string): void; // failCount++；<maxRetries→pending 否则 dead
export function retryWikiIngestJob(id: string): boolean; // 仅 dead→pending，重置 failCount
export function recoverStuckRunningJobs(): number;
export function listWikiIngestJobs(status?: string);
export function getWikiIngestJob(id: string);
```

### `wiki/ingest-worker.ts`

```typescript
export function startWikiIngestWorker(): void; // recover + setInterval 500ms
export function wakeWikiIngestWorker(): void;
```

### 已接线（impl-3 勿重复）

- `issues.ts` PUT status→done：enqueue + wake（无 fire-and-forget）
- `ingest.ts` 成功 → `updateAgentsMdBridge()`
- `prompt.ts`：`skillBlock` → **wikiBridgeBlock** → briefing → body
- `routes/wiki.ts`：`/api/wiki/jobs` / `:id` / `:id/retry`
- `index.ts`：`startWikiIngestWorker()` 与 `startRunWorker()` 并列

### HTTP

| 方法 | 路径 | 行为 |
|---|---|---|
| GET | `/api/wiki/jobs?status=` | 列表，map `toWikiIngestJob` |
| GET | `/api/wiki/jobs/:id` | 404 if missing |
| POST | `/api/wiki/jobs/:id/retry` | 仅 dead；成功 wake；非 dead → 400 |

## 自测结果

**typecheck**

```
$ cd app && pnpm -r typecheck
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

**无 key 路径（PORT=3011，`MA_WORKSPACE_CWD=/tmp/s08-impl2-ws`，未设 `WIKI_LLM_API_KEY`）**

1. `PUT /api/issues/FRI-05 → done` → job 出现，约 1s 内：
   - 立即可见 `failCount:2` 的 `pending`（重试中）
   - 随后 `status:dead, failCount:3, lastError:"Error: WIKI_LLM_API_KEY 未配置"`
2. 另一 issue FRI-04 done → 独立 dead job（两行）
3. `POST /api/wiki/jobs/:id/retry` → 短暂 `running` / 再走满 3 次 → 又 `dead`；`failCount` 从 0 重置后再到 3
4. `GET` 不存在 id → **404**
5. `POST retry` 对 `completed` job → **400** `仅 dead job 可 retry`

**dedup**

```
enqueue same issue twice → first=<uuid>, second=null
```

**AGENTS.md 隔离 + prompt 注入**（`MA_WORKSPACE_CWD` 指向 Temp 目录，**未碰 repo 根 AGENTS.md**）

- `updateAgentsMdBridge` 写出 BEGIN/END MA-WIKI；二次写入 `beginCount=1`
- `buildPrompt(FRI-11)` 含 `# Project Wiki Snapshot` + managed 正文

**有 key 路径：** 本会话环境无可用 `WIKI_LLM_API_KEY`，**未跑 completed 全链路**。逻辑上：worker `await ingestIssue` → 写页/index/log/WS → `updateAgentsMdBridge` → `completeWikiIngestJob`。impl-3 端到端验收时配 key 补 completed + AGENTS 实写证据。

**回归检查**

- `rg "void ingestIssue"`：issues 路由已无 fire-and-forget
- S07 routes（query/health/lint/pages）文件仍在，jobs 为追加

## 与计划的偏离

1. **worker 内存 `busy` 闸：** 计划片段只有 claim 单行；实现额外加了 `busy` flag，防止 `execute` 异步未完成时 500ms tick 再 claim 下一单（无 key 时 fail 极快，有 key 时 LLM 慢，否则会并行刷 LLM）。语义仍是「S08 单并发 ingest」，与 spec 一致，比纯 DB claim 更硬。
2. **有 key 成功路径未在本机会手动跑**——依赖 env；handoff 标明留给 impl-3 §8 验收。
3. **plan/spec 文件：** 从 main 拉到 working tree 只读，未纳入本分支 commit（避免把 main 文档误搅进 feature 历史；文档已在 main）。
4. **无其他偏离。** fail 策略按计划：`< maxRetries` 回 pending，否则 dead；retry 重置 failCount。

## 遗留 / 下一个执行者要注意的点

**给 impl-3（CLI envelope + `ma wiki` + 端到端验收）：**

1. **复用，不复制：** CLI 只 import  
   `enqueueWikiIngest` / `listWikiIngestJobs` / `retryWikiIngestJob` / `getWikiIngestJob` / `toWikiIngestJob` / `wakeWikiIngestWorker` / `ingestIssue` / S07 的 `checkHealth`/`checkLint`/`queryWiki` / `listWikiPages`。
2. **package.json** 加 `"ma": "tsx src/cli/ma.ts"`；类型 `WikiCliEnvelope`/`WikiCliErrorEnvelope` 已在 shared。
3. **DB / cwd：** CLI 与 server 共用 `DB_PATH` / `MA_WORKSPACE_CWD`；测 bridge **必须**隔离 `MA_WORKSPACE_CWD`，勿污染 repo 根 `AGENTS.md`。
4. **jobs 无 WS：** 状态靠 GET 轮询（spec 明确 S08 够用）。
5. **无 key → dead 很快**（createLlm 同步 throw）；有 key 时才走 completed + AGENTS 更新。验收两条路径都要勾。
6. **emitOk/emitErr 是 never**；switch 勿 fallthrough。
7. **本片段未做：** `cli/envelope.ts` / `cli/ma.ts` / package.json `ma` script。
8. **测试污染：** 本地 `dev.db` 里可能残留 dead/completed 的 `wiki_ingest_job` 与 FRI-04/05 status=done（自测改过）。需要干净状态可 reseed 或手工清表。

## 验收结论（仅计划者填）

- [x] typecheck 通过 — 计划者复核全绿
- [x] 无 key：done → pending/retry → dead + lastError — handoff curl 证据
- [x] POST retry：dead → pending 再执行 — 证据充分
- [x] dedup：同 issue pending/running 不二次入队
- [x] issues 无 `void ingestIssue` — 已改为 enqueue + wake
- [x] prompt 在 managed 存在时含 wiki snapshot — skill 后注入
- [x] 无 CLI 越界
- [x] worker `busy` 闸 — 合理加强，仍单并发
- [ ] 有 key completed 全链路 — 留给 impl-3 补

### 代码审查要点

1. **issues.ts** enqueue + 条件 wake；无 fire-and-forget。
2. **ingest.ts** 成功末尾 `updateAgentsMdBridge`；注释要求 throw。
3. **ingest-worker** claim 1 + busy finally 释放；recover on start。
4. **failWikiIngestJob** failCount 与 maxRetries=3 符合 B7/B8。
5. **prompt** skill → wiki → briefing → body。

- 结论：**impl-2 验收通过**。可进 impl-3（CLI + 端到端 §8）。
