# Handoff: bu03-impl-2

> 切片：`补3` / `bu03` · 角色：`impl` · 序号：`2`  
> 日期：2026-07-17

## 上下文（给下一个会话读）

补3 快速派活（Multica-style）：impl-1 已落地 schema/API/prompt/worker/`ma issue create`/origin link。  
本棒只做 plan **Task 4–5**：Web UI + ws/runs 展示 + 回归 handoff。  
分支：`feat/bu03-quick-create`  
worktree：`.worktrees/bu03-quick-create`

## 本会话完成了什么

### Task 4 — Web 快速派活 UI
- `useCreateQuickRun`：`POST /api/quick-runs`；成功 toast「已派出快速派活任务」；invalidate `agent-runs`
- 新组件 `QuickDispatchPanel`：assignee（agent|squad 下拉）+ prompt textarea；**无标题字段**；Esc / overlay 关闭
- Ctrl+K 命令「快速派活」→ 打开同一 panel；全局快捷键 **Q**（非输入态）
- 侧栏「快速派活」入口（**保留**「新建 Issue」按钮，避免砍掉既有建卡入口）
- 可选短轮询：`GET /api/runs/:id` 至 `issueId` 非空 → toast「已创建 Issue · …」
- Agent Runs Tab：增加 **类型** 列（`quick_create` / `issue`）；`issueId` null 显示「（建卡中）」不崩
- 复用 impl-1 已有 `ws.ts` null-safe（无 issueId 跳过 `['runs', issueId]`）

### Task 5 — 回归 + handoff
- `pnpm -r typecheck` 全绿
- API 回归 200；`POST /api/quick-runs` 201 `kind=quick_create` `issueId=null`
- 更新 phase4b 进度表补3 状态
- 本 handoff

## 自测结果

```
$ cd app && pnpm -r typecheck
packages/shared typecheck: Done
packages/web typecheck: Done
packages/server typecheck: Done
```

API smoke（PORT=3023，临时 DB_PATH=bu03-impl2-smoke.db，**未提交**）：

```
GET /api/issues 200
GET /api/wiki/pages 200
GET /api/memory/status 200
GET /api/inbox 200

POST /api/quick-runs 201
  kind=quick_create issueId=null status=queued

GET /api/runs/:id 200（issueId null 不崩）
GET /api/agents/agt-lead/runs → 含 kind=quick_create / issueId null 行
```

注：本机未配 `MA_WORKSPACE_CWD` 时 QC worker 会 failed（环境，非 UI）；UI 提交路径与列表 null-safe 已覆盖。

## 与计划的偏离

1. **侧栏保留「新建 Issue」**：计划写侧栏「快速派活」入口；未替换掉原有新建，改为两个按钮（快速派活 + 新建 Issue），避免砍掉 `/?new=1` 路径。
2. **短轮询 toast 用 issueId 前缀**：无 identifier 联表时避免额外 GET issue；足够验收「已建卡」。
3. **未改 migration / CLI / quick-runs 核心**（按分工）。

## 遗留 / 下一个（计划者）要注意的点

- 计划者验收本文件（Task 4–5 + 回归）
- 人评：起 `pnpm dev`，侧栏或 Ctrl+K → 快速派活 → 选 agent + 一句话 → toast；Agent 详情 Runs 见 `quick_create`
- 整刀可开 PR 前：建议计划者写 `bu03-planner-2` 整刀总结；新会话 code review
- 勿 commit `wiki/`、`*.db`（本棒已避免）
- 勿 push main

## 验收结论（仅计划者填）

- [x] UI 可提交 quick-run（无标题）— QuickDispatchPanel + useCreateQuickRun  
- [x] Ctrl+K + 侧栏同一组件 — 另保留「新建 Issue」（偏离可接受）  
- [x] runs/ws null issueId / kind 展示不崩 — Agent Runs 建卡中 + poll  
- [x] typecheck + issues/wiki/memory/inbox 200 — 计划者复验 typecheck；smoke 采信  
- [x] 无 wiki/db 误提交  
- 结论：**impl-2 达标；整刀补3（Task 1–5）达标，允许开 PR 合 main**
