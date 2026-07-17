# 补3 — 快速派活（Multica-style quick-create）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans；本项目惯例 **计划者只验收 + 执行者 impl-1 → impl-2 串行**。Steps use checkbox (`- [ ]`) syntax for tracking.  
> **spec（已批准）：** [`docs/superpowers/specs/2026-07-17-bu03-quick-create-design.md`](../specs/2026-07-17-bu03-quick-create-design.md)

**Goal:** 用户提交自然语言 prompt + agent|squad → 系统派出 `kind=quick_create` 且 **无 Issue** 的 run → agent 经 `ma issue create` 建卡并回链 → **M1** 建卡带指派触发工作 run。

**Architecture:**  
放宽 `agent_run.issue_id` 可空，增加 `kind` / `quick_prompt`；`POST /api/quick-runs` 入队；`buildQuickCreatePrompt` 专用分支；扩展 `POST /api/issues` 支持 `originType=quick_create` + `originRunId` 做 Link；CLI `ma issue create` HTTP 调本地 server。UI：Ctrl+K / 侧栏「快速派活」。不引入编排层 ChatCompletion 写标题；不引入 Redis。

**Tech Stack:** 现有 monorepo（Fastify、Drizzle SQLite、Zod、Next、现有 `ma` CLI envelope）。

## Global Constraints

- **分支：** `feat/bu03-quick-create` from **origin/main**  
- **强烈建议：** main 已含 **补2**（roster CRUD）；若未合，rebase/合并补2 后再实现，或接受仅 seed agent 验收  
- **migration 序号：** 若 main 尚无 `0008`，且补2 占用 `0008`，本刀用 **`0009_bu03_quick_create.sql`**；若实现时 journal 最新是 0007，而补2 未合，仍预留 **0009** 以免与补2 抢号——**实现时读 `drizzle/meta/_journal.json` 取 max+1，文件名与 tag 一致**  
- **不 push main**；不 commit `wiki/`、`*.db`；不落 e2e  
- **回归：** `pnpm -r typecheck`；`GET /api/issues` `/api/wiki/pages` `/api/memory/status` `/api/inbox` 200  
- **M1：** `ma issue create` **必须**带与 quick-run 相同的 assignee  
- **计划者**只验收；Conventional Commits：`feat(bu03):` / `docs(bu03):`

---

## File Structure

```
app/packages/shared/src/schema.ts     AgentRun 可空 issueId + kind + quickPrompt；CreateQuickRun*
app/packages/server/src/db/schema.ts  agent_run 列；issue origin_*（推荐）
app/packages/server/drizzle/0009_…sql
app/packages/server/src/db/reshape.ts toAgentRun
app/packages/server/src/routes/quick-runs.ts  [新]
app/packages/server/src/routes/issues.ts      origin + link
app/packages/server/src/app.ts                register route
app/packages/server/src/runtime/prompt.ts     buildPrompt 分支 / buildQuickCreatePrompt
app/packages/server/src/runtime/quick-create-prompt.ts  [新，可选]
app/packages/server/src/orchestration/run-worker.ts  QC 闸
app/packages/server/src/orchestration/run-service.ts  若 enqueue 假定 issue
app/packages/server/src/cli/ma.ts             issue create 子命令
app/packages/web/lib/api.ts                   useQuickRun
app/packages/web/components/QuickDispatch.tsx [新]
app/packages/web/components/CommandPalette.tsx
app/packages/web/components/Sidebar.tsx
```

---

### Task 1: Shared + migration + reshape

**Files:**
- Modify: `app/packages/shared/src/schema.ts`
- Modify: `app/packages/server/src/db/schema.ts`
- Create: `app/packages/server/drizzle/0009_bu03_quick_create.sql`（或 journal max+1）
- Modify: `app/packages/server/drizzle/meta/_journal.json`
- Modify: `app/packages/server/src/db/reshape.ts`

**Produces:**

