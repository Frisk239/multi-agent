# Handoff: s04-impl-1

> 切片：`S04` · 角色：`impl` · 序号：`1`
> 日期：2026-07-15

## 上下文（给下一个会话读）

S04 切片第一个执行者，负责数据层底座：DB schema 扩展 + shared 契约 + seed + reshape + squad-loader。
这是 S04 所有后续工作（briefing 注入 / 路由 / comment-trigger / RunWorker 并发改造 / 前端）的依赖。
读 [design/slices.md](../../design/slices.md) S04 行 + [spec §3/§4](../specs/2026-07-10-s04-squad-design.md) + [plan 执行者片段 A](../plans/2026-07-10-s04-squad.md)。

## 本会话完成了什么

### Task 1.1: Drizzle schema 扩展 + migration

- `app/packages/server/src/db/schema.ts`：
  - `squads` 加 `operatingProtocol`（`operating_protocol` text NOT NULL default ''）+ `missionDirective`（`mission_directive` text NOT NULL default ''）
  - `agents` 加 `concurrency`（`concurrency` integer NOT NULL default 1）
  - `agentRuns` 加 `isLeader`（`is_leader` integer NOT NULL default 0）+ `squadId`（`squad_id` text nullable）
  - 新建 `squadMembers` 表（`squad_member`）：复合 PK `(squad_id, agent_id)`，2 个 FK cascade，1 个 index `idx_squad_member_squad`
  - import 行补了 `primaryKey`（drizzle-kit 首次 generate 报 `primaryKey is not defined`，加 import 后解决）
- migration 产出：`app/packages/server/drizzle/0003_chief_excalibur.sql`（5 ALTER ADD COLUMN + 1 CREATE TABLE + 1 CREATE INDEX）

### Task 1.2: shared 契约扩展

- `app/packages/shared/src/schema.ts`：
  - `AgentRun` 加 `isLeader: z.boolean().default(false)` + `squadId: BusinessId.nullable()`（finishedAt 之后、createdAt 之前）
  - 新增 `SquadMember`（`agentId` + `name`）+ `SquadDetail`（id/name/leaderId/operatingProtocol/missionDirective/members）契约

### Task 1.3: seed + reshape + squad-loader

- `app/packages/server/src/db/seed.ts`：
  - agent insert 补 `concurrency`（lead=6, research=4, prd=4, proto=6）
  - squad insert 补 `operatingProtocol` + `missionDirective`（照 spec §3.5 三行的真值）
  - 新增 `db.insert(squadMembers)` 插 6 行（sqd-product×3 + sqd-philosophy×1 + sqd-eco×2）
  - import 加了 `squadMembers`
- `app/packages/server/src/db/reshape.ts`：`toAgentRun` 映射 `isLeader: row.isLeader === 1`（integer 0/1 → boolean）+ `squadId: row.squadId`
- `app/packages/server/src/db/squad-loader.ts`（新建）：
  - `loadSquadDetail(squadId): SquadDetail | null`（含成员 join，briefing 组装用）
  - `getSquadLeaderId(squadId): string | null`（trigger 路由用，轻量查询）

## 自测结果

### typecheck（DoD 硬指标）

```
$ pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck$ tsc --noEmit
packages/shared typecheck: Done
packages/server typecheck$ tsc --noEmit
packages/web typecheck$ tsc --noEmit
packages/web typecheck: Done
packages/server typecheck: Done
```

全绿（shared + server + web）。

### migration 文件

`0003_chief_excalibur.sql` 内容（符合 DoD：5 ADD COLUMN + 1 CREATE TABLE）：

```sql
CREATE TABLE `squad_member` (
  `squad_id` text NOT NULL,
  `agent_id` text NOT NULL,
  PRIMARY KEY(`squad_id`, `agent_id`),
  FOREIGN KEY (`squad_id`) REFERENCES `squad`(`id`) ON DELETE cascade,
  FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON DELETE cascade
);
ALTER TABLE `agent_run` ADD `is_leader` integer DEFAULT 0 NOT NULL;
ALTER TABLE `agent_run` ADD `squad_id` text;
ALTER TABLE `agent` ADD `concurrency` integer DEFAULT 1 NOT NULL;
ALTER TABLE `squad` ADD `operating_protocol` text DEFAULT '' NOT NULL;
ALTER TABLE `squad` ADD `mission_directive` text DEFAULT '' NOT NULL;
CREATE INDEX `idx_squad_member_squad` ON `squad_member` (`squad_id`);
```

