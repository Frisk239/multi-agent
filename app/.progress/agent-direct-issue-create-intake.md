# Intake: agent-direct-issue-create

日期：2026-08-19
上一刀实现：`30f42d9 feat(agents): add direct issue creation`
上一刀关刀：`ac84983 docs: close agent direct issue create slice`

## Verdict：通过

- 两个提交均已推送到 `origin/main`；工作树没有未提交的产品改动，仅保留用户本地 `.memory/`、`.zcode/`。
- 抽样验收由当前源码隔离 Playwright 直接通过：Agent 详情的两条入口正确，派活后 New Issue 打开并预选 Agent，提交后真实 Issue 与 queued `kind=issue` Run 均存在。
- 异步 Agent 查询、草稿覆盖、无效/归档 URL、查询参数保留及 preflight 硬闸均有组件测试；全量测试复跑为 shared 130、server 1049、web 525 通过，三包直接 TypeScript 检查通过。
- E2E 显式要求独立 DB/服务，并将 `ws-local` 并发上限暂置 0 后恢复，未调用本机 CLI、未触碰用户数据库或默认服务。未见密钥、DB、Wiki 或上游参考树进入提交。

## 交给下一刀

取 `automation-run-now-truth`：Automation 的“立即执行”必须按实际领域结果区分成功、进行中、跳过与未知，避免将任意 HTTP 2xx 说成“已启动”；继续复用现有运行记录、诊断链接和调度状态机。