```ts
export const AgentRunKind = z.enum(['issue', 'quick_create']);
export type AgentRunKind = z.infer<typeof AgentRunKind>;

// AgentRun:
issueId: BusinessId.nullable(), // 原非空 → 可空
kind: AgentRunKind.default('issue'),
quickPrompt: z.string().nullable(),

export const CreateQuickRunInput = z.object({
  prompt: z.string().min(1).max(20000),
  assignee: z.object({
    type: z.enum(['agent', 'squad']),
    id: BusinessId,
  }),
});
export type CreateQuickRunInput = z.infer<typeof CreateQuickRunInput>;

export const CreateQuickRunResult = z.object({
  run: AgentRun,
});
export type CreateQuickRunResult = z.infer<typeof CreateQuickRunResult>;
```

`CreateIssueInput` 扩展（或并行 schema，POST 共用 parse）：

```ts
// 加到 CreateIssueInput.optional 字段：
originType: z.literal('quick_create').optional(),
originRunId: BusinessId.optional(),
```

Zod refine：若 `originType` 有则 `originRunId` 必有，反之亦然。

**DB `agent_run`：**

```ts
issueId: text('issue_id').references(() => issues.id), // 去掉 .notNull()
kind: text('kind', { enum: ['issue', 'quick_create'] }).notNull().default('issue'),
quickPrompt: text('quick_prompt'),
```

**DB `issue`（推荐 origin）：**

```ts
originType: text('origin_type'), // 'quick_create' | null
originRunId: text('origin_run_id'),
```

**Migration SQL 示例（SQLite）：**

```sql
-- agent_run.issue_id 可空：SQLite 常需重建表；若项目既往用简单 ALTER，
-- 优先检查当前表定义。若 issue_id 已是 NOT NULL，使用：
-- 1) 新建 agent_run_new … 拷贝 … rename（完整 DDL 从 0003/当前 schema 对齐）
-- 或 2) 若 drizzle/better-sqlite 允许，文档化「开发库可删 dev.db 重 migrate+seed」
--
-- 最小可验收路径（计划锁定）：实现者若重建成本高，允许
-- 「删 worktree dev.db → 新 schema 全量 migrate+seed」完成可空约束，
-- 但 production-minded 仍应写正确 migration。
--
-- 新增列（易）：
ALTER TABLE `agent_run` ADD `kind` text DEFAULT 'issue' NOT NULL;
ALTER TABLE `agent_run` ADD `quick_prompt` text;
ALTER TABLE `issue` ADD `origin_type` text;
ALTER TABLE `issue` ADD `origin_run_id` text;
```

**注意：** SQLite 无法简单 DROP NOT NULL。实现者必须：

1. 读当前 `0000`–`0007` 合成的 `agent_run` 定义；  
2. 用 **rebuild table** migration 使 `issue_id` 可空，**或** 在 handoff 写明 dev 重置策略并在 PR 描述；  
3. **禁止** 留下 TypeScript 可空但 DB 仍 NOT NULL。

`toAgentRun`：

```ts
issueId: row.issueId ?? null,
kind: (row.kind as 'issue' | 'quick_create') ?? 'issue',
quickPrompt: row.quickPrompt ?? null,
```

- [ ] **Step 1: 改 shared AgentRun + inputs**  
- [ ] **Step 2: 改 drizzle schema + migration + journal**  
- [ ] **Step 3: reshape + 全仓 `issueId` 类型修复到 typecheck 可编**（允许临时 `issueId!` 仅在确认非 QC 路径）  
- [ ] **Step 4:**

```bash
cd app && pnpm -r typecheck
cd app/packages/server && pnpm exec tsx src/db/migrate.ts
```

- [ ] **Step 5: Commit** `feat(bu03): nullable issue_id + run kind quick_create schema`

---

### Task 2: `POST /api/quick-runs` + worker/prompt QC 路径

**Files:**
- Create: `app/packages/server/src/routes/quick-runs.ts`
- Modify: `app/packages/server/src/app.ts`
- Create: `app/packages/server/src/runtime/quick-create-prompt.ts`
- Modify: `app/packages/server/src/runtime/prompt.ts`（export 统一入口）
- Modify: `app/packages/server/src/orchestration/run-worker.ts`
- Modify: `app/packages/server/src/orchestration/run-service.ts`（检查 enqueue 是否强制 issue）

**`buildQuickCreatePrompt` 最低文案（中文，可扩）：**

