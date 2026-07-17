# Handoff: run-observability-impl-1

> 切片：`run-observability` · 角色：Slice Owner · 2026-07-17  
> 分支：`feat/run-observability`

## 完成

票 01–03 同会话交付（API + UI + smoke）。

### API / 编排
- `GET /api/runs`：`issueId` 可选；`status` / `agentId` / `kind` / `limit`
- `POST /api/issues/:id/rerun`（body 可选 `runId`）
- `POST /api/runs/:id/retry`（failed|cancelled；QC 无 issue → 400）
- `rerunIssue` / `retryRun` 新行；`rerun_of_run_id` migration 0011
- `classifyRunFailure`（shared）

### UI
- `/runs` + 侧栏/CmdK「运行」
- Issue `RunStatusBar` 失败分类 + 再执行 Issue/此 run
- Agent Runs 再执行；Inbox 无 issue 的 run_failed → `/runs`

## 证据

- `pnpm -r typecheck` 绿  
- API smoke PORT=3022 临时 DB：list / rerun 201 / retry 201 + `rerunOfRunId` / QC retry 400 / issues·inbox·settings·wiki·memory·automation 200  

## 偏离

- 无

## 下一步（人）

1. `git push -u origin feat/run-observability`（若本会话已 push 则跳过）  
2. CI typecheck + 可选 `/code-review` 对照 `origin/main...feat/run-observability`  
3. 远程合并进 main  
4. 勿 commit `wiki/` / `*.db` / `.playwright-cli/`