### seed 行数验证

> 注：`dev.db` 被运行中的进程占用（`rm` 报 Device or resource busy），无法按 plan Step 6 删 dev.db → migrate → seed 的方式重置。
> 改用临时 db（`tmp-verify-s04.db`，验证后已删）跑全部 migration + 等 seed 逻辑，验证字段与行数。dev.db 的实际重置留待 server 重启后或计划者验收时做。

临时 db 验证输出：

```
squad_member 列: squad_id, agent_id
agent_run 列: id, issue_id, agent_id, runtime, status, error, started_at, finished_at, created_at, is_leader, squad_id
✓ squad 行数: 3（期望 3）
  sqd-product protocol: "1.队长"
  sqd-product directive: "PRD"
✓ agent 行数: 4（期望 4）
  concurrency: agt-lead=6, agt-research=4, agt-prd=4, agt-proto=6
✓ squad_member 行数: 6（期望 6）
```

issue 8 条 + comment 6 条：seed.ts 中 seed 数组本身未改（`seedIssues` 8 条、`seedComments` 6 条），insert 逻辑不变，行数不变。

## 与计划的偏离

1. **`schema.ts` import 补 `primaryKey`**：plan Task 1.1 Step 5 的代码片段只给了 `squadMembers` 表定义，没提 import。drizzle-kit generate 首次报 `ReferenceError: primaryKey is not defined`，我在 import 行补了 `primaryKey`。这是 plan 遗漏，非设计偏离。

2. **`squad-loader.ts` loadSquadDetail 加 null guard**：plan 原代码 `leaderId: squad.leaderId` 直接赋值，但 DB schema 里 `squads.leaderId` 是 `text('leader_id')`（可空），而 shared `SquadDetail.leaderId` 是 `BusinessId`（非空）。typecheck 报 TS2322。修法：loadSquadDetail 里 `if (!squad || !squad.leaderId) return null`——无 leader 的 squad 无法 briefing，返回 null 符合业务语义。**未改 DB schema 的 leaderId 可空性**（避免再加 ALTER COLUMN），也未改 shared 契约。impl-2 若需要 leaderId 必非空可自行决定是否收紧。

3. **dev.db 锁未解，改用临时 db 验证**：plan Step 6 要求删 dev.db → migrate → seed，但 dev.db 被占用删不掉。改用临时 db 跑等价验证。数据正确性已证明，但 dev.db 的实际数据刷新延后。

## 遗留 / 下一个执行者要注意的点（给 impl-2）

### 表名 / 列名（直接照抄可用）

- **表名**：`squad`（单数）、`agent`（单数）、`agent_run`（单数）、`squad_member`（单数）
- **Drizzle 对象名**：`squads` / `agents` / `agentRuns` / `squadMembers`（均从 `./schema.js` 导入）
- **agent_run 新列**：`isLeader`（DB `is_leader`，integer 0/1）、`squadId`（DB `squad_id`，text nullable）
- **squad 新列**：`operatingProtocol`（DB `operating_protocol`）、`missionDirective`（DB `mission_directive`），均 NOT NULL default ''
- **agent 新列**：`concurrency`（integer NOT NULL default 1）
- **squad_member**：无独立 id、无 member_type/role，复合 PK `(squadId, agentId)`

### 已就绪、impl-2 可直接调用的

- **`reshape.toAgentRun`** 已映射 `isLeader`（`row.isLeader === 1`）+ `squadId`，无需再改。
- **`db/squad-loader.ts`** 两个函数已就绪：
  - `loadSquadDetail(squadId): SquadDetail | null`（含 members 数组，briefing 组装直接用）
  - `getSquadLeaderId(squadId): string | null`（trigger 路由用，轻量）
  - 两者都从 `./client.js` 取 db（同其他 loader），import 路径 `'../db/squad-loader.js'`
- **`shared.SquadDetail`** 契约已就绪（`@ma/shared` 导出 `SquadDetail` / `SquadMember` 类型）
- **`shared.AgentRun`** 已扩展（`isLeader` + `squadId`），impl-2 写 `enqueueLeaderRun` 时 insert 的 row 用 `toAgentRun` reshape 会正确带上两字段

