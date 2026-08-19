# Closeout: Runs 列表返回锚定

日期：2026-08-19  
Slug：`g37-runs-scroll`

## 用户路径

`/runs` 点一行进详情 → 后退 → 仍高亮并滚到刚打开的那行（sessionStorage，复用 issue-list-scroll-restore）。

## 证据

- web typecheck
- Playwright `e2e-g37-runs-scroll.mts` PASS
