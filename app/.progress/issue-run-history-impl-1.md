# Closeout: issue-run-history

> 自动迭代 · main · 2026-07-17

## 交付

1. `IssueRunHistory` 表：状态 / runtime / id / 时间；点击选中
2. `IssueDetail` 持有 selectedRunId；默认活跃或最新
3. `RunTrace` 改为接收选中 run（可切换回放）

## 证据

- typecheck 绿
- Playwright：`/issues/<id>` history count=3；默认选中最新 failed；点击 `run-hist-a` → selected + trace data-run-id/status 切换为 completed

## Multica

- issue 下多 task 列表 + 选中回放 ≈ 本刀

## 债

- 无（seed 仅本地验证后删除）
