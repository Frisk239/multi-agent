# Handoff: bu03-impl-1

> 切片：`补3` / `bu03` · 角色：`impl` · 序号：`1`  
> 日期：2026-07-17

## 上下文（给下一个会话读）

补3 快速派活（Multica-style）：先无 Issue 的 `kind=quick_create` run → agent `ma issue create` 建卡并 Link → M1 带 assignee enqueue 工作 run。  
本棒只做 plan Task 1–3（shared/migration/API/prompt/worker/CLI），**不做 Web UI**（Task 4–5 = impl-2）。  
分支：`feat/bu03-quick-create`（from origin/main @ `840a6c8`，已含补2 / 0008）。  
worktree：`.worktrees/bu03-quick-create`

## 本会话完成了什么

### Task 1 — schema
- shared：`AgentRun.issueId` 可空；`kind` / `quickPrompt`；`CreateQuickRunInput/Result`；`CreateIssueInput` origin 字段 + refine
- DB：`agent_run.issue_id` **真实可空**（`0009_bu03_quick_create.sql` rebuild 表）；`kind` / `quick_prompt`；`issue.origin_type` / `origin_run_id`
- reshape：`toAgentRun` / `toIssue` 映射
- 连带 null-safe：web `ws.ts` / `useCancelRun` / AgentDetail issue 列（避免 typecheck 炸）

### Task 2 — quick-runs + QC 闸
- `POST /api/quick-runs` → `kind=quick_create`、`issueId=null`、`wakeRunWorker`
- `buildQuickCreatePrompt` + `resolveRunPrompt`
- worker：QC 不走 issue `buildPrompt`；completed 且 `issueId` 仍 null → `failed: quick_create: issue not created`；无 issueId 不写 comment 时间线

### Task 3 — origin link + CLI + M1
- `POST /api/issues`：`originType=quick_create` + `originRunId` → Link `run.issueId`；create 带 assignee 仍 enqueue 工作 run
- CLI：`ma issue create`（title/description|description-file、assignee、origin-run、server；`MA_SERVER_URL` / `MA_RUN_ID`）
- **fix**：enqueue 去重/乒乓计数只看 `kind=issue`，避免 QC 回链后仍 active 挡住 M1 工作 run

## 自测结果

```
$ cd app && pnpm -r typecheck
packages/shared typecheck: Done
packages/web typecheck: Done
packages/server typecheck: Done
```

DB（migrate 后 `PRAGMA table_info(agent_run)`）：
- `issue_id` 列 **notnull=0**（真实可空）
- 有 `kind` / `quick_prompt`
- `issue` 有 `origin_type` / `origin_run_id`

API smoke（PORT=3013，无真实 coding CLI；手工 origin create + CLI）：

```
GET /api/issues 200
GET /api/wiki/pages 200
GET /api/memory/status 200
GET /api/inbox 200

POST /api/quick-runs 201
  kind=quick_create issueId=null status=queued

POST /api/issues origin 201 FRI-12
  originType=quick_create originRunId=<qc>
  GET /api/runs?issueId=... → [('issue','running'),('quick_create','running')]  # M1

ma issue create ... exit 0 → FRI-13 linked + issue work run

bad originRunId → 400
SMOKE_OK
```

## 与计划的偏离

1. **enqueue 去重按 kind 过滤**（计划未写显式）：QC Link 后仍 active 时，原 `per-(issue,agent)` 去重会吞掉 M1 工作 run；已修。
2. Web 最小 null-safe（`ws` / cancel invalidate / AgentDetail）：本棒为 typecheck 与不崩，**不是** Task 4 UI。
3. QC fail 闸 `quick_create: issue not created` 依赖 backend 以 completed 退出且未 Link；smoke 未等真实 CLI 跑完（本机无可用 coding CLI 完成路径）。逻辑在 `run-worker` 已实现。
4. Inbox `notifyRunTerminal`：无 issue 的 QC 失败也会写「快速派活」文案。

## 遗留 / 下一个执行者要注意的点

- **impl-2 = plan Task 4–5**：`QuickDispatch` UI、Ctrl+K / 侧栏、runs 列表展示 kind、ws 已有基础 guard 可复用
- migration 号 **0009**（0008 已是 bu02）
- 开发库若旧 `dev.db` 在 0009 前：`pnpm --filter @ma/server db:migrate`；重建失败可删 dev.db 再 migrate+seed
- QC prompt 写死 `ma issue create` 与 assignee / origin-run / server
- 不要 commit `wiki/`、`*.db`
- 推送：`feat/bu03-quick-create`（本棒 push）

## 验收结论（仅计划者填）

- [ ] DB issue_id 可空真实
- [ ] quick-runs + QC prompt + worker
- [ ] origin link + ma issue create + M1
- [ ] typecheck + smoke
- 结论：
