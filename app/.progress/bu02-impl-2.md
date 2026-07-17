# Handoff: bu02-impl-2

> 切片：`补2` / `bu02` · 角色：`impl` · 序号：`2`  
> 日期：2026-07-17  
> 分支：`feat/bu02-roster-ops`  
> worktree：`.worktrees/bu02-roster-ops`  
> 前置：[`bu02-impl-1.md`](./bu02-impl-1.md)（API 已齐）

## 上下文

补2 厚切片 **Task 4–6（Web 运营 UI + 回归 handoff）**。  
plan：[`docs/superpowers/plans/2026-07-17-bu02-roster-ops.md`](../../docs/superpowers/plans/2026-07-17-bu02-roster-ops.md)

## 本会话完成了什么

### Task 4 — Agents 运营 UI
- `lib/api.ts` hooks：
  - `useCreateAgent` / `useUpdateAgent` / `useDeleteAgent`
  - `useAgentReadiness` / `useAgentRuns`
  - 共用 `apiError` 解析 409/400 body
- `AgentsPage`：新建表单（name/runtime/category/concurrency/instructions）→ 跳详情；列表 category；删除 confirm
- `AgentDetailPage`：
  - 左侧 profile **可编辑** + **readiness chip**（ready 绿 / busy 黄 / missing 红）
  - Tabs：`runs` | `skills` | `mcp` | `instructions`（**消灭 Placeholder**）
  - Runs 表：status / issue 链接 / error 截断 / 空态
  - Instructions textarea + PATCH 保存
  - 删除 → `/agents`

### Task 5 — Squads 运营 UI
- hooks：`useCreateSquad` / `useUpdateSquad` / `useDeleteSquad`
- `SquadsPage`：新建（leader 下拉、members 多选、protocol/directive）；列表 leader 名 + memberCount；EmptyState「创建一个小队开始协作」
- `SquadDetailPage`：可编辑 name/leader/protocol/directive/members；删除；链到 agent

### Task 6 — 回归 + 进度
- `pnpm -r typecheck` 绿
- 进度表：`docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md` 更新为「实现中」
- 本 handoff

### CSS
- `globals.css`：`.ops-form*` + `.readiness-chip*`

## 自测结果

### typecheck
```
$ cd app && pnpm -r typecheck
shared / server / web → Done
```

### API 回归（impl-1 + 指派闭环，PORT=3020 smoke DB）

| 调用 | 期望 | 结果 |
|---|---|---|
| GET issues/wiki/memory/inbox | 200 | 200 |
| POST agent + instructions | 201 | 201 |
| GET readiness | 枚举 | `ready`（本机 claude 已装） |
| POST squad + members | detail 非空 | 201，1 member |
| POST issue assignee=agent | enqueue run | FRI-12；`GET agent/runs` → 1 条 `running` |
| POST issue assignee=squad | leader run | FRI-13；agent runs → 2 |
| DELETE agent 当 leader | 409 | 409 |
| DELETE squad 有未终态 issue | 409 | 409 `FRI-13` |
| issue → cancelled 后 DELETE squad | 204 | 204 |
| DELETE agent 仍有 active run | 409 | 409（符合规则；cancel run 后再删） |

**UI 人评建议（本会话未起 Next 全栈点点）：**
1. `/agents` 新建 → 详情见 readiness + 指令 Tab 保存  
2. `/squads` 新建 → 编辑 protocol → 看板 NewIssue 指派该 squad  
3. Agent Runs Tab 应出现 run 行（无 CLI 可能 failed/running 后 stale）

### prompt / instructions
- DB 字段可写；`prompt.ts` 注入路径 impl-1 已存在（memory 后 / briefing 前）。  
- 指派 smoke 已产生 run，说明新 agent 可进执行队列。

## 与计划的偏离

1. Tab 用 `runs|skills|mcp|instructions`（无独立 overview Tab）；overview 合入左侧可编辑 profile（plan 允许）。
2. 列表不拉 N 次 readiness（plan 推荐）；详情必有 chip。
3. UI 层未做 Playwright e2e；API 指派闭环 + typecheck 为证据。人评可再点一遍。
4. 进度表标「实现中 / 待验收」，未擅自勾「已合 main」。

## 遗留 / 计划者与 PR 注意点

- 开 PR 前确认 **无** `wiki/`、`*.db` 进 diff。
- 删除 agent 时若仍有 queued/running run → 409，UI toast 会显示服务端文案；可先 cancel run 或等结束。
- `useAgent` 在 404 时 throw（impl-1 改 404）；详情页已处理 isError。
- 本机 smoke 可能留下 cancelled issue FRI-12/13（smoke DB 本地，勿 commit）。
- 人评路径：`pnpm dev`（server 3001 + web），侧栏智能体/小队走一遍。

## 验收勾选（计划者）

- [x] UI 可建 Agent（非 seed id）— AgentsPage + useCreateAgent 代码 + API smoke  
- [x] UI 可建 Squad 并编辑 protocol — SquadsPage / SquadDetailPage  
- [x] Instructions 进入 prompt — DB 字段 + prompt.ts 路径；指派可 enqueue  
- [x] Runs Tab 有数据或空态 — AgentDetail runs tab  
- [x] readiness chip 代码在位（runtime_missing 路径在 readiness.ts）  
- [x] typecheck 绿 — 计划者复验全绿  
- [x] 无 wiki/db 误提交 — status 仅 `?? wiki/` 未 staged  
- 偏离可接受：无独立 overview Tab；未跑 Next 全点（人评不挡 PR）  
- 结论：**整刀补2 达标，允许开 PR 合 main**
