# memory-item-delete

## 用户路径
运维在 `/memory` 列表看到多余/错条目 → 点删除 → 确认 → 条目消失；Settings 记忆计数刷新。

## Must
- provider deleteById（sqlite + pgvector）
- manager.delete + DELETE /api/memory/:id
- web：useDeleteMemory + 行内删除
- typecheck + API + Playwright

## Out of scope
- 批量删除
- 软删除/回收站
