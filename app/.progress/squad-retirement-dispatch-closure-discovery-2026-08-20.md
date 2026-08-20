# 调研：Squad 安全退役与派发闭环

日期：2026-08-20
结论：`squad-retirement-dispatch-closure` 是 CmdK 项目直达之后的候选后端中厚刀。

## 本仓真实缺口

- 当前 DELETE 只在没有未完成 Issue 时物理删除 Squad/member；`squad` 没有 `archived_at`，而 Automation / AgentRun 的多态或历史引用没有外键保护。因此后续 dispatch 会落到不存在的 Squad，最终变成 `invalid_assignee` 或静默丢失上下文。
- auto-retry / rerun 还会复制历史 `squadId`，即便先把直接入口封住，归档后仍可能生成新的 Squad-context run。

## 对标与政策

- Multica 的 DELETE 是不可恢复 archive：先把所有 Issue 与 Autopilot 转给 former leader，最后写 `archived_at`，而既有 task 保留不取消：`references/repos/multica/server/internal/handler/squad.go:452-488`、`server/database/queries/squad.sql:101-117`、`docs/squads.mdx:91-99`。
- 拟对齐政策：归档时所有指向 Squad 的 Issue 和未归档 Automation Rule 原子转为 leader；已归档规则留原指派作审计。已排队/运行的 leader run 保留 `squadId` 及既有 briefing；今后新派发与 auto-retry/rerun 均不得再带归档 Squad。
- leader 缺失或已归档时，归档请求 409 且零副作用；不做自动 fallback、restore 或重开 Agent archive。

## 最小演示路径

小队详情点击「归档小队」→ 明确不可恢复且 Issue/活跃自动化会转 leader → 当前页成为可查看历史的只读详情，正常列表/指派器不再出现 → 自动化/新工作走 leader，旧 run 仍保留原 Squad 历史语义。

## 关键边界

- 需 migration `squad.archived_at`；拆 active-dispatch loader 与 history-detail loader。
- DELETE transaction 内先转移 Issue/active rule（含活动审计/广播），后 archive；GET list 只 active，detail 保留 archivedAt。
- 新派发 gate 必须覆盖 Issue/leader enqueue、Quick、Automation、subagent，且在 await readiness 后、INSERT 前复查；auto-retry/rerun 要降为 leader 的普通 run。
- 隔离 SQLite + Playwright：有效 leader + concurrency=0 Squad，归档后列表隐藏/详情只读/转交可见；旧 queued/running 历史不被取消，旧 Squad 快速派活 409，Automation 新指派指向 leader。
