# Handoff: issue-find-impl-1

> 切片：`issue-find` · 角色：Slice Owner · 2026-07-17  
> 分支：`feat/issue-find`

## 交付

同会话：补偿 `issue-labels` 债 + 加厚「全局找 Issue」（候选 B）。

### 后端
- drizzle `0013_issue_find`：`issue_label.archived_at`
- shared：`ListIssuesQuery`；`IssueLabel.archivedAt`
- `GET /api/issues?q=&labelId=&status=`（identifier/title/description 子串；label 须活跃）
- `DELETE /api/labels/:id` = **软归档 + 清 junction**（幂等 204）
- `GET /api/labels` 默认仅活跃；`?includeArchived=1` 含归档
- 挂载拒绝已归档 labelId

### 前端
- `useIssues(params)` 带 queryKey
- `KanbanBoard`：搜索框 + label pill；URL `?q=&label=` 驱动服务端筛选
- `CommandPalette`：防抖服务端 Issue 搜；Agents 名匹配跳转；↑↓ + Enter；分组标签
- `IssueLabelsEditor`：归档确认按钮

### 文档
- `.scratch/issue-find/spec.md` + issues 01–03
- `CONTEXT.md`：prev=`issue-labels` intake；本刀=`issue-find`
- 含 `app/.progress/issue-labels-intake.md`（上一刀 intake，本分支一并带上）

## 证据

- `pnpm typecheck`（`app/`）：shared / web / server **全绿**
- API smoke（临时 DB PORT=3051）：
  - labels 3 活跃 `archivedAt=null`
  - `?labelId=lbl-product` → FRI-09 / FRI-11
  - `?q=FRI-11` → FRI-11；`?q=PRD` → FRI-09/11
  - DELETE `lbl-docs` → 204；目录剩 产品/bug；includeArchived 见文档.true
  - FRI-11 仅剩「产品」；再挂 `lbl-docs` → 400；`?labelId=lbl-docs` → 400
  - issues / labels / settings / wiki / memory / runs / inbox **200**
- 浏览器：本会话未完整 `pnpm dev` 手点；以 API + 代码路径为准（人评可 Ctrl+K / 看板搜一次）

## 偏离

- 无功能偏离相对已拍板 Must。
- unarchive UI 未做（spec out of scope；同名归档后 POST 409 提示）。

## 未做 / 债

- 未浏览器手点 CmdK ↑↓ / 看板 URL 刷新
- 无 unarchive / 物理删除
- `q` 仍为进程内 filter（SQLite 本地量级 OK；非 FTS）
- 看板 drag 乐观更新仍可能与筛选 cache 交错（沿用 invalidate 前缀）

## 下一步（人）

1. `git push -u origin feat/issue-find`  
2. CI + 分支 `/code-review` vs `origin/main`  
3. 远程合并 main  
4. 勿 commit `wiki/` `*.db` `app/packages/server/wiki/`
