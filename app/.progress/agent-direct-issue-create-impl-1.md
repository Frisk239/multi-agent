# Closeout: agent-direct-issue-create

日期：2026-08-19
实现提交：`30f42d9 feat(agents): add direct issue creation`

## 交付

- Agent 详情的“分配工作”现在直达 `/?new=1&createAssignee=agent:<id>`；原本的看板筛选入口保留并更名为“查看已指派 Issue”。这与 Multica 从 Agent 详情带 Agent ID 打开 quick-create 的路径对齐。
- `NewIssueForm` 把 `createAssignee` 视为一次性创建意图，和看板 `assignee` 筛选分离。它会等待活跃 Agent 查询结算，再只预选确实存在的未归档 Agent。
- URL 创建意图优先于已恢复草稿中的旧指派；无效、归档或不存在的 Agent 仍会打开表单，但不会伪造下拉选项。消费后只移除 `new` 与 `createAssignee`，保留 `project`、`assignee` 等其余查询参数。
- 没有新建后端分支：预填后的提交仍经过原有 readiness/preflight、`CreateIssueInput`、Issue 创建和 Run enqueue。

## 证据

- 定向 Web Vitest：2 files / 29 tests 通过，覆盖有效/无效/归档 URL、异步 Agent 查询、草稿覆盖、查询保留和 preflight 硬闸。
- shared、server、web 均以各包 TypeScript 二进制执行 `tsc --noEmit` 通过。
- 全量 `pnpm test` 复跑通过：shared 6 files / 130 tests，server 122 / 1049，web 78 / 525。
- 隔离 current-source Playwright 通过：Agent 详情两条入口正确；“分配工作”打开并预选 Agent；提交后真实持久化 Issue 和 queued `kind=issue` Run。
- E2E 只接受显式 `SERVER`、`WEB` 和包含 `e2e` 的独立 SQLite 路径；测试时将 `ws-local.max_concurrent_runs` 暂设为 0，保证真实 enqueue 不会执行本机 CLI，随后恢复上限并清理随机 fixture。
- `node scripts/check-docs.mjs`、`git diff --check` 通过；隔离 `:3002/:3003` 服务已停止。

## 环境记录

- 首次全量 server 测试仅在 `event-bus.test.ts` 导入阶段出现 SQLite WAL `disk I/O error`，其余 1046 项已通过；该套件独立复跑 3/3 通过，随后完整 `pnpm test` 复跑全绿。没有复现为产品回归。
- 本机 Web 的 `pnpm check` 仍受既有缺失 `tsc` 启动器影响，因此以三包直接 TypeScript 调用覆盖 typecheck；锁文件和依赖未纳入本刀。

## 有意未做

- 不加 Squad 对等入口、Quick Dispatch、Chat 派活或新的服务端派发策略。
- 不改变 readiness/preflight、草稿格式、数据库/schema 或 Run 状态机。

## 下一刀

取 `automation-run-now-truth`：让 Automation“立即执行”按领域结果表达成功、进行中、跳过和未知状态，不能把 HTTP 成功一概说成已启动；保留既有诊断/执行记录入口，并用真实不可用 Agent fixture 跑 Playwright。