### impl-2 要做的（不在 impl-1 范围）

- `enqueueLeaderRun`：**还没建**，要在 `run-service.ts` 加（plan Task 2.2 Step 2 给了完整代码）。注意 insert 时显式写 `isLeader: 1, squadId`（AgentRun schema 的 default 是 false/null，leader run 必须显式覆盖）
- `buildPrompt` 签名加 run 参数 + briefing 前置（Task 2.1）
- `enqueueAgentRun` 去重改 per-(issue,agent) + 熔断（Task 2.2 Step 1）
- `comment-trigger.ts` 新建（Task 2.4）
- `run-worker.ts` 并发改造：全局 busy → per-agent 槽（Task 2.5，核心重写）—— **注意 agent.concurrency 现已可查**（`agents` 表有此列）

### 一个隐含约束

`dev.db` 当前可能还是旧 schema（migration 0003 已通过 `db:migrate` 应用到它，但 seed 没重跑，所以 squad/agent 行缺 protocol/concurrency 真值、squad_member 表为空）。impl-2 或计划者验收前需重置 dev.db：删 `dev.db*` → `db:migrate` → `db:seed`（删不掉时先停占用 dev.db 的 server 进程）。

## 验收结论（计划者填）

### impl-1 验收（2026-07-15 计划者复核）

**结论：✅ 通过，移交 impl-2（briefing + comment-trigger + 并发改造）。**

复核项（逐文件核对）：
- ✅ migration `0003_chief_excalibur.sql`：5 ADD COLUMN（squad×2 + agent×1 + agent_run×2）+ squad_member（复合 PK + 2 FK cascade + index），结构正确
- ✅ shared AgentRun 扩展正确（isLeader: z.boolean().default(false) + squadId: BusinessId.nullable()）
- ✅ SquadDetail/SquadMember 契约就绪
- ✅ seed squad 3 行带 protocol/directive 真值；agent 4 行 concurrency（6/4/4/6）；squad_member 6 行
- ✅ toAgentRun 映射 isLeader（`row.isLeader === 1`）+ squadId
- ✅ squad-loader.ts loadSquadDetail（含 members join）+ getSquadLeaderId 就绪
- ✅ 4 commit 干净，typecheck 三包全绿

**两处偏离全部接受**：
1. primaryKey import（plan 遗漏，drizzle-kit 报错才发现，修复正确）
2. loadSquadDetail null guard（leaderId 可空 vs 契约非空，`if (!squad.leaderId) return null` 符合业务语义——无 leader 的 squad 无法 briefing）

**给 impl-2 的计划者补充注意点（impl-1 handoff 之外 + 排雷成果）：**

1. **【执行顺序】先做 Task 2.5（RunWorker 重写）再做 Task 2.4**（comment-trigger）。原因：2.5 重写整个 run-worker.ts，其 executeRun 已包含 triggerFromComment 的 import 和调用；2.4 只需新建 comment-trigger.ts + 挂 comments.ts，不再改 run-worker。或合并 2.4+2.5。
2. **【循环 import 安全】** comment-trigger → run-service → run-worker → comment-trigger 形成循环。ES module live binding 使其安全（所有交叉引用只在函数体内用，不在模块顶层求值）。别因循环改架构。
3. **【DRY：抽共用 enqueue】** enqueueAgentRun 和 enqueueLeaderRun 重复多，建议抽 checkAndEnqueue(issueId, agentId, opts?) 共用函数。
4. **【run-service.ts 缺 3 个 import】** 当前只有 eq/and/inArray + agentRuns/agents + toAgentRun。需加 sql（drizzle-orm）+ comments（schema）+ toComment（reshape）。熔断 system comment 需要后两者。
5. **【并发无锁安全】** 删掉 S03 全局 busy 后别加锁——Node 单线程 + tick 内 executeRun fire-and-forget（void 不 await）= tick 同步跑完不会并发。加锁会死锁。
6. **【dev.db 需重置】** migration 0003 已应用，但 seed 未重跑（dev.db 被占用）。impl-2 开工前或自测前需重置：停 server → 删 dev.db* → db:migrate → db:seed。否则 squad/agent 行缺 protocol/concurrency 真值、squad_member 表为空，briefing 会拿到空 protocol。
