# Closeout: inbox-bulk-api

## 证据

- typecheck 绿（shared / server / web）
- API：
  - `POST /api/inbox/read-many` → 200 `{requested,updated,unreadCount}`
  - `POST /api/inbox/archive-many` → 200
- Playwright：失败全标已读 5 → strip 消失、unread 0

## 交付

- shared Zod：`MarkInboxReadMany*` / `ArchiveInboxMany*`
- server bulk 路由（注册在 `/:id` 前）
- web：`useMarkInboxReadMany` 改 bulk；新增 `useArchiveInboxMany` + 列表归档

## 决策

- 单人本地收件箱，无需事务跨用户；`inArray` + recipient 过滤即可

## 再下一刀建议

- Multica 对照：执行层可靠性 / cwd 持久化 ADR；或 runs bulk cancel
