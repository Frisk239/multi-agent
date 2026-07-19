# Closeout: settings-memory-health

## 交付
- shared：`SettingsMemoryHealth`
- server：settings status 聚合 provider/backend + total/ambient/curated + latestAt
- web：Settings「记忆层」卡片 + `/memory` 深链

## 证据
- typecheck 绿
- API：`memoryHealth` total=13 ambient=1 curated=12 provider=sqlite-text
- Playwright：`settings-memory-health` 文案含「可用 · sqlite-text · 13 条」

## 决策
- ambient 启发式：`[ambient:` / `ambient:` 前缀（与 S11 写入格式一致）
- 不改 MemoryStatus 旧契约，仅扩展 settings

## 债
- pgvector 条目数仍读 sqlite memory_item 表（本地默认 sqlite-text）

## 给下一 Owner
- 可选 memory 运营批量清理；或人定收官
