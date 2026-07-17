# Handoff: bu04-impl-1

> 切片：`补4` / `bu04` · 角色：`impl` · 序号：`1`  
> 日期：2026-07-17

## 上下文（给下一个会话读）

补4 G0 Settings 只读环境诊断。本棒只做 plan **Task 1–2**（shared 契约 + `GET /api/settings/status`），**不做 Web UI**。  
真源：`docs/superpowers/specs/2026-07-17-bu04-settings-design.md`、`docs/superpowers/plans/2026-07-17-bu04-settings.md`。  
分支 / worktree：`feat/bu04-settings` / `.worktrees/bu04-settings`。

## 本会话完成了什么

- **Task 1：** `app/packages/shared/src/schema.ts` 增加  
  `SettingsCheckStatus` / `SettingsOverall` / `SettingsCheck` / `SettingsStatusResponse`（`index.ts` 已 re-export `*`，无需改）  
  Commit：`480760f feat(bu04): shared SettingsStatusResponse contract`
- **Task 2：**  
  - 新建 `app/packages/server/src/routes/settings.ts`：`buildSettingsStatus()` + `settingsRoutes`  
  - `app.ts` 注册 `settingsRoutes`  
  - checks：cwd / runtime:* / wiki_llm / embedding / memory / server  
  - overall：仅 **cwd error → `blocked`**；其它 error/warn → `degraded`；全 ok → `ok`  
  - secrets 仅 boolean；响应不回传 API key  
  Commit：`0ce212b feat(bu04): GET /api/settings/status diagnostics`

## 自测结果

```
$ cd app && pnpm -r typecheck
packages/shared typecheck: Done
packages/web typecheck: Done
packages/server typecheck: Done
```

Smoke（Fastify `inject`，临时脚本未入库）：

| 场景 | overall | cwd | secrets | 密钥泄漏 |
|---|---|---|---|---|
| 无 `MA_WORKSPACE_CWD` | `blocked` | error「未配置」 | wiki/embed true（假 key 仅测布尔） | none |
| `MA_WORKSPACE_CWD=process.cwd()` | `degraded`（本机 memory 未 init → memory error） | ok | 同左 | none |
| CWD 路径不存在 | `blocked` | error「路径不存在」 | 同左 | none |

- HTTP 200；`SettingsStatusResponse.safeParse` 通过  
- 假 key `sk-test-…` / `sk-embed-…` **未**出现在 JSON body  
- `check_ids` 含：`cwd`, `runtime:claude-code`, `runtime:opencode`, `runtime:cursor`, `wiki_llm`, `embedding`, `memory`, `server`

说明：smoke 用 `buildApp()` 直注入，**未**走 `index.ts` 的 `initMemoryProvider()`，故 `memory` 常为 unavailable/error——属 smoke 环境差异，不是路由 bug；真实 `pnpm dev` 启动后应反映 sqlite-text/pgvector 状态。

## 与计划的偏离

- 无契约/API 行为偏离。  
- smoke 用 inject 脚本而非长期挂 `curl` 起 server（更稳、不占端口）；脚本未提交（计划未要求入库测试）。  
- 未更新 phase4b 进度表（plan Task 4 / impl-2 回归棒）。

## 遗留 / 下一个执行者要注意的点

- 同分支 `feat/bu04-settings` pull 后做 **Task 3–4**：`useSettingsStatus`、`SettingsPage`、`/settings`、Sidebar + CommandPalette、回归、`bu04-impl-2.md`。  
- **无 migration**；勿 commit `wiki/`、`*.db`。  
- G0：UI 只读，无表单写 env；runtime 行链 `/runtimes`。  
- 本机起 server 验收建议：先设 `MA_WORKSPACE_CWD` 再 `curl /api/settings/status`，对比无 CWD 时 `overall=blocked`。  
- `memoryManager` 须在 server 启动路径 init 后才 `available`；诊断页以真实 dev 进程为准。

## 验收结论（仅计划者填）

- [x] shared 契约符合 spec — SettingsOverall/Check/StatusResponse  
- [x] `GET /api/settings/status` 200 + shape — buildSettingsStatus + register  
- [x] 无密钥字段；假 key 不进 body — secrets 仅 boolean；smoke 采信  
- [x] 无 CWD → overall `blocked` — 仅 cwd error 触发 blocked  
- [x] typecheck 通过 — 计划者复验全绿  
- [x] 未做 Web UI（符合 impl-1 范围）  
- 偏离可接受：inject smoke 未 init memory → memory error（handoff 已说明）  
- 结论：**impl-1 达标，允许进入 impl-2（Task 3–4）**
