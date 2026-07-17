# Closeout: inbox-bulk-read

## 证据

- typecheck 绿
- Playwright：`inbox-mark-fails-read · 20` → 点击后 strip 消失、unreadRows 0

## 交付

- `useMarkInboxReadMany`（无新 API，复用 POST /read）
- 失败条 + 页头当前列表批量已读

## 再下一刀建议

- 人指定主题；可选服务端 bulk 端点优化
