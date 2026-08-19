# Closeout: followup-serial-claim

日期：2026-08-19

## 交付

- 实现提交：`374afc5 fix(runtime): serialize same-issue follow-ups at claim`
- 同一 Agent × 同一 Issue 的 queued follow-up 现在在 **claim CAS** 中受 `NOT EXISTS` 守卫；并发额度大于 1 不再让它与前一轮同时 `running`。
- queued run 的读取投影给出 `same_issue_busy` 与阻塞 run ID；Runs 列表与详情说明“等待当前同 Issue run”，并能跳到阻塞 run。
- 不同 Agent 的同 Issue run、同 Agent 的另一 Issue run 保持并行；既有 `project_local` path-lock、priority、rerun 与 follow-up enqueue 语义未改。

## 决策

- 学 Multica 的 claim-time scope guard（`references/repos/multica/server/pkg/db/queries/agent.sql:508-539`），不把串行性放在 enqueue 时的乐观去重上。
- 未新增持久状态或迁移；复用既有 `pathWaitReason/pathBlockedByRunId` 观察投影，新增 `same_issue_busy` 枚举。字段名是兼容债，UI 文案不再称它为目录锁。

## 证据

- `pnpm check`：通过（shared 6 files / 124 tests；server 119 files / 1032 tests；web 71 files / 501 tests）。
- `node scripts/check-docs.mjs`：通过（7 entries，7 ADRs，CI freeze）。
- `pnpm --filter @ma/server exec vitest run --config vitest.config.ts src/orchestration/path-lock.test.ts src/orchestration/run-worker.test.ts`：通过（35 tests）。
- 隔离真实 API + Next + Playwright：`pnpm e2e followup-serial-claim` 通过（Runs 等待文案、阻塞 run 深链、Run 详情并发说明）。隔离服务使用临时 DB 副本与 `:3002/:3003`，不写日常开发 DB。

## 债 / 边界

- browser fixture 直接构造 active + queued run；comment-trigger 创建 follow-up 的契约由既有 `comment-followup-queue` 回归覆盖。二者合起来覆盖“创建”与“领取/可见性”。
- `pathWaitReason` 已承载两类等待原因；未来若再增加等待类型，应抽通用 `waitReason`，本刀不扩 API 面。

## 给下一 Owner

- 前端 UX 调研的首选下一刀是 Runs Mission Control：投影 Issue/会话标题与项目，并提供 URL 可分享的语义搜索/筛选；见 `app/.progress/goal-continuous-frontend-ux-research-2026-08-19.md`。
- 后端后续候选：Pi UI request 人机接力、Automation 停机补偿；均见同日后端调研笔记。
