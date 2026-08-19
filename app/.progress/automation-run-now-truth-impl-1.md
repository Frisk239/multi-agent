# Closeout: automation-run-now-truth

日期：2026-08-19
产品提交：`fa04328 feat(automation): report run now outcomes`

## 已交付

- `/automation` 的“立即执行”不再把 HTTP `201` 直接解释为成功。仅 `issue_created` / `running` 显示成功；`skipped` / `dispatching` / `retrying` 为 warning；`pending_dispatch`、`failed`、`success`、空值和未知状态为 error。
- run-only 的成功回执改为“已派发运行”，可直达关联 Run，不再错误宣称创建了 Issue。
- 任一非成功结果都会自动展开当前规则的既有“最近执行”；`pending_dispatch` 的 Issue/Settings 修复 CTA、重新派发和 linked Run 深链均保持。
- Toast 增加 warning 语义与视觉变体；结果分类、hook、页面交互和 toast 均有回归测试。
- 新增隔离 current-source Playwright：要求显式非默认 `SERVER` / `WEB` 与含 `e2e` 的 DB，先用随机 fixture 证明服务连接目标，再验证真实 runtime-missing `run_only → skipped`。fixture 与浏览器都会 finally 清理。

## 参考与决策

- 采用 Multica 把 HTTP 成功和领域成功分开的白名单原则：`references/repos/multica/packages/views/autopilots/components/run-now-toast.ts:1-54`、`autopilot-detail-page.tsx:722-744`。
- 本仓 route 对领域失败仍返回 `201 + AutomationRun`：`app/packages/server/src/routes/automation.ts:241-275`；run-only 离线的真实结果是 `skipped + error`：`app/packages/server/src/orchestration/automation-dispatch.ts:293-379`。因此不扩 DB enum 或调度状态机，只修正 Web 的事实表达。

## 验收证据

- 独立 SQLite、Server `:3002`、Web `:3003` 真实 Playwright 通过：`runtime_missing + run_only → skipped warning + 自动展开最近执行`；同一 DB 断言无 `AgentRun`，不会启动本机 CLI。用户 `:3000/:3001` 未触碰，隔离服务已停止。
- 三包直接 TypeScript 检查通过（Web 复用 workspace 的可用 `tsc`；本机 web `.bin/tsc` shim 缺失，不改依赖）。
- `pnpm test` 通过：shared 6 files / 130 tests、server 122 / 1049、web 80 / 562。
- `node scripts/check-docs.mjs`、`git diff --check` 通过。

## 已知边界 / 下一刀

- E2E 故意 fail-safe：执行者必须提供实际 `runtime_missing` 的隔离 server；仅设置不存在的 `GROK_PATH` 不足以遮蔽 PATH 中已安装的 Grok，脚本会在派发前拒绝继续。
- 下一刀候选正在复核：Automation 在笔记本休眠/服务停机后，应按明确的 `latest_only` 规则补发或记录过窗跳过，避免目前“下一格计算”吞掉恢复期间的计划语义。
