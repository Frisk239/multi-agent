# Handoff: s04-impl-2

> 切片：`S04` · 角色：`impl` · 序号：`2`
> 日期：2026-07-15

## 上下文（给下一个会话读）

S04 切片第二个执行者，负责核心逻辑层：briefing 注入 + squad→leader 路由 + comment-trigger 闭环 + RunWorker 并发改造（★核心重写）。
这是 S04 最厚最险的片段。依赖 impl-1 的数据层底座（DB schema + shared 契约 + seed + squad-loader）。
读 [s04-impl-1.md](s04-impl-1.md) + [spec §5/§6/§7](../specs/2026-07-10-s04-squad-design.md) + [plan 执行者片段 B](../plans/2026-07-10-s04-squad.md)。

## 本会话完成了什么

### Task 2.1: buildPrompt 扩展（briefing 前置）

- `app/packages/server/src/runtime/prompt.ts`：
  - 签名加可选 `run?: PromptRunContext`（`{ isLeader: boolean; squadId: string | null }`），向后兼容现有 `buildPrompt(issueId)` 调用
  - leader run（`run.isLeader && run.squadId`）时前置三段 briefing：Operating Protocol + Roster + Mission Directive
  - roster 渲染 `[@Name](mention://agent/<id>)`，**跳过 leader 本人**（spec §5，照 multica squad_briefing.go:156）
  - briefing 前置于 body（S9 决策——我们无 Instructions 层，briefing 是最高优先级角色指令）
  - import `loadSquadDetail` from squad-loader
- **只改 prompt.ts，不改 run-worker.ts**（其 `buildPrompt` 调用点改动由 Task 2.5 的重写代码提供，避免被覆盖）

### Task 2.2: enqueue 去重改 per-(issue,agent) + 熔断 + enqueueLeaderRun

- `app/packages/server/src/orchestration/run-service.ts`：
  - 抽 `checkAndEnqueue(issueId, agentId, opts?: { isLeader?; squadId? })` 共用函数（排雷补充#3 DRY），`enqueueAgentRun` + `enqueueLeaderRun` 都调它
  - 去重改 **per-(issue,agent)**（`WHERE issue_id=? AND agent_id=? AND status IN active`）——同一 agent 同一 issue 不重复排，不同 agent 可并存
  - 乒乓熔断 MAX_RUNS_PER_ISSUE=15：issue 总 run 数超限 → 拒绝 + 写 system comment（`⚠️ 已达 issue run 上限（15），停止派发。`）+ publish comment:created
  - `enqueueLeaderRun(issueId, leaderId, squadId)`：调 `checkAndEnqueue` 并传 `{ isLeader: true, squadId }`，insert 时 `isLeader=1, squadId` 显式覆盖
  - import 补 `sql`（drizzle-orm）+ `comments`（schema）+ `toComment`（reshape）（排雷补充#4）

### Task 2.3: issues PUT 扩展 squad 路由

- `app/packages/server/src/routes/issues.ts`：
  - import `enqueueLeaderRun` + `loadSquadDetail`
  - PUT assignee 副作用加 squad 分支：`nextType === 'squad'` → `loadSquadDetail(nextId)` → 若有 leaderId 则 `enqueueLeaderRun(id, squad.leaderId, squad.id)`
  - null（取消指派）不触发 run（既有逻辑覆盖）

### Task 2.4+2.5 合并: comment-trigger 新建 + RunWorker 并发改造 + comments.ts 挂接

> **合并执行原因**：comment-trigger → run-service → run-worker → comment-trigger 形成循环 import 闭包，三文件（comment-trigger.ts 新建 + run-worker.ts 重写 + comments.ts 挂接）必须同 commit，否则中间态 typecheck 失败。

- **新建 `app/packages/server/src/orchestration/comment-trigger.ts`**：
  - `parseMentions(body)`：正则 `/mention:\/\/(agent|squad)\/([\w-]+)/g` 提取 mention link + 去重（同一 comment @同 target 多次只排一次）
  - `triggerFromComment(comment)`：
    - R4 前置：`if (comment.type !== 'comment') return`（status_change 的 body 是 JSON 不含 mention）
    - @agent（S8）：自指放行，靠 per-(issue,agent) 去重 + 熔断防循环（不靠 author 判定）
    - @squad（S8）：`authorType==='agent' && authorId===leaderId` 则跳过（防 leader @自己小队 → 触发自己 → 无限循环）
