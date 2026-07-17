# Handoff: squad-readiness-summary-impl-1

> 自动迭代 · main · 2026-07-17

## 交付

1. **小队列表**：Leader 就绪 chip 列（`data-testid=squad-leader-readiness`）
2. **小队详情**：侧栏成员就绪汇总（ready/busy/阻塞计数）+ roster chip + 队长阻塞诊断链
3. Members 勾选行同步显示 readiness；Leader 下拉带就绪 hint
4. 复用 `useAgentsReadinessMap` + 既有 chip 样式

## 证据

- typecheck `@ma/web` 绿
- Playwright `/squads`：3 行队长均为 `cwd_missing` /「cwd 未配置」
- Playwright `/squads/sqd-product`：`data-bad=4`、队长阻塞提示、roster 4 人 chip

## Multica

小队协作前先看执行健康；本仓轻量客户端聚合。

## 再下一刀建议

- CmdK「仅失败看板」快捷
- AssigneeSelect 小队选项展示成员阻塞摘要（非仅队长）