```ts
export function buildQuickCreatePrompt(opts: {
  prompt: string;
  runId: string;
  agentId: string;
  assigneeType: 'agent' | 'squad';
  assigneeId: string;
  isLeader: boolean;
  squadId: string | null;
  serverUrl: string; // e.g. http://127.0.0.1:3001
}): string {
  // 1) 说明无 Issue
  // 2) User input 引用块
  // 3) 必须 ma issue create，title/description 规则（精简 Multica）
  // 4) assignee 固定 opts.assigneeType/Id，禁止改派
  // 5) --origin-run opts.runId
  // 6) MA_SERVER_URL=opts.serverUrl
  // 7) 若 isLeader：附加简短 squad 委派提示 + loadSquadDetail roster（可选）
}
```

**统一 `resolveRunPrompt(runRow)`：**

```ts
if (runRow.kind === 'quick_create') {
  return buildQuickCreatePrompt(...);
}
if (!runRow.issueId) return null;
return buildPrompt(runRow.issueId, { ... });
```

**`POST /api/quick-runs`：**

```ts
// parse CreateQuickRunInput
// resolve agentId + isLeader + squadId + assigneeForCreate
// insert agent_run: {
//   id, issueId: null, agentId, runtime from agent,
//   status: 'queued', kind: 'quick_create', quickPrompt: prompt,
//   isLeader, squadId, createdAt, ...
// }
// eventBus run:queued; wakeRunWorker(); 201 { run }
```

**Worker `executeRun` 闸：**

```ts
const prompt = await resolveRunPrompt(runRow);
// backend.execute: issueId: runRow.issueId ?? 'quick-create', 或改 ExecutionInput.issueId optional
// on completed:
if (runRow.kind === 'quick_create') {
  const fresh = db.select()...get();
  if (!fresh.issueId) {
    await failRun(id, 'quick_create: issue not created');
    return;
  }
  // completed + notifyRunTerminal（title 可含 快速派活）
  // 不要用 issue 时间线写超长 finalText 也可写一条短 comment
}
// issue runs: 保持今日逻辑；写 comment 前 assert issueId
```

**ExecutionInput：** 若 `issueId: string` 硬编码，改为 `issueId: string | null` 并修 backend 仅日志使用处。

- [ ] **Step 1: quick-create-prompt.ts**  
- [ ] **Step 2: quick-runs route + app register**  
- [ ] **Step 3: worker/prompt/execute 闸**  
- [ ] **Step 4: smoke**

```bash
curl -s -X POST localhost:PORT/api/quick-runs -H 'content-type: application/json' \
  -d '{"prompt":"给登录页加记住我","assignee":{"type":"agent","id":"agt-lead"}}'
# expect kind quick_create issueId null
```

- [ ] **Step 5: Commit** `feat(bu03): POST /api/quick-runs + QC prompt + worker gates`

---

### Task 3: Issue origin link + `ma issue create` + M1 enqueue

**Files:**
- Modify: `app/packages/server/src/routes/issues.ts`
- Modify: `app/packages/server/src/cli/ma.ts`
- Modify: `app/packages/server/src/cli/envelope.ts`（若需）
- package.json bin 已有 `ma` 则只加子命令

**POST /api/issues 扩展逻辑（在 insert 成功后、enqueue 前）：**

```ts
if (input.originType === 'quick_create' && input.originRunId) {
  const run = db.select().from(agentRuns).where(eq(agentRuns.id, input.originRunId)).get();
  if (!run || run.kind !== 'quick_create') return 400;
  if (run.issueId && run.issueId !== id) return 409;
  db.update(agentRuns)
    .set({ issueId: id })
    .where(and(eq(agentRuns.id, input.originRunId), eq(agentRuns.kind, 'quick_create')))
    .run();
  // 写 issue.originType / originRunId
}
// 然后现有：if assignee → enqueueAgentRun / enqueueLeaderRun  （M1）
```

**人类建卡** 不传 origin → 行为不变。

**CLI：**

```ts
// ma issue create --title T --description D | --description-file F
//   --assignee-type agent|squad --assignee-id ID
//   --priority medium
//   --origin-run RID
//   [--server http://127.0.0.1:3001]
//
// body: {
//   title, description, priority,
//   assignee: { type, id },
//   originType: 'quick_create',
//   originRunId
// }
// fetch POST ${server}/api/issues
// emitOk({ issue })
```

环境变量：`MA_SERVER_URL`（默认 `http://127.0.0.1:3001`）、`MA_RUN_ID` 可作 `--origin-run` 默认。

