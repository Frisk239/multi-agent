# P2 波次 · 关刀 closeout（2026-08-01）

> 分支 `feat/issue-workbench` · 计划 [p2-wave-plan-2026-08-01](./p2-wave-plan-2026-08-01.md) · 来源：对照审计报告 P2 项（B2 已随 comment-routing `740f644` 合入，未入本波次）

## 波次完成情况

| 刀 | commit | 验收证据 | 状态 |
|---|---|---|---|
| **P2-1** F1 快捷键设置页 | `69b97b1` | SettingsPage.test.tsx 2 例（nav 条目渲染 + openHelp 调用不切 tab）+ typecheck | ✅ |
| **P2-2** B4 登录 shell fallback | `68b6c66` | detect-path.test.ts **15 例**（env 优先回归 / which 命中 / 登录 shell 命中 / 空输出 / 非绝对路径 / 超时 / $SHELL 缺失与白名单 / 不安全名 / 多候选 / win32 MSYS 转换与补探）+ **真机 Git Bash `-ilc` E2E**（仅登录 profile PATH 的候选被兜底发现） | ✅ |
| **P2-3** B5 Wiki 跨项目索引 | `744c593` | query.test.ts **5 例**（单根回归 / 跨根命中 / slug 冲突 cite 归属 / 无 key 降级×2）| ✅ |
| **P2-4** 运行时连接不上的自动改派 | `1360bb5` | auto-retry.test.ts **21 例** + AgentDetailPage.test.tsx 3 例 + **真实链路 e2e 11 PASS**（改派 lineage / 原 run 错误注明 / 深度 1 不递归 / activity+inbox）| ✅（2026-08-01 人解禁 + 改设计） |

**波次终验：** server vitest 74 文件 / **593 用例全绿**；`pnpm -r typecheck` 三包全绿。

## 关键实现摘要

- **P2-1**：Settings 左栏「我的账号」组加「快捷键」nav 条目 → `useShortcuts().openHelp()`（弹层全局挂 layout，`?` 同款），不切 tab、不建第二套弹层。
- **P2-2**：`resolveCmd` 探测链加第三步 —— `$SHELL -ilc` 单次探测（multica `resolveAgentsViaLoginShell` 语义移植）：POSIX shell 白名单、`SAFE_CMD_NAME`、`unalias/unset -f` 破 Git Bash 别名遮蔽（实测 `alias node='winpty node.exe'` 必废兜底）、`cd+pwd -P` 折叠 fnm/nvm multishell、8000ms 超时、失败静默；win32 下 MSYS `/c/...`→`C:/...` 转换 + `.exe/.cmd` 补探（npm shim）。
- **P2-3**：`queryWiki` 显式 `roots:'all'` 跨根（global + 有效 project 根），默认单根行为不变；候选/引用带根 label（slug 跨根冲突可区分）；**顺带修复**：无 `WIKI_LLM_API_KEY` 时 query 原会硬 500，新增关键词直出降级（只吞该错误）。
- **P2-4**：`agents.fallback_agent_id` + `agent_runs.escalated_from_run_id`（迁移 0045 + 唯一索引幂等）。**人解禁**（2026-08-01）并拍板：agent 显式配置 fallback + 任务级兜底（不碰 issue.assignee）；**不做 Multica fire_at 竞速**，复用 auto-retry 基建——连接不上类失败（`runtime_offline` 预算用尽 ∪ 「CLI 未安装」/`spawn ENOENT` 首次失败即改派）→ 给 fallback 生成新 queued run（attempt 归零、squad 清空、`escalated_from_run_id` 追溯），原 run error 注明改派去向 + activity `run_escalated` + inbox 通知；深度 1 防循环；`exit 1`/timeout 等执行失败不改派（防误伤）。**触发面修正**（Owner 验收发现）：CLI 未安装/ENOENT 归 `exec_error` 且不进 auto-retry，原实现会全部拒绝——扩展 `isConnectionFailure` 判定后真实链路 e2e 跑通。
- **P2-4 边界事实**：enqueue 硬闸（runtime_missing）会在建 run 前挡掉「探测不到 CLI」的场景（inbox 提醒 + readiness 面板兜着）；自动改派覆盖「run 已建后才连不上」（detect 缓存命中后 spawn 失败 / 间歇性）。两条防线互补，非缺陷。

## Remaining / 后续

- Wiki 跨根 **UI 开关**（WikiQueryDialog）+ CLI `ma wiki query --roots`：非一行透传，未做（P2-3 Out 范围）
- P2-3 顺带降级若需回退：删 `query.ts` Step 2/4 的两个 catch（closeout 已记，回退成本低）
- P2-4：run 详情 UI 未消费 `escalatedFromRunId`（可标「由 run X 改派而来」）；claim 前「agent 无 runtime」路径由 enqueue 硬闸 + inbox 兜着（Out 范围）

## 关刀规范核对

- ✅ 每刀 vitest + typecheck 全绿；e2e：P2-2 真机实测（登录 shell 路径），P2-4 真实链路 11 PASS（改派 lineage/深度 1/activity+inbox），P2-1/P2-3 组件/管线单测覆盖
- ✅ Conventional Commits（feat: ×4）
- ✅ 未 commit `wiki/` `*.db` 运行产物
