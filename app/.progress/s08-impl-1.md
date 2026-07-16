# Handoff: s08-impl-1

> 切片：`S08` · 角色：`impl` · 序号：`1`
> 日期：2026-07-16
> 分支：`feat/s08-bridge-queue-cli`
> **分支基线：** 从 `feat/s07-query-health-lint`（`749a2d7`）切出，**不是 main**。原因：S07 尚未合入 main（main 仅到 S06 PR #5 + S08 docs）。impl-2/3 与后续 PR 需基于此分支，或先合 S07 再合 S08。

## 上下文（给下一个会话读）

S08 = Phase 2（Wiki 知识层）收尾切片：AGENTS.md 桥梁 + ingest 队列/DLQ + CLI Envelope。

impl-1 边界：**契约 + 表 + 桥梁纯函数**。无 worker、无 CLI、无 routes/prompt/issues 接线。

- spec：[`docs/superpowers/specs/2026-07-16-s08-agents-bridge-queue-cli-design.md`](../../docs/superpowers/specs/2026-07-16-s08-agents-bridge-queue-cli-design.md) §3/§4/§6
- 计划：[`docs/superpowers/plans/2026-07-16-s08-bridge-queue-cli.md`](../../docs/superpowers/plans/2026-07-16-s08-bridge-queue-cli.md) 执行者片段 A（Task 1.1–1.4）

## 本会话完成了什么

- **Task 1.1** `app/packages/shared/src/schema.ts`：`WikiIngestJobStatus` / `WikiIngestJob` / `WikiCliEnvelope` / `WikiCliErrorEnvelope`（插在 `CreateWikiPageInput` 之后、Run 事件块之前）
- **Task 1.2** `wiki_ingest_job` 表 + 手写 migration 0005 三件套
  - `app/packages/server/src/db/schema.ts` → `wikiIngestJobs`
  - `drizzle/0005_wiki_ingest_job.sql`
  - `drizzle/meta/0005_snapshot.json` + `_journal.json` idx=5
- **Task 1.3** `app/packages/server/src/wiki/agents-bridge.ts`（新建）：marker-pair 读写 + `updateAgentsMdBridge`

4 个 commit：`c320931` / `6398ce7` / `21ded53` / `2d306dd`（含本 handoff）。

**Push 状态：** 本地分支 `feat/s08-bridge-queue-cli` 已就绪；`git push origin feat/s08-bridge-queue-cli` **失败**——本机 `http(s).proxy=127.0.0.1:7890` 无服务监听，直连 github.com:443 超时，SSH 公钥未授权。需用户恢复代理/网络后执行：

```bash
git push -u origin feat/s08-bridge-queue-cli
```

## 自测结果

**typecheck**（每 Task 后全绿）：

