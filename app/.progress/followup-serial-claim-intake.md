# Intake: followup-serial-claim

日期：2026-08-19
上一刀提交：`374afc5`（实现）· `7e68f28`（closeout）

## Verdict：通过

- 合并状态：两个提交均已在 `origin/main`；当前本地 `main` 与远端一致。
- 抽检 1：真实 DB worker test 在 Agent concurrency=2 时保持同 Agent × Issue follow-up queued，claim CAS 直接验证为不生效；holder 终态后 follow-up 恰好接续。
- 抽检 2：不同 Agent 的同 Issue run、同 Agent 的另一 Issue run 仍可并行，未过度串行。
- 抽检 3：隔离 API + Next + Playwright e2e 在 Runs 列表与详情显示 `same_issue_busy`，并可打开阻塞 run。
- 回归：`pnpm check`、`node scripts/check-docs.mjs` 通过；未提交数据库、wiki、密钥或用户既有 `.memory/`、`.zcode/`。

## 非阻断记录

- `pathWaitReason` 同时承载路径锁与同 Issue 串行；当前 UI 已用准确文案，若等待类别继续增长再抽通用字段。
- 浏览器 fixture 直接建 active/queued runs；comment-trigger 创建 follow-up 由上一刀的既有回归覆盖。

## 下一步

- 进入 `runs-mission-control-subjects`：让高频 Runs 页面按 Issue/会话标题与项目定位，而不只显示短 ID；调研和 Must 见 `goal-continuous-frontend-ux-research-2026-08-19.md`。