**QC prompt 中写死示例命令行**（用真实 runId/assignee）。

- [ ] **Step 1: issues.ts origin+link**  
- [ ] **Step 2: ma issue create**  
- [ ] **Step 3: 集成 smoke（可无真实 CLI agent）**

```bash
# 手工模拟 agent create：
curl -s -X POST localhost:PORT/api/issues -H 'content-type: application/json' \
  -d '{"title":"QC测试","description":"desc","assignee":{"type":"agent","id":"agt-lead"},"originType":"quick_create","originRunId":"RUN"}'
# expect issue + run.issueId set + 可能第二条 run queued
```

- [ ] **Step 4: typecheck + commit** `feat(bu03): ma issue create + origin link (M1)`

---

### Task 4: Web 快速派活 UI

**Files:**
- Modify: `app/packages/web/lib/api.ts`
- Create: `app/packages/web/components/QuickDispatchPanel.tsx`
- Modify: `app/packages/web/components/CommandPalette.tsx`
- Modify: `app/packages/web/components/Sidebar.tsx`
- Modify: `app/packages/web/lib/ws.ts`（run issueId null 不崩）
- Modify: Agent Runs UI（若补2 已合）：显示 kind / 无 issue

**`useCreateQuickRun`：**

```ts
mutationFn: async (input: CreateQuickRunInput) => {
  const res = await fetch(`${API}/quick-runs`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ run: AgentRun }>;
},
onSuccess: (data) => {
  toastSuccess('已派出快速派活任务');
  qc.invalidateQueries({ queryKey: ['runs'] }); // 若有
},
```

**UI 字段：** assignee（agent/squad 下拉，复用 agents+squads hooks）+ prompt textarea + 提交。无标题框。

**Ctrl+K：** 命令「快速派活」→ 打开 panel（palette 内嵌或 setState 二级视图）。

**侧栏：** 按钮打开同一 panel（模态简单实现：fixed overlay）。

**ws.ts：** `run.issueId` 可能 null 时 skip `['runs', issueId]` 更新或 guard。

- [ ] **Step 1: api hook**  
- [ ] **Step 2: QuickDispatchPanel**  
- [ ] **Step 3: 挂载 cmdk + sidebar**  
- [ ] **Step 4: ws null-safe**  
- [ ] **Step 5: typecheck + commit** `feat(bu03): quick dispatch UI in cmdk and sidebar`

---

### Task 5: 回归 + handoff

**Files:**
- `app/.progress/bu03-impl-1.md` / `bu03-impl-2.md`
- 更新 phase4b 进度表补3 状态

**验收勾选：**

- [ ] quick-runs 201，初始 issueId null  
- [ ] 模拟 origin create → link + 工作 enqueue  
- [ ] QC completed 无 issueId → failed 文案  
- [ ] UI 可提交  
- [ ] typecheck；issues/wiki/memory/inbox 200  
- [ ] 无 wiki/db 误提交  

```bash
cd app && pnpm -r typecheck
git push -u origin feat/bu03-quick-create
```

---

## 执行者拆分

| 棒 | Tasks | 内容 |
|---|---|---|
| **impl-1** | 1–3 | schema 可空 issueId、quick-runs、prompt、worker、ma issue create、origin link |
| **impl-2** | 4–5 | UI + ws 安全 + 回归 handoff |

串行；impl-2 依赖 API 稳定。

---

## Self-Review vs spec

| Spec | Task |
|---|---|
| P1 无 Issue 先 run | Task 1–2 |
| ma issue create + Link | Task 3 |
| M1 assignee enqueue | Task 3 |
| 不编排层 LLM 标题 | 全程 |
| Ctrl+K / 侧栏 | Task 4 |
| QC 未建卡 fail | Task 2 |
| 厚两棒 | 拆分表 |

---

## 明确不做

Project/parent/attachment；chat session；编排 ChatCompletion 标题；Redis。

---

## 执行交接

**Plan complete and saved to `docs/superpowers/plans/2026-07-17-bu03-quick-create.md`.**

本项目：**计划者只验收**；人派执行者。  
**建议等补2 合 main 再开 bu03 分支**，减少 migration/类型冲突。

**派 impl-1：** 复制 `app/.progress/bu03-planner-0.md` 中块。
