# Spec: Squad 安全退役与派发闭环

日期：2026-08-20
状态：已完成（closeout：`app/.progress/squad-retirement-dispatch-closure-impl-1.md`）
上一刀 Intake：`app/.progress/cmdk-project-context-intake.md`（通过）
调研：`app/.progress/squad-retirement-dispatch-closure-discovery-2026-08-20.md`

## 用户路径

操作者在小队详情选择「归档小队」，确认不可恢复且该小队当前指派的 Issue、未归档自动化规则会转给有效 leader。归档后，正常小队列表和指派器不再出现它；原详情与既有 run 仍可读、标识为历史且不可编辑。此后新工作不会再指向死 Squad：直接派发会如实拒绝，历史失败 run 的 rerun/auto-retry 则以 leader 的普通 run 继续，不携带已归档 Squad briefing。

## 参考与决策

- Multica 的 Squad DELETE 是 archive；先 TransferSquadAssignees 与 TransferSquadAutopilotsToLeader，后 ArchiveSquad，且不取消既有 task：`references/repos/multica/server/internal/handler/squad.go:452-488`、`references/repos/multica/server/database/queries/squad.sql:101-117`、`references/repos/multica/docs/squads.mdx:91-99`。
- 本仓当前物理删 Squad/member，遗留 `agent_run.squad_id` 和 Automation 的多态指派会悬挂，导致未来 `invalid_assignee`：见 discovery。
- 选定 Multica Path A：不可恢复软归档；所有指向该 Squad 的 Issue 与**未归档** Automation Rule 原子转给 former leader；已归档规则保留原 Squad 作审计。既有 queued/running 历史 run 保留 `squadId` 和原 briefing，不取消、不重写。

## Must

1. 新 migration + Drizzle/shared 契约加入 nullable `squad.archived_at` / `archivedAt`；保留 `squad_member` 与历史 `agent_run.squad_id`。正常 Squad list 只返回 active；按 id 的 detail 能返回 archived Squad 供历史链接读取。
2. `DELETE /api/squads/:id` 改为 idempotent archive，不再物理删除。开始前、并在 SQLite transaction 内都验证 former leader 存在且未归档；否则 `409`、零 Issue/Rule/activity/run 副作用。transaction 内：
   - 将所有 assignee=`squad:id` 的 Issue 转 `agent:leader`，每条写可追溯的系统 assignee-change activity，并在 transaction 后发既有更新事件；
   - 将未归档 Automation Rule 转 `agent:leader`，已归档 Rule 不改；
   - 最后写 Squad archivedAt/updatedAt，重复 DELETE 安全返回，不创建重复审计。
3. 把 Squad loader 分为 active-dispatch 与 history-detail 语义：归档 Squad 不能被正常列表、Assignee picker、新 enqueue 或 briefing injection 作为当前小队使用；历史 run/prompt 仍能解析归档前 roster/briefing。
4. 新派发统一识别 `squad_archived`：至少 Issue 单条/批量 preflight 与 leader enqueue、Quick Run、Automation、subagent 入口。异步 readiness/probe 后、INSERT 前必须再检，避免 archive/dispatch 竞态；直接使用归档 Squad 的入口返回可解释 `409` / domain skip，不创建 AgentRun。
5. 对已有 Squad run 的 rerun / auto-retry，解析当前 leader 后创建**无 squadId**的普通 leader run；不能复制历史 archived `squadId` 或重新注入旧 briefing。既有 queued/running run 不被 archive 取消，仍以 history loader 保留原上下文。
6. Web：把小队详情的「删除」改为「归档小队」并给不可恢复、转交 leader 的明确确认；归档后当前详情显示中性“已归档/历史只读”并禁用编辑/成员等未来变更 CTA；普通列表与指派选择不再显示。路由的 archived detail / run 历史不 404、不伪称 active。
7. 测试覆盖 migration/SQLite/Fastify 事务原子性、有效/无效/已归档 leader、Issue activity/Automation 转移、历史 Rule 保留、重复 archive、direct dispatch/rerun/auto-retry、不取消旧 run、Web 只读/确认文案；新隔离 current-source Playwright 以 concurrency=0 fixture 验证 UI 归档→列表隐藏/详情只读→数据库转交/历史保留→旧 Squad 新派发拒绝，非默认双端口 + `e2e` DB + CORS/ownership guard + finally cleanup，绝不启动 CLI。

## Out

- 不做 Squad restore/archive list、hard-delete 重构、自动 fallback、成员自动迁移或重新设计 Squad briefing。
- 不重开 Agent archive、G8-4b probe、Run 状态机、scheduler、云/多节点/Redis。
- 不取消或重写 archive 前已有 queued/running run；不把已归档 Automation Rule 改写为 leader。

## 验收

- 有效 leader 的 Squad 归档一次完成：所有现行 Issue/active Rule 指向 leader 并留下审计，历史 Rule/历史 run 留 Squad；无效/已归档 leader 则完整拒绝、不半写。
- 归档 Squad 在 active list/picker/未来派发中不可达；历史 detail/run 可读且显示已归档。archive 与新派发竞态不能建立新的 Squad-context run。
- archive 后 rerun/auto-retry 是 leader 普通 run；旧 work 没被取消。真实浏览器路径和 SQLite 查询均证明这些状态。
