# Handoff: issue-labels-impl-1

> 切片：`issue-labels` · 角色：Slice Owner · 2026-07-17  
> 分支：`feat/issue-labels`

## 交付

票 01–03 同会话：Issue 标签目录 + 挂载 + 看板筛选（phase4b H 轻量；无 parent/attach）。

### 后端
- drizzle `0012_issue_labels`：`issue_label` / `issue_to_label`（学 multica 简化，仅 issue）
- `GET/POST /api/labels`，`PUT/DELETE /api/labels/:id`
- `PUT /api/issues/:id/labels` 全量替换
- `toIssue(..., labels)` + `loadLabelsByIssueIds` 批量装载
- seed：bug / 文档 / 产品 + FRI-11/09/08 挂载

### 前端
- hooks：`useLabels` / create·update·delete / `useSetIssueLabels`
- `IssueCard` chips；`IssueLabelsEditor` 详情挂载+创建
- `KanbanBoard` 按 label 筛选 pill

### 债补偿（同分支）
- `app/.progress/wiki-memory-ops-intake.md`（有条件通过）
- `CONTEXT.md` 方位：prev=`wiki-memory-ops`，本刀=`issue-labels`

## 证据

- `pnpm -r typecheck` 绿（shared/web/server）
- API smoke（临时 DB PORT=3045）：
  - `GET /api/labels` ≥3
  - issues 含 `labels`；FRI-11 有 产品+文档
  - POST label · PUT set · PUT clear · DELETE 204
  - issues / labels / settings / wiki / memory / runs / inbox 200

## 偏离

- 无功能偏离。标签管理不做独立大页（详情内创建+挂载）。

## 未做 / 债

- 未浏览器手点看板筛选 / 详情勾选
- 无 parent / attach / agent·skill labels
- 删除 label 靠 FK cascade；无软删除
- 看板筛选仅客户端

## 下一步（人）

1. `git push -u origin feat/issue-labels`  
2. CI + 分支 `/code-review` vs `origin/main`  
3. 远程合并 main  
4. 勿 commit `wiki/` `*.db` `app/packages/server/wiki/`
