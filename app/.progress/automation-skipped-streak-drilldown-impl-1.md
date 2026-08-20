# Closeout: automation-skipped-streak-drilldown

日期：2026-08-20
产品提交：`51de144 feat(automation): drill into skipped streaks`

## 已交付

- `/automation` 的“连续跳过”告警现在是可键盘操作的 button。点击或 Enter 会打开同一规则，并用与后端 streak 计算一致的 `limit=20` 窗口取执行记录；普通“最近执行”和 Run Now 的自动展开仍使用原有 8 条窗口。
- 跳过记录不再淹没普通可操作项：同一窗口的全部 `skipped` 先收为一个可访问的折叠组，摘要给出精确组内数量、按 `plannedAt` 找到的最新计划时刻和原因摘要；展开后逐条显示 source、计划时刻和完整原因。
- `pending_dispatch` 的重新派发 CTA、Issue 深链和 linked Run 深链继续走原表格路径，未被跳过组隐藏或降级。达到窗口上限时文案明确为“连续跳过 ≥20 次”，并说明只基于最近 20 条记录。
- 新增隔离 current-source Playwright：随机、disabled 的 automation fixture 只有终态 Agent Run；脚本强制非默认端口和 `e2e` SQLite、迁移/seed/CORS/服务归属检查，记录浏览器 mutation，并在 finally 清理 fixture（即使归属校验失败）。

## 参考与决策

- 对齐 Multica 将 skipped 当作带原因但非 failed 的审计状态，并将这类记录数量化、按需展开，普通 run 则保留行动入口：`references/repos/multica/packages/views/autopilots/components/autopilot-detail-page.tsx:77-88,138-170,186-242`。
- 本仓已有后端 20 条 streak 计算和带 `limit` 的 runs endpoint；缺口只是静态告警与默认 8 条平铺列表之间的断裂。因此选前端最小钻取，不改 status、schema、scheduler 或 skip 口径。

## 验收证据

- 纯函数、AutomationPage 与 hook 定向测试覆盖 20 条请求、button/ARIA/Enter、折叠/聚合、`≥20` 边界、pending CTA、Issue 与 Run 深链。
- Owner 用新迁移、seed 的隔离 SQLite 实跑 current-source Playwright：Server `:3002`、Web `:3003`，浏览器通过键盘告警请求 `runs?limit=20`、聚合/展开 3 条跳过记录，并确认普通 pending 的 CTA/Issue/Run 链接仍在；无浏览器 mutation、无新工作或 CLI，服务已停止。
- `pnpm test` 通过：shared 6 files / 131 tests、server 124 / 1062、web 81 / 571；shared/server/web TypeScript、E2E 脚本静态 TypeScript、`node scripts/check-docs.mjs`、`git diff --check` 通过。

## 边界 / 下一刀

- 不增 Automation 详情页、无限历史、后端 pagination、全局通知、归档列表或 scheduler 改动；历史窗口外总数仍未知，故不伪装为完整计数。
- 下一刀由 Slice Owner 从本仓与 Multica 的未关缺口调研中选定，避免重开已关闭的 Automation 真实性链路。
