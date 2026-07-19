# Closeout: memory-item-delete

## 交付
- provider `deleteById`（sqlite + pgvector）
- `memoryManager.deleteById` + `DELETE /api/memory/:id`
- web：`useDeleteMemory` + Memory 表「删除」列

## 证据
- typecheck 绿
- API：POST 创建 → DELETE 200 → 404 再删；搜索 0 条
- Playwright：`/memory?q=ui-delete-smoke-item` 见删除按钮 → confirm → 空列表

## 决策
- 硬删除；确认对话框；失败 404/501/503

## 债
- 无批量删除 / 软删除

## Multica
- 本地记忆可运维清理，贴近控制台日常可用
