# Handoff: inbox-filter-url-impl-1

> 自动迭代 · main · 2026-07-17  
> 选型：Inbox **?read=&kind=** URL mirror（客户端筛列表；可分享）

## 交付

- `InboxPage`：Suspense + searchParams；已读/类型筛选  
- `data-inbox-read` / `data-inbox-kind`  
- 样式 `.inbox-filters`  

## 证据

- typecheck 绿  
- Playwright：`?read=unread` 仅未读；`?kind=run_failed` 仅失败；select 写回 `read=unread`  

## 下一刀建议

Wiki/Memory 日常路径；或 inbox 服务端 unread 查询参数。