- **重写 `app/packages/server/src/orchestration/run-worker.ts`（★核心重写）**：
  - 删除 S03 全局 `busy` 标志（单 run 串行）→ **per-agent 槽 + fire-and-forget 并发**
  - `tick()`：遍历所有 queued（非 limit 1），对每个检查 `activeCount(running for agent) < agent.concurrency`，可用则 claim + `void executeRun(runRow)`（不 await）
  - `executeRun` 从 tick 内提取为独立 async 函数（多个可并发），含完整的 onEvent / backend.execute / 终态写库逻辑
  - `buildPrompt` 调用点传 run context：`{ isLeader: runRow.isLeader === 1, squadId: runRow.squadId }`
  - completed 分支：终态 comment 写入后调 `triggerFromComment(comment)`（spec §7.3 入口2）
  - 循环 import 安全（排雷补充#2）：所有交叉引用只在函数体内调用，不在模块顶层求值
  - 并发无锁安全（排雷补充#5）：Node 单线程 + tick 内 fire-and-forget = tick 同步跑完不会并发重入，**不加锁**
- `app/packages/server/src/routes/comments.ts`：POST comment 后调 `triggerFromComment(comment)`（spec §7.3 入口1）

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

三包全绿（shared + server + web）。

### buildPrompt briefing spike（核心验证）

用临时 db（`tmp-verify-s04.db`，migrate + seed 后跑，验证完已删）验证 briefing 注入。脚本对 FRI-11 调 `buildPrompt` 的 4 种场景：

| 场景 | 含 briefing? | roster 含 worker mention? | roster 不含 leader? | briefing 前置? |
|---|---|---|---|---|
| 普通调用（无 run） | ❌（期望） | — | — | — |
| leader run（isLeader:true, squadId:sqd-product） | ✅（期望） | ✅ research/prd/proto 三个 | ✅ 不含 agt-lead | ✅ 在 body 前 |
| worker run（isLeader:false） | ❌（期望） | — | — | — |
| leader run 但 squad 不存在 | ❌（降级普通，期望） | — | — | — |

**完整 leader prompt 输出**（roster 格式 + briefing 结构 + 前置确认）：

```
# Squad Operating Protocol
1. 队长接收 Issue briefing
2. 按专精 @mention 委派
3. 成员回帖交付物路径
4. 队长汇总后请求 MVP 签核

# Squad Roster
- 产品·需求与PRD官 — [@产品·需求与PRD官](mention://agent/agt-prd)
- 产品·设计·原型官 — [@产品·设计·原型官](mention://agent/agt-proto)
- 产品·调研与洞察官 — [@产品·调研与洞察官](mention://agent/agt-research)

# Mission Directive
基于 chanpin 真源产出 PRD + RTM + 可交互原型，Must 路径可点通。

---

Issue FRI-11: 毕设 multi-agent：产出 PRD 与可交互原型
...（body 正常）...
```

**comment-trigger 闭环前提成立**：seed 的 FRI-11 现有 agent comment 已含 `[@产品·调研与洞察官](mention://agent/agt-research)` 格式，parseMentions 正则 `/mention:\/\/(agent|squad)\/([\w-]+)/g` 能匹配。

### 关键数据校验（临时 db）

```
agent 4 行 concurrency: agt-lead=6, agt-research=4, agt-prd=4, agt-proto=6（全对）
squad 3 行带 protocol/directive（全对）
squad_member 6 行（全对）
loadSquadDetail(sqd-product).leaderId = agt-lead ✓
loadSquadDetail(sqd-product).members = [agt-prd, agt-proto, agt-research] ✓
getSquadLeaderId(sqd-product) = agt-lead ✓
getSquadLeaderId(sqd-eco) = agt-prd ✓
```

### 未跑的端到端链路验证

> 以下验收依赖真实 CLI 执行（leader claude-code 产出含 mention 的 finalText → comment-trigger → worker 并发），**留待 impl-3 或计划者验收**：
> - 指派 squad → leader run (is_leader=1) 被 enqueue + claim
> - leader 完成 → comment-trigger 给被 @worker enqueue → worker 并发执行（per-agent 槽）
> - 多 worker 被 @ → 并发（不同 agent 槽互不阻塞）
> - 熔断（issue run ≥15 → system comment）
> - S03 回归（指派普通 agent 仍正常跑）
>
> 代码路径已全部打通并 typecheck 通过；briefing 注入（闭环前提）已用 spike 证明正确。

