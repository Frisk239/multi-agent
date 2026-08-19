# Spec: agent-direct-issue-create

日期：2026-08-19
状态：实施中
上一刀 Intake：`app/.progress/agent-active-task-peek-intake.md`（通过）

## 用户路径

操作者在 `/agents/:id` 看完某个 Agent 的状态或当前工作后，点击“分配工作”，直接来到已展开的 New Issue 表单，且该 Agent 已被预选；填写标题并提交时，仍由既有 readiness/preflight 与 Issue→Run 入队链路决定是否可派发。若要回顾已有任务，操作者可另点“查看已指派 Issue”，得到原来的看板筛选。

## 调研与决策

- Multica 的 Agent 详情通过 `quick-create-issue` 并携带 `agent_id` 直接发起派活：`references/repos/multica/packages/views/agents/components/agent-detail-page.tsx:262-290,481-485`。
- 本仓当前把“分配工作”误连到看板 `assignee` 筛选：`app/packages/web/components/AgentDetailPage.tsx:509-516`；`NewIssueForm` 已有 URL 打开、受控 assignee 与提交前 gate：`app/packages/web/components/NewIssueForm.tsx:76,130,233-287,324-378`。
- 选定 URI：`/?new=1&createAssignee=agent:<agentId>`。`assignee` 继续只代表看板筛选，避免创建意图与列表状态混用。

## Must

1. Agent 详情的“分配工作”改为上述创建 URI；原筛选 URI 保留为独立、准确命名的“查看已指派 Issue”入口。
2. `NewIssueForm` 消费该 URI：打开表单，并在 Agent 列表已解析后仅对存在且未归档的 Agent 预填 `assigneeValue`。创建意图优先于草稿中的旧指派；无效、已归档或不存在的 Agent 仍打开表单但不伪造选中项。
3. 消费后只清理 `new` 与 `createAssignee`；保留 `project`、`assignee` 和任何无关查询参数。没有 `createAssignee` 的既有 `?new=1` 行为不回归。
4. 不绕过既有 `selectedAssignee` readiness/preflight、`CreateIssueInput` 校验、提交 mutation 或服务端 enqueue 路径；预填到 blocked Agent 时必须仍展示原有阻断而不是提交。
5. 补 AgentDetail/NewIssueForm 组件测试，并新增隔离 current-source Playwright：ready Agent 详情→预填表单→提交→验证现有 Issue/Run 真实结果；同时验证“查看已指派 Issue”保留筛选链接。

## Out

- 不改 shared schema、数据库、server routes、run 状态机、readiness/preflight 策略。
- 不加 Squad 对等入口、Quick Dispatch、Chat 创建或新的派活模式。
- 不改变看板筛选语义、草稿持久化格式或全局导航。

## 验收命令

- 定向 Web Vitest（AgentDetailPage 与 NewIssueForm）。
- 全量测试/三包 TypeScript 检查（按当前本机依赖可用路径）。
- 隔离 SQLite + server/web Playwright；不得占用或停止用户的 `:3000/:3001` 服务。
