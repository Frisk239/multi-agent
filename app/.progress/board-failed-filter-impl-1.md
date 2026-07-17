# Handoff: board-failed-filter-impl-1

> 自动迭代 · main · 2026-07-17

## 交付

1. 看板工具栏 **「仅失败」** toggle（`data-testid=kanban-failed-only`）
2. URL 可分享：`?failed=1`；与 `q` / `label` / `assignee` / `priority` 可组合
3. 客户端按最近 failed runs（limit 80）的 `issueId` 集合过滤；与卡片失败标记同源
4. 样式：`.kanban-failed-toggle.active` 红色强调；board `data-failed-only`

## 证据

- typecheck `@ma/web` 绿
- Playwright：
  - 默认板 8 卡、1 失败；按钮「仅失败 1」
  - 点击 → `/?failed=1` 仅 FRI-11（`data-run-failed=1`）
  - deep link `/?failed=1&priority=high` 仍只 FRI-11
  - 再点清除 → `/?priority=high`，卡片恢复为 3

## 本地债（非产品代码）

- 本机 `dev.db` 曾落后迁移（缺 `agent_run.kind` 等）→ 手工 catch-up + watermark；**勿提交 db**
- 为验收 seed 了 `run-fri11-fail-seed` failed run

## Multica

失败工作队列一眼可滤；本仓轻量客户端筛选 + 可分享 URL。

## 再下一刀建议

- squad 成员就绪汇总（小队页 / 指派下拉）
- CmdK「仅失败看板」快捷入口
