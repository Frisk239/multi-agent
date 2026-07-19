# Closeout: memory-bulk-delete

## 交付
- shared：`DeleteMemoryManyInput/Response`
- server：`deleteMany` + `POST /api/memory/delete-many`
- web：checkbox + 全选 + 「删除所选」

## 证据
- typecheck 绿
- API：2 ids → `{deleted:2}`；空 ids → 400
- Playwright：全选 → 删除所选 · N → confirm → 列表 0

## 决策
- 复用单条 deleteById；上限 100
- 仅当前可见列表多选（筛选安全）

## 债
- 无「删除全部匹配服务端」超页能力