## 与计划的偏离

1. **Task 2.4+2.5 合并执行（排雷补充#1 执行顺序）**：plan 原写 Task 2.4 先于 2.5，但 2.5 重写整个 run-worker.ts 会覆盖 2.4 对它的 trigger 挂接。实际合并为一个 commit（comment-trigger.ts 新建 + run-worker.ts 重写 + comments.ts 挂接），因为三文件形成循环 import 闭包，分开 commit 必然有中间态 typecheck 失败。这是计划者排雷时预见的，按其指引处理。

2. **抽 `checkAndEnqueue` 共用函数（排雷补充#3 DRY）**：plan 原代码 enqueueAgentRun 和 enqueueLeaderRun 有大量重复（去重+熔断+insert+publish+wake ~80 行复制粘贴）。实际抽 `checkAndEnqueue(issueId, agentId, opts?: { isLeader?; squadId? })` 共用函数，两者各一行调它。同时修正了 plan 里 enqueueLeaderRun 熔断只 `return null` 不写 system comment 的不一致——共用函数统一写 system comment。

3. **dev.db 未重置（同 impl-1）**：dev.db 被运行中的进程占用（`rm` 报 Device or resource busy），本环境有海量 node 进程无法安全定位占用者。改用临时 db（`tmp-verify-s04.db`）跑 migrate + seed + 全部 spike 验证。**dev.db 的实际重置（删 → migrate → seed）留待计划者验收前做**（需先停掉占用 dev.db 的 server 进程）。不影响代码正确性证明。

## 遗留 / 下一个执行者要注意的点（给 impl-3）

### 已就绪、impl-3 可直接用的

- **后端闭环全通**：briefing 注入 + squad→leader 路由 + comment-trigger + 并发改造，全部 typecheck 通过，briefing spike 验证正确。
- **前端零新增依赖**：S04 闭环靠现有时间线 + RunStatusBar 呈现（spec §8）。impl-3 重点是确认现有组件正确呈现闭环，若有缺陷小修。
- **熔断 system comment**：authorType='member', authorId='system'，body=`⚠️ 已达 issue run 上限（15），停止派发。`。前端时间线若显示 system author，注意 label 解析（resolveAuthorLabel 对 'system' 会返回 'system' 字符串——可能需小修显示成"系统"）。

### impl-3 验收时要注意的

1. **dev.db 必须重置**：当前 dev.db 可能还是旧 seed（缺 protocol/concurrency/member 真值）。impl-3 验收前必做：停 server → 删 `dev.db*` → `db:migrate` → `db:seed`。否则 briefing 拿到空 protocol、并发槽全默认 1。
2. **端到端链路验证需真实 CLI**：leader(claude-code) 必须在 finalText 里产出 `[@Name](mention://agent/<id>)` 格式，comment-trigger 才能解析派 worker。这是闭环成立的硬前提——若 leader CLI 不产出 mention，闭环不成立但不会出错（trigger 解析不到 mention 就不排 worker）。spike 已证明 seed comment 的 mention 格式能被正则匹配，但 leader 实际产出格式需 impl-3 端到端确认。
3. **并发回归**：指派普通 agent（非 squad）必须仍正常跑（S03 回归）。RunWorker 改造删了 busy 锁，改 per-agent 槽——单 agent 指派走相同 tick 路径，concurrency≥1 能 claim，应正常。impl-3 需跑一次确认。

### 文件改动清单（impl-2 触及的）

| 文件 | 改动 |
|---|---|
| `runtime/prompt.ts` | buildPrompt 加可选 run 参数 + briefing 前置 |
| `orchestration/run-service.ts` | 抽 checkAndEnqueue + per-(issue,agent) 去重 + 熔断 + enqueueLeaderRun |
| `routes/issues.ts` | PUT assignee=squad 分支 |
| `orchestration/comment-trigger.ts` | **新建** triggerFromComment + parseMentions + 防自指 |
| `orchestration/run-worker.ts` | **★核心重写** busy → per-agent 槽 + fire-and-forget 并发 |
| `routes/comments.ts` | POST 后挂 triggerFromComment |

## 验收结论（计划者填）

### impl-2 验收（2026-07-15 计划者复核）

- [ ] typecheck 通过
- [ ] `pnpm dev` 能跑
- [ ] 切片验收标准达成（见 roadmap）
- 结论：<待计划者填>
