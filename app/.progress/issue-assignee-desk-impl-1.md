# Handoff: issue-assignee-desk-impl-1

> 切片：`issue-assignee-desk` · 角色：Slice Owner · 2026-07-17  
> 分支：`feat/issue-assignee-desk`

## 交付

A1 厚路径：服务端按指派筛 Issue + 看板 `?assignee=` + 侧栏「我的 issue」。

### 后端 / 契约
- shared：`ListIssuesQuery` 扩展 `assigneeType`+`assigneeId`（成对）、`unassigned`、`assigned`；互斥 `superRefine`
- `GET /api/issues`：进程内 filter（与 issue-find 同模式）

### 前端
- `useIssues` / queryKey / URL 传参含指派字段
- `KanbanBoard`：指派 `<select>`；URL 紧凑 `assignee=agent:|squad:|none|any`
- `Sidebar`：工作区「我的 issue」→ `/?assignee=any`；与 Issues 高亮区分

### 文档
- `.scratch/issue-assignee-desk/spec.md` + issues 01–03
- `CONTEXT.md`：prev=`issue-find` intake；本刀=`issue-assignee-desk`
- 含 `app/.progress/issue-find-intake.md`（上一刀 intake）

## 证据

- `pnpm typecheck`（`app/`）：shared / web / server **全绿**
- API smoke（临时 DB PORT=3053）：
  - `assigneeType=agent&assigneeId=agt-prd` → FRI-09
  - `assigneeType=squad&assigneeId=sqd-product` → FRI-05 / FRI-11
  - `unassigned=1` → FRI-04 / FRI-08
  - `assigned=1` → 6 条（不含未指派）
  - 缺对 / unassigned+assignee / assigned+具体 → **400**
  - `assigned=1&q=PRD` → FRI-09 / FRI-11
  - issues / labels / settings / wiki / memory / runs / inbox **200**
- 浏览器：本会话未完整 `pnpm dev` 手点；以 API + 代码路径为准

## 偏离

- 无功能偏离相对已拍板 A1 Must。

## 未做 / 债

- 未浏览器手点侧栏 / 看板 select / URL 刷新
- 真·登录「当前人」未做（刻意；`any` = 任一 agent/squad）
- 「我创建的」creator 筛选 out of scope
- 筛选仍为进程内 filter（本地量级 OK）

## 下一步（人）

1. `git push -u origin feat/issue-assignee-desk`（若本会话已 push 可跳过）  
2. CI + 分支 `/code-review` vs `origin/main`  
3. 远程合并 main  
4. 勿 commit `wiki/` `*.db` `app/packages/server/wiki/`  
5. Shell 连 GitHub 需代理 `http://127.0.0.1:7890`（本机环境）