```
$ cd app && pnpm -r typecheck
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

**agents-bridge spike**（`MA_WORKSPACE_CWD` 指向隔离目录，测后删除）：

```
create begins true ends true
beginCount 1 has A true
preface true
body2 once 1 body1 gone true
beginCount2 1
spike ok
```

验证点：
1. 无文件 → 创建 BEGIN/END 块
2. 二次写入不重复 marker（beginCount=1）
3. 用户前文保留；块内内容被替换（body1→body2）

## 与计划的偏离

1. **分支基线：** 计划优先从「含 S07 的 main」切；实际 S07 未合 main，从 `feat/s07-query-health-lint` 切（计划允许，须在 handoff 注明）。
2. **migration 0005 手写三件套：** 与 S05 相同策略（避免 drizzle-kit 交互）。除 SQL + journal 外补了 `0005_snapshot.json`，保持 drizzle 内部状态链完整。SQL 末句**无**尾部 `--> statement-breakpoint`（S05 踩过空语句坑）。
3. **无其他偏离。** 契约/表/bridge 代码与计划片段一致。

## 导出签名（给 impl-2 直接 import）

### shared（`@ma/shared`）

- `WikiIngestJobStatus` / `WikiIngestJob`
- `WikiCliEnvelope` / `WikiCliErrorEnvelope`（CLI 留给 impl-3；类型已就绪）

### DB

```typescript
export const wikiIngestJobs = sqliteTable('wiki_ingest_job', {
  id, issueId, status, // pending|running|completed|failed|dead
  failCount, maxRetries, // default 0 / 3
  lastError, createdAt, updatedAt, startedAt, finishedAt,
});
// indexes: idx_wiki_ingest_job_status_created(status, created_at)
//          idx_wiki_ingest_job_issue(issue_id)
```

### agents-bridge.ts

```typescript
export const MA_WIKI_BEGIN = '<!-- BEGIN MA-WIKI (auto-managed; do not edit) -->';
export const MA_WIKI_END = '<!-- END MA-WIKI -->';
export function getAgentsMdPath(): string; // MA_WORKSPACE_CWD ?? cwd
export function writeManagedBlock(path, begin, end, body): void;
export function readManagedBlock(path?: string): string | null;
export function renderBridgeBody(pages, recentLogText): string;
export function updateAgentsMdBridge(): void; // listWikiPages + readLog → write
```

## 遗留 / 下一个执行者要注意的点

**给 impl-2（队列 + worker + ingest/issues/prompt 接线）：**

1. **claim 单并发：** worker 每次 `claimNextWikiIngestJob` 最多 1 个 pending；S08 不做 per-agent 槽。
2. **`ingestIssue` 必须 throw：** 失败不要吞；worker 靠 catch → `failWikiIngestJob` 计 failCount；成功路径末尾（`wiki:page-created` 之后）调 `updateAgentsMdBridge()`。
3. **B9：** `issues.ts` PUT status→done 改为 `enqueueWikiIngest` + `wakeWikiIngestWorker`，删除 `void ingestIssue().catch(...)` fire-and-forget。
4. **dedup：** 同 issue 已有 `pending|running` job 则 skip 再入队。
5. **recovery：** `startWikiIngestWorker` 启动时 `recoverStuckRunningJobs()`（running→pending）。
6. **表已迁移：** 本地 DB 已应用 0005；新环境 `pnpm db:migrate` 即可。
7. **bridge 写的是 workspace `AGENTS.md`**，路径受 `MA_WORKSPACE_CWD` 控制；**不要**在 repo 根 AGENTS.md 上随手跑 `updateAgentsMdBridge`（会改宪法文件）。测试时设隔离 `MA_WORKSPACE_CWD`。
8. **本片段未做：** `ingest-queue.ts` / `ingest-worker.ts` / routes jobs / prompt 注入 / CLI（impl-2/3）。

## 验收结论（仅计划者填）

- [x] typecheck 通过 — 计划者复核 `pnpm -r typecheck` 全绿
- [x] migration 0005 可应用 — SQL + journal idx=5 + snapshot；无尾部空 breakpoint
- [x] agents-bridge 导出齐全 — BEGIN/END、read/write/update、renderBridgeBody
- [x] 无 worker/CLI 越界 — 仅契约/表/bridge
- [x] 基线正确 — 从 `feat/s07-query-health-lint` 切出并写明（S07 未合 main）
- [x] spike 验证 — 创建 / 不重复 marker / 保留用户前文

### 代码审查要点

1. **marker-pair** 三态（无文件 / 无 marker 追加 / 有 marker 替换）+ 半损坏 begin 无 end — 与 multica 精神一致。
2. **updateAgentsMdBridge** 用 `listWikiPages` + `readLog`，不写正文 — 符合 B5。
3. **表字段** status 五态 + fail_count/max_retries=3 + status_created 索引 — 满足 claim/DLQ。
4. **测试 AGENTS.md** 须隔离 `MA_WORKSPACE_CWD` — handoff 已警告，impl-2 遵守。

- 结论：**impl-1 验收通过**。可进 impl-2（queue/worker + issues/ingest/prompt 接线）。
