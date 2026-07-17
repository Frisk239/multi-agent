# 02 — 卡片 / 详情 / 看板筛选

**What to build:** IssueCard chips；IssueHeader 挂载 UI；Kanban 按 label 过滤；web hooks。

**Blocked by:** 01  

**Status:** resolved  

**Branch:** 继续 `feat/issue-labels`

## Acceptance

- [x] `useLabels` / create/update/delete / `useSetIssueLabels`  
- [x] 卡片展示 label 色点+名（无则不占位）  
- [x] 详情可勾选/取消标签并保存（或即时 set）  
- [x] 看板筛选：全部 + 各 label；过滤后列内只显示匹配 issue  
- [x] typecheck 绿  

## Implementation notes

- 过滤可客户端做（issues 已全量拉取）。  
- 风格对齐现有 pill / runs-filters。  

## Comments

（执行者）
