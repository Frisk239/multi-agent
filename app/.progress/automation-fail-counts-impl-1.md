# Closeout: automation-fail-counts

> 自动迭代 · main · 2026-07-17

## 交付

- AutomationRule.failCount / lastRunStatus
- list/get/create/patch 聚合
- UI「执行」列：失败 N / 最近 status

## 证据

- typecheck 绿
- API seed 2 failed + 1 success → failCount=2 last=success
- Playwright：fail-count-demo 显示「失败 2」

## 债

- demo 规则已删
