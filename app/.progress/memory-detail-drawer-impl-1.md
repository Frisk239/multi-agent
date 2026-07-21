# Closeout: memory-detail-drawer

日期：2026-07-21

## 问题

记忆列表只有截断 +「展开」行内切换，长文（session 记忆 1k+ 字）难以完整阅读，功能不完整。

## 交付

| 层 | 改动 |
|---|---|
| Provider | sqlite / pgvector `getById` |
| Manager | `getById` |
| API | `GET /api/memory/:id` |
| UI | 详情抽屉：全文、ID、Issue 链、复制正文/ID、删除；`?id=` 可分享；Esc 关闭 |
| 列表 | 内容区点进详情 + 操作列「详情」 |

## 证据

- typecheck server/web 绿  
- GET 单条 textLen=1294  
- Playwright：打开详情抽屉，URL 带 `?id=`，正文与 actions 可见  
