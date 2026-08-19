# Closeout: agent-active-task-peek

日期：2026-08-19
实现提交：`ef4f8a0 feat(agents): show current active task`

## 交付

- `GET /api/agents` 现在批量投影 `currentIssueRun`（run id/status + Issue 标识/标题）；只选 active `kind=issue`，chat/quick-create 不会伪装成 Issue。
- roster 一次 bulk live 状态扫描加一次 active Issue join，消除列表逐 Agent 查 Run；多 Agent 投影按 `createdAt DESC, id DESC` 稳定选取最新任务。
- `/agents` 把身份链接与状态/任务链接拆开：单条 active Issue 直达 `/runs/:id`，多条 active 仍展示最新 Issue 但进入 `/runs?agent=<id>&status=active`，保留所有并行工作。
- 高频 `agent:status_changed` 广播仍使用 active + 最新终态的窄查询，不因 roster 的批量读模型扫描单 Agent 的全历史。
- 增加可隔离的 `MA_NEXT_DIST_DIR`，使本次及后续 Playwright 不与用户日常 `.next` 缓存争用。

## 证据

- shared schema：130 tests 通过；server：122 files / 1049 tests 通过；web：78 files / 520 tests 通过（`pnpm test`）。
- shared/server/web TypeScript 直接调用各包 `node_modules/typescript/bin/tsc --noEmit` 均通过。
- 真实 SQLite/Fastify 契约覆盖：最新 active Issue、chat/quick 不造标题、multi-active 计数/状态；实时单 Agent 状态查询另有回归测试。
- 隔离当前源码 Playwright 通过：单条 Issue 标题→Run detail；两条 active→Agent+active Runs 筛选且两条记录均可见。
- `node scripts/check-docs.mjs`、`git diff --check` 通过；隔离 `:3002/:3003` 已停止。

## 环境记录

- 本地 `packages/web/node_modules/.bin/tsc` 启动器缺失，原始 `pnpm check` 在 Web typecheck 启动前失败；锁文件未变，产品代码未因此修改。为确保真实覆盖，已运行同一 TypeScript 二进制的三包 typecheck 与完整 `pnpm test`。待本机依赖链接恢复后可直接重跑聚合脚本。

## 有意未做

- 不把 chat/quick-create 作为 roster 的 Issue 标题；不重做 Agent detail 或轮询机制。
- 不做全局 dashboard；若本地 Run 历史增长到显著规模，再单独评估 batch status 的索引/窗口化，不以本刀扩大为调度重构。

## 下一刀

取 `agent-direct-issue-create`：Agent 详情“分配工作”直达预填的新建 Issue，并保留独立的“查看已指派 Issue”入口；复用既有 readiness/preflight 与 enqueue 真相。
