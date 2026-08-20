# Closeout: Squad 安全退役与派发闭环

日期：2026-08-20
产品提交：`feat(squads): archive squad with atomic transfer`（见 git log）
上一刀 intake：`app/.progress/cmdk-project-context-intake.md`（通过）

## 已交付

- **Migration 0055**：`squad.archived_at`（nullable）+ Drizzle/shared `archivedAt` 契约；`squad_member` 与历史 `agent_run.squad_id` 不再物理删除。
- **`DELETE /api/squads/:id` = 不可恢复归档**（学 Multica `squad.go:452-488` 先转交后归档）：事务内把所有 `squad:` 指派 Issue 转 `agent:leader`（每条写 `assignee_changed`/`squad_archived` 系统 activity）+ 未归档 Automation Rule 转 leader + 最后写 `archived_at`；leader 无效 → 409 零副作用；重复 DELETE → 204 幂等；广播严格在事务提交后。
- **Loader 双语义**：`loadSquadDetail`（history，archived 可读，返回 `archivedAt`）与 `loadActiveSquadDetail`（picker/当前派发专用）；`GET /api/squads` 只回 active，`GET /api/squads/:id` 对归档 Squad 不 404。
- **统一 `squad-dispatch-gate`**：Issue 单条/批量 preflight 与 enqueue、Quick Run、Automation dispatch、subagent dispatch 识别 `squad_archived`；异步 readiness 后、INSERT 前重检避免 archive/dispatch 竞态；直接使用归档 Squad → 409/readiness_failed，不建 AgentRun。
- **rerun/auto-retry 语义**：归档 Squad 的历史 run 重跑 → 解析当前 leader 创建**无 squadId** 普通 run，不复制旧 `squadId`、不重注入旧 briefing；既有 queued/running run 不被归档取消。
- **Web**：列表/详情「删除」→「归档小队」+ 不可恢复/转交 leader 确认文案；归档后详情显示「已归档 · 历史只读（时间）」并禁用归档按钮、保存、名称/Leader/protocol/directive/members 全部编辑控件；成功 toast 说明转交；`useDeleteSquad` 改 invalidate 不 evict 历史。

## Owner 验收补充（续作会话）

- 修复 `roster.squads.test.ts` 4 个旧「物理删除」断言 → 归档契约（404/幂等 204/leader 无效 409 零副作用/成功转交+审计+不物理删）；DELETE describe 改 `mockReset`（`clearAllMocks` 不清 Once 队列，跨 describe 泄漏会污染事务调用计数）。
- 补完 Must 6 缺口：`SquadDetailPage` 的 `archived` 此前定义未使用——补归档 note（日期/转交/不可恢复）+ 全表单禁用；新增 `SquadDetailPage.test.tsx` 5 用例（确认文案、取消、只读 note、禁用集、active 对照）。

## 验收证据

- 全量 `pnpm -w test`：shared 133、server 125 files / 1082、web 84 files / 588 全绿；`pnpm -w typecheck` 3 包通过。
- 隔离双端口 E2E（Web `:3100` + API `:3101` + 独立 migrated SQLite + `MA_CORS_ORIGIN`，脚本 `.scratch/squad-retirement-dispatch-closure/owner-e2e-20260820-1200/archive-path.e2e.mjs`，headless Chromium）：**23/23 PASS**——
  - UI：列表可见→详情归档确认（标题/不可恢复/转交 former leader 文案）→详情变只读（note+归档/保存/Leader 禁用）→列表隐藏→直访详情不 404 标识已归档；截图 `shots/t1..t6`。
  - API/DB：active 列表不含归档小队；detail 返回 archivedAt；issue FRI-1 转交 leader；`activity_log` `reason=squad_archived` 审计；`squad_member` 保留（n=1）。
  - Gate：归档小队直接建 issue → 409 `readiness_failed/squad_archived`（「仅保留历史记录，不能再派发」）；重复 DELETE → 204。
- 本环境 IAB webview 不可 attach（`browser guest not attached`），浏览器路径以上述 headless Chromium 真实 GUI（点击/确认框/截图）替代执行；未启动任何 CLI、未污染开发库。

## 边界 / 债

- 不做 restore/归档列表视图/成员迁移/自动 fallback；Agent archive、Run 状态机、scheduler 未重开（Out 一致）。
- 归档 Squad 的 briefing 注入路径依赖 `loadActiveSquadDetail` 约定（代码评审确认入口均已切换）；后续新增 dispatch 入口必须走 `squad-dispatch-gate`，此为长期约定。
- `.scratch/squad-retirement-dispatch-closure/owner-e2e-*` 运行目录（DB/截图/脚本）不 stage。

## 下一刀建议

- 候选 A（G3）：Issue/Squad 详情 inline transcript 预览已有 G3-3 基础，看板→run 观察路径继续加厚。
- 候选 B（G2）：归档小队的「历史小队」浏览入口（Settings/列表筛选 `?archived=1` 已有服务端支持，Web 无 UI）——小刀，可作热身。
- 候选 C（G3）：Agent 环境变量编辑 UI/API（roadmap §3 现状基线标注的唯一 UI/API 双缺项）。
