# Handoff: S03-impl-1（shared + DB + seed）

> 切片：`S03` · 角色：`impl` · 序号：`1`
> 日期：2026-07-10
> 分支：`feat/s03-runtime-backend`

## 上下文（给下一个会话读）

S03（真实 agent 执行层）的 impl-1 切片，负责**契约 + 数据层底座**，不含执行逻辑与前端。

- **计划真源：** [`docs/superpowers/plans/2026-07-09-s03-runtime-backend.md`](../docs/superpowers/plans/2026-07-09-s03-runtime-backend.md)「执行者片段 A」（Task 1.1~1.4）
- **spec 真源：** [`docs/superpowers/specs/2026-07-09-s03-runtime-backend-design.md`](../docs/superpowers/specs/2026-07-09-s03-runtime-backend-design.md) §3 数据模型、§4 shared 契约
- **前置交接：** [`s03-planner-1.md`](s03-planner-1.md)
- **下一个执行者：** impl-2（Backend 三实现 + RunWorker + routes）

## 本会话完成了什么

### Task 1.1 — 开分支
- [x] 从 main 开 `feat/s03-runtime-backend`（本地 main 已与 origin/main 同步；`git pull` 因网络超时失败，但本地已是最新）

### Task 1.2 — shared 契约扩展（`app/packages/shared/src/schema.ts`）
- [x] `RuntimeId`（enum claude-code | opencode | cursor）
- [x] `AgentRunStatus` / `RunMessageKind`
- [x] `AgentRun` / `RunMessage` / `RuntimeInfo` / `RuntimesResponse`
- [x] `UpdateIssueInput` 放开 `assignee`（无 label 形状，GET 时服务端填）+ `validateUpdateIssue` 加判断
- [x] `AgentSummary` 加 `runtime: RuntimeId`
- [x] WS 事件：`RunLifecycleEvent` / `RunProgressEvent` / `RunMessageEvent`；`DomainEvent` 联合扩展含全部 `run:*`

### Task 1.3 — Drizzle schema + migration（`app/packages/server/src/db/schema.ts`）
- [x] `agents` 表加 `runtime` 列（text NOT NULL default 'claude-code'）
- [x] 新增 `agentRuns` 表（SQL 表名 **`agent_run`**，9 列 + 2 索引 + FK→issue）
- [x] 新增 `runMessages` 表（SQL 表名 **`run_message`**，6 列 + 1 复合索引 `(run_id, seq)` + FK→agent_run）
- [x] `db:generate` → 产出 **`0002_smart_northstar.sql`**
- [x] 删 `dev.db*` → `db:migrate` 应用迁移

### Task 1.4 — seed + reshape
- [x] seed：4 个 agent 加 runtime 绑定（agt-lead→claude-code / agt-research→opencode / agt-prd→cursor / agt-proto→claude-code）
- [x] **保留全部现有 seed 数据**（issue 8 条 + comment 6 条未动）
- [x] reshape：新增 `toAgentRun(row)` / `toRunMessage(row)` + `iso(ms)` helper
- [x] seed 行数验证：agent 4（带 runtime）+ issue 8 + comment 6

## 自测结果

### typecheck（`pnpm -r typecheck`，shared + server + web 三包全绿）

```
Scope: 3 of 4 workspace projects
packages/shared typecheck$ tsc --noEmit
packages/shared typecheck: Done
packages/server typecheck$ tsc --noEmit
packages/web typecheck$ tsc --noEmit
packages/web typecheck: Done
packages/server typecheck: Done
```

### migration 文件

```
drizzle/0002_smart_northstar.sql
  - CREATE TABLE `agent_run` (id, issue_id, agent_id, runtime, status, error, started_at, finished_at, created_at) + FK issue
  - CREATE TABLE `run_message` (id, run_id, seq, kind, body, created_at) + FK agent_run
  - ALTER TABLE `agent` ADD `runtime` text DEFAULT 'claude-code' NOT NULL
  - CREATE INDEX idx_agent_run_issue / idx_agent_run_status / idx_run_message_run_seq
```

### seed 行数验证（sqlite3 CLI）

```
agent (4 行，全部带 runtime):
  agt-lead      | 产品·策划队长       | claude-code
  agt-research  | 产品·调研与洞察官   | opencode
  agt-prd       | 产品·需求与PRD官    | cursor
  agt-proto     | 产品·设计·原型官    | claude-code
COUNTS: agents=4  issues=8  comments=6
```

### 联调自测（`pnpm --filter @ma/server dev` 起 server，curl 打 API）

起 server 后逐个端点验证，确认数据层改动未破坏 S01/S02，且新表/新字段可用：

