# Agents roster：当前任务可行动化

## 用户路径

本地操作者在 **Agents** 列表看到某个工作中的 Agent 时，能直接读到它当前处理的 Issue；只有一条在途任务时可直达该 Run 详情，多条在途任务时可进入该 Agent 已筛选的运行列表继续判断或处置。

## Must

1. `GET /api/agents` 的 `AgentSummary` 批量投影最新 in-flight **Issue** run：run id/status、Issue id/identifier/title；不为每个 Agent 单独查询。
2. 保留既有 `liveStatus` / `activeRunCount` 语义。没有 active Issue run（含仅 chat/quick-create）时不伪造 Issue 标题。
3. Agents 行把身份链接与实时状态拆开，避免嵌套链接；单条 active Issue run 显示 `标识 · 标题` 并进入 `/runs/:id`。
4. 多条 active run 时，任务/工作提示进入 `/runs?agent=<id>&status=active`；URL 可分享且与 RunsPage 既有过滤一致。
5. WS `agent:status_changed` 的既有 agents cache invalidation 足以让投影刷新；不另造轮询或 websocket 协议。
6. 共享 schema、server contract/unit coverage、Web component coverage，并新增 current-source Playwright 路径：一条 active issue run 可见并直达 Run；两条 active runs 进入 agent+active 筛选的 Runs。

## Out

- 新 dashboard、Agent 详情页重构或 N+1 查询。
- Chat 生命周期/聊天标题作为 roster 任务标题。
- 增加轮询、修改 run 状态机或 runtime 行为。

## 参考与裁决

- Multica 将 workload、当前 Issue 和最近活动分层展示：`references/repos/multica/packages/views/agents/components/agent-live-peek-card.tsx:25-38,124-205`。
- 本仓当前仅有状态与数量：`app/packages/server/src/db/reshape.ts:383-400`、`app/packages/web/components/AgentsPage.tsx:550-566`。
- 选定：最小 bulk latest-active Issue 投影；单条直达 Run，复数直达已筛选 Runs，chat 保持范围外。

## 验收

1. API fixture 证明最近 active Issue task 的投影与 active 数量；没有 Issue task 不泄漏虚构标题。
2. Agent 列表能读到 `FRI-… · 标题`；单条链接为 `/runs/<runId>`。
3. 两条 active runs 的入口为 `/runs?agent=<id>&status=active`，到达后过滤保持。
4. `pnpm check`、docs check、diff check 与隔离 Playwright 通过。
