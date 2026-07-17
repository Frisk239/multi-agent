# 01 — 服务端 issues 筛选 + 标签软归档

**What to build:** `ListIssuesQuery`；`GET /api/issues` 支持 `q`/`labelId`/`status`；migration `archived_at`；DELETE=软归档+清 junction；挂载校验活跃标签。

**Blocked by:** None  

**Status:** resolved  

**Branch:** `feat/issue-find`

## Acceptance

- [x] drizzle `0013` + journal；`issue_label.archived_at`  
- [x] `GET /api/issues` 查询参数生效  
- [x] `DELETE /api/labels/:id` 软归档并清 junction；GET labels 默认不含已归档  
- [x] `PUT .../labels` 拒绝已归档 labelId  
- [x] typecheck 绿  


## Comments

（执行中）
