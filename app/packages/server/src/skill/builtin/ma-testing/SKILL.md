---
name: ma-testing
description: 本仓怎么验：pnpm check、隔离 DB、e2e 无服 SKIP、Playwright 关刀。不要污染用户 dev.db。
---

# 测试与验收

## 本机命令

1. `pnpm check`（在 `app/`）= typecheck + 三包 vitest。关刀硬门。
2. 定向 vitest：改哪测哪，先于全量。
3. Playwright / `cd app/packages/server && pnpm e2e --filter <面>`：需要 `:3000` + `:3001`。**无服必须 SKIP，不许假绿。**

## 数据库

- 验收用隔离 `DB_PATH`（如 `e2e-playwright.db`），先 `db:migrate` 再 `db:seed`。
- **不要**拿用户默认 `dev.db` 当实验场；合入后提醒 `db:migrate`（若有新 migration）。

## 关刀要写进 progress 的

- 跑过的命令原文
- 绿/红摘要
- 没跑的（例如无服 e2e）必须标明，不能写成已过。
