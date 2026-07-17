# 01 — Label schema + API + Issue.labels

**What to build:** migration `issue_label` / `issue_to_label`；shared 类型；labels CRUD；`PUT /api/issues/:id/labels`；list/detail 返回 `labels`；seed。

**Blocked by:** None  

**Status:** resolved  

**Branch:** `feat/issue-labels`

## Acceptance

- [x] drizzle `0012` + journal；schema 表存在  
- [x] `GET/POST /api/labels`，`PUT/DELETE /api/labels/:id`  
- [x] `PUT /api/issues/:id/labels` `{ labelIds: string[] }` 全量替换  
- [x] `Issue.labels: IssueLabel[]` 在 list 与 detail  
- [x] seed ≥3 标签并挂到 ≥1 issue  
- [x] typecheck 绿  

## Implementation notes

- 学 multica 简化：仅 issue；`color` 默认 `#6b7280`。  
- 删除 label 时 junction cascade。  
- reshape 批量 load，勿每 issue 单独 query 无缓存。  

## Comments

（执行者）