```
1. GET /api/agents       → 4 行，全部带 runtime（claude-code/opencode/cursor/claude-code，覆盖三 runtime）✓
2. GET /api/squads       → 3 行（S01 回归）✓
3. GET /api/issues       → 8 条，assignee 多态指派完整（member/agent/squad + label）✓
4. GET /api/issues/:id   → FRI-11 答辩 demo 路径：in_review + squad:产品小队 ✓
5. GET /api/issues/:id/comments → FRI-11 时间线 3 条 comment（林远 + agt-lead + agt-research，含 mention 链接）✓
6. agent_run / run_message 表存在且为空（0|0）✓
7. agent 表 schema 含 runtime 列（text DEFAULT 'claude-code' NOT NULL）✓
8. PUT /api/issues/:id（priority）→ 正常更新 ✓
9. PUT 带 assignee → 静默忽略（当前路由未读 input.assignee，priority 仍生效）✓ 这是 impl-2 要接的副作用

端到端 reshape 验证（临时脚本插入 test 行 → toAgentRun/toRunMessage 读出 → 自清理）：
- toAgentRun: ms → ISO datetime 正确（startedAt/finishedAt/createdAt）；error null 保留；形状匹配 AgentRun 契约 ✓
- toRunMessage: seq 数字、kind/body 直传；createdAt ms → ISO；形状匹配 RunMessage 契约 ✓
- 清理后两表回到 0 行 ✓
```

## 与计划的偏离

1. **PowerShell → Bash 删库命令（kickoff 坑1）。** plan Task 1.3 Step 3 写的是 `Remove-Item ...`，本会话用 Git Bash，改用 `rm -f app/packages/server/dev.db app/packages/server/dev.db-shm app/packages/server/dev.db-wal`。

2. **web `lib/api.ts` 乐观更新修复（超出 impl-1 声明范围）。** 放开 `UpdateIssueInput.assignee` 后，web 的 `useUpdateIssue.onMutate` 把无 label 的 assignee 展开进 `Issue` 缓存（含 label），导致 `pnpm -r typecheck` web 报错（DoD 要求全绿）。最小修复：乐观展开时剥离 `assignee`（`const { assignee: _dropAssignee, ...patch } = input`），assignee 等服务端返回带 label 的完整 Issue 再落地（onSuccess 已处理）。**这是 1 行级补丁，impl-3 会重写指派 UI；impl-2 不受影响。**

3. **`git pull origin main` 网络超时失败。** 本地 main 已与 origin/main 同步（`Your branch is up to date`），分支从本地最新 main 切出，无影响。

4. **真实依赖版本记录（给 impl-2/3 参考）：** drizzle-kit 自动生成的 migration 名 `0002_smart_northstar.sql`（非 `0002_agent_run.sql`，drizzle 随机后缀）；migration 顺序号正确（0000→0001→0002）。

5. **roster 路由修复（联调发现，超 plan 范围）。** plan 把 roster 的 runtime 返回归在 impl-2 Task 2.3 Step 4，但联调时发现：`AgentSummary.runtime` 改成 required 后，旧 `GET /api/agents` 仍只返回 `{ id, name }`（typecheck 不报是因为 Fastify 无返回类型断言）。为让联调自测干净 + 避免前端拿到 undefined runtime，提前把 `runtime: a.runtime` 加上。**这样 impl-2 无需再改 roster（注意点 5 已同步更新）。**

6. **`git push` 网络失败（环境问题）。** 本机代理（127.0.0.1:443）连不上 github，push 两次均超时失败。本地分支 4 commit 完整，**网络恢复后执行 `git push -u origin feat/s03-runtime-backend` 即可**。不影响代码验收。

## 遗留 / 下一个执行者（impl-2）要注意的点

> 不是新计划，是「如果你接着干，这些约定你必须知道」。

1. **表名单数：** SQL 表名是 `agent_run` / `run_message`（**不是** `agent_runs` / `run_messages`）。Drizzle 导出名是 `agentRuns` / `runMessages`（camelCase JS 变量）。

2. **`UpdateIssueInput.assignee` 已进 shared，但 `PUT /api/issues/:id` 路由还没接指派副作用。** 你（impl-2）的活：按 plan Task 2.3 Step 5，在 issues PUT 里处理 assignee 变更 → `cancelActiveRunsForIssue` + `enqueueAgentRun`。当前 routes/issues.ts 完全没碰 assignee。

3. **`DomainEvent` 已含全部 `run:*` 事件**（`run:queued|running|completed|failed|cancelled` + `run:progress` + `run:message`）。你的 `eventBus.publish(...)` 可直接用，类型已就绪。

4. **reshape 的 `toAgentRun` / `toRunMessage` 已就绪**，签名：
   - `toAgentRun(row: typeof agentRuns.$inferSelect): AgentRun`
   - `toRunMessage(row: typeof runMessages.$inferSelect): RunMessage`
   - import from `'../db/reshape.js'`

5. **`AgentSummary` 加了 required `runtime` 字段，roster 路由已配套接好。** `GET /api/agents` 已返回 `{ id, name, runtime }`（本会话联调时发现并修复，原 S02 只返回 `{ id, name }`）。你无需再改 roster。前端 impl-3 可直接用 `AgentSummary[]` 泛型（含 runtime）。

6. **DB client 已就绪：** `db` 来自 `'../db/client.js'`，better-sqlite3 同步 API。新表 `agentRuns` / `runMessages` 从 `'../db/schema.js'` 导入。

7. **seed 的 `MA_WORKSPACE_CWD` 等 env 未配。** 你的 RunWorker 跑 `MA_WORKSPACE_CWD` 缺失时要走 `failed` 分支（spec §3.6）。

## 验收结论（计划者填）

> 待计划者验收。

- [x] typecheck 通过（shared + server + web 全绿）
- [ ] `pnpm dev` 能跑（impl-2/3 接完后验证）
- [ ] 切片验收标准达成（见 spec §12）
- 结论：<待计划者填>
