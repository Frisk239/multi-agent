# Closeout: board-origin-filter

> 自动迭代 · main · 2026-07-17

## 交付

1. `ListIssuesQuery.originType` + server filter  
2. 看板 `?origin=` 下拉 + `data-origin-filter`  
3. IssueCard 来源微标 `自动` / `QC`

## 证据

- typecheck 绿  
- API automation=3 / all=11  
- Playwright `/?origin=automation`：3 卡全部 data-origin=automation，badge「自动」；切全部来源 → 11 卡

## 债

- 无
