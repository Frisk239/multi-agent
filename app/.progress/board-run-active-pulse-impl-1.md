# Handoff: board-run-active-pulse-impl-1

> 自动迭代 · main · 2026-07-17

## 交付

Kanban 拉 running+queued runs → `data-run-active` / `issue-card--run-active` 脉冲 +「运行中」pill；与失败标记并存时活跃优先。

## 证据

Playwright：FRI-07 active=1 pulse class；FRI-11 failed=1。

## 再下一刀建议

- 仅失败筛选工具栏计数说明
- 详情页运行中状态与看板一致的 live 进度条入口
