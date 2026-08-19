# Closeout: G8-2 · 崩溃后 CLI execution ownership

日期：2026-08-17  
Spec：`.scratch/g8-trust-execution/spec.md` §G8-2 · `kickoffs/G8-2-execution-ownership.md`

## 交付

- 采用 **B：`run_execution_owner` 活动侧表**。`agent_run` 保持业务生命周期；仅在 OS 子进程仍活动期间保存 `run_id → pid + 启动指纹 + cwd + recorded_at`，正常 settle 后删除。
- 新增迁移 `0053_run_execution_owner.sql` 和 Drizzle schema；不保存 argv、环境变量或密钥。
- `spawn-line`、Pi、ACP transport 在真实 child PID 可用时上报；POSIX spawn 建立独立 process group，恢复时仅在进程组仍与 pid 相符时才允许 tree kill。
- 启动 recovery：
  - 当前 OS 身份与落库指纹相符 → 调 `killProcessTree`，终态为 `orphan_termination_attempted`；文案只说“已请求终止”，不假称已完全清理。
  - 无 owner、身份不可读、PID 复用/指纹不符、或不安全的 process group → **不杀**，终态 `unknown_external_execution`，写 logger、Run 失败事件和 Inbox terminal notification。
- Run UX 以持久化 `failureReason` 优先于旧错误文本分类：显示“外部执行状态待确认”、明确“为避免误杀未自动终止”，并提供“打开环境诊断”直达 `/settings`。Run 列表、事件时间线、状态栏、聊天失败提示和 WS toast 也共用该显式分类。

## 参考与取舍

- 调研报告：`.scratch/g8-trust-execution/research-execution-ownership.md`。
- Multica 的 DB lease/recovery 证明“恢复不能依赖内存 PID”；Pi 的 in-memory child 生命周期证明本仓原实现无法跨主进程重启。
- 本仓不移植 daemon/多节点协议：单机 SQLite + 独立短生命周期 sidecar 足够；安全策略是“证据不足即人工确认”。

## 证据

- `pnpm --filter @ma/server typecheck`：通过。
- 目标回归：
  `process-identity`、`execution-ownership`、`stale-runs`、`run-worker`、各 backend PID observer、migration test 共 **8 files / 109 tests** 通过。
- 全量：`pnpm check` 通过：shared **122**、server **975**、web **476** tests，三个 package typecheck 均通过。
- Playwright（隔离临时 SQLite，已迁移并 seed；未使用/修改本机默认 dev DB）：
  1. 打开 `http://localhost:3100/runs/run-g8-ui-unknown`，断言显示 failure chip“外部执行待确认”。
  2. 断言 failure box 为“外部执行状态待确认”，并包含“为避免误杀，它没有被自动终止”。
  3. 点击 `run-detail-failure-settings`，确认导航至 `http://localhost:3100/settings`；浏览器控制台 0 errors（只保留开发期 warning）。

## 偏离 / 限制 / 合并注意

- 无规格偏离。
- Linux 指纹 = boot ID + `/proc/<pid>/stat` start tick，并额外验证 PGID；Windows 指纹 = `Win32_Process.CreationDate` 的 hash。其他平台或读取失败统一 fail-closed，不自动 kill。
- Windows `taskkill /T /F` 是“请求清理”而非完成证明，因此保留人工检查 cwd 的 UX。
- 本机既有开发 DB 尚未运行 `0053` 时，新版本会安全降级并记录 warning；合入/部署前须执行 `pnpm --filter @ma/server db:migrate`。本次为避免触碰既有本地运行数据，没有替用户迁移默认 DB。
- 当前 worktree 已有大量非本刀 WIP，尚未 commit/push；不要把它们与 G8-2 混合提交。

## 给下一 Owner

- 首先抽查 `stale-runs.test.ts` 的 confirmed kill / mismatch no-kill 断言，以及 Run detail 的 `unknown_external_execution` 真实浏览器路径。
- 推荐下一刀：G8-3（旧密钥清库 + envRef fail-closed）；它与 G8-2 的运行时安全边界直接相邻，但先审查现有 hard-gap WIP，避免重复实现。
