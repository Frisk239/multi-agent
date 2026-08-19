# Intake: agent-active-task-peek

日期：2026-08-19
上一刀实现：`ef4f8a0 feat(agents): show current active task`
上一刀关刀：`86eea92 docs: close agent active task peek slice`

## Verdict：通过

- 两个提交均已是 `origin/main` 的祖先；工作树除本地 `.memory/`、`.zcode/` 外无未提交产品改动。
- 抽样复验通过：shared schema `55/55`、真实 SQLite/Fastify roster 契约 `1/1`、AgentsPage `3/3`。
- 抽样验收与实现/证据一致：roster 只投影 active Issue，单条工作可进 Run 详情，多条工作保留 Agent+active Runs 筛选；关刀记录的隔离 Playwright 已覆盖这两条路径。
- 未见密钥、数据库、Wiki 或上游参考树被纳入提交。唯一环境债是本机 Web `pnpm check` 启动器链接异常；上一刀以三包直接 TypeScript 调用和完整测试替代，非产品缺陷。

## 交给下一刀

取 `agent-direct-issue-create`：把 Agent 详情的“分配工作”变成预填该 Agent 的新建 Issue；原有“查看已指派 Issue”筛选入口保留且改为准确命名。复用现有 readiness/preflight 及 enqueue 真相，不扩展后端策略。
