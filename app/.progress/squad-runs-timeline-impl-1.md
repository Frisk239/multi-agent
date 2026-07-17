# Closeout: squad-runs-timeline

> 自动迭代 · main · 2026-07-17

## 交付

1. `ListRunsQuery.squadId` + server filter + `useWorkspaceRuns({squadId})`
2. `SquadRunsTimeline` 挂在小队详情
3. 行链到 Issue `#run-trace`

## 证据

- typecheck 绿
- API `?squadId=sqd-product` 返回 seed leader run
- Playwright `/squads/sqd-product`：timeline count=1，row leader=1 completed

## 债

- 本地 seed 已删；勿 commit db/wiki
