# Closeout: Automation execution truth

## 交付

- Automation 建卡不再等同执行成功：新增 `issue_created`、`pending_dispatch`、`running`，保留历史 terminal 状态兼容。
- `automation_run` 持久化 linked Run 与更新时间；`0040` additive migration 覆盖 fresh DB。
- enqueue skipped 记录真实原因；linked Agent Run 的 running/terminal 事件用条件 UPDATE 幂等回写。
- `pending_dispatch` 可由操作员“重新派发”；先用 DB 条件 UPDATE claim，两个并发请求至多创建一个 Run，失败会回滚 pending。
- Automation UI 展示状态、原因、Issue/Run 深链与恢复 CTA；`automation:updated` 经 WS 刷新。

## 参考与决策

- 参考 Multica `autopilot.go:101-113,1048-1105`：区分建卡审计与 linked task terminal。
- 参考 Multica `task.go:3147-3249`：基础设施重试应有限且可观测；本刀只做人工 reconcile，通用自动重试留后续。
- 本仓保持纯本地、单主进程、DB 行即锁；未引入 daemon、Redis、webhook 或新 Agent loop。

## 证据

```text
cd app
pnpm typecheck
# PASS: shared / server / web

pnpm exec vitest run \
  packages/server/src/orchestration/automation-execution.test.ts \
  packages/server/src/automation/cron.test.ts \
  packages/server/src/db/schema-migrator.test.ts
# PASS: 3 files, 9 tests

cd packages/web
pnpm exec vitest run --config vitest.config.ts \
  lib/ws.test.ts lib/automation-run-link.test.ts
# PASS: 2 files, 19 tests
```

Fresh DB Playwright CLI：

1. 空库执行 migrations + seed，启动 `localhost:3000/3001`。
2. 受控 fixture 建立 `pending_dispatch`，页面显示原因与“重新派发”。
3. 点击 CTA 后按钮消失，API 状态变为 `running`，仅绑定 Run `b2e49ea4-...`。
4. Run 深链为 `/runs?run=b2e49ea4-0830-48b6-ac80-976f7ac5561c`，点击到 Runs mission control。
5. 最终 reload / reconcile / deep-link 控制台 0 errors（仅既有 warning）。

## 偏离 / 债

- 历史 `success` 不反向推断旧 linked Run，保持兼容。
- 本刀不做通用 infra 指数退避；下一候选可基于 `failureReason` 白名单和有限预算实现。
- 本地旧 `dev.db` 存在 journal/列漂移，标准 fresh DB migration 正常；灾难恢复与 migration repair 另刀处理。

## 下一刀

统一 Day-0 Onboarding：合并两套组件、storage key 与完成条件，走通 CLI → 项目 localPath → Agent → 首条已指派 Issue/Run。
