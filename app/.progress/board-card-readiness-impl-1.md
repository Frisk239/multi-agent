# Handoff: board-card-readiness-impl-1

> 自动迭代 · main · 2026-07-17

## 交付

1. **看板卡片就绪点**：指派 agent/squad（leader）时彩色点（ok/warn/bad）+ title  
2. **失败标记**：最近 failed run 的 issue 显示「失败」+「诊断」链到详情  
3. **失败闭环**：详情 Run 失败区增加 **再执行**（`run-fail-rerun`）

## 证据

- typecheck 绿  
- Playwright 看板 FRI-11：`data-readiness=bad`、`data-run-failed=1`、ready 点与诊断链  
- Playwright 详情：失败区有再执行 + 诊断 /settings  

## Multica

看板一眼看执行阻塞与失败；本仓轻量点位 + 失败回环。
