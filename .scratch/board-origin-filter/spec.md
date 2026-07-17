# board-origin-filter

## 用户路径

看板用 `?origin=automation|quick_create` 筛来源；卡片显示来源微标；CmdK/筛选项可分享 URL。

## Must

1. `ListIssuesQuery.originType` + server filter  
2. Kanban URL `origin=` + 下拉  
3. IssueCard 小徽章（automation/QC）  
4. Playwright：筛 automation 后卡片带 origin 标记
