# Intake: automation-run-now-truth

日期：2026-08-19
上一刀实现：`fa04328 feat(automation): report run now outcomes`
上一刀关刀：`f6f8eb4 docs: close automation run now truth slice`

## Verdict：通过

- 两个提交已推送 `origin/main`；工作树只保留用户本地 `.memory/`、`.zcode/`，以及下一刀的调研/规格产物。
- 独立 SQLite、Server `:3002`、Web `:3003` 的 current-source Playwright 通过：真实 runtime-missing `run_only` 持久化为 `skipped`，页面显示 warning 与原因并展开最近执行；同一 DB 断言没有 `AgentRun`，没有启动 CLI。
- 三包直接 TypeScript 检查、`pnpm test`（shared 130、server 1049、web 562）、`node scripts/check-docs.mjs`、`git diff --check` 均通过。
- E2E 的隔离要求会 fail-safe：若 runtime 实际可用，脚本在任何派发前失败；默认服务和用户数据库没有被触碰。

## 交给下一刀

取 `automation-schedule-catchup-truth`：当前 scheduler 重启/休眠后只取当前或上一档，既无持久 schedule anchor，也无过窗事实。做 latest-only + 5 分钟窗口；窗口外落一条幂等 `schedule/skipped` 审计，绝不回放所有遗漏 slot。
