# memory-bulk-delete

## 用户路径
运维在 `/memory` 多选（或按当前筛选）批量删除多余记忆 → 确认 → 列表刷新；Settings memoryHealth 计数下降。

## Must
- server：`deleteMany` / `POST /api/memory/delete-many`（ids 上限 100）
- web：行 checkbox + 「删除所选」；可选「清空当前筛选结果」走 ids
- typecheck + API + Playwright

## Out of scope
- 软删除
- 按 kind 服务端全表 wipe 无 id
