# multica — 编排层源码深读

> 源码：`references/repos/multica/` · 栈：Go(Chi+sqlc) + Next.js · 更新：2026-07-08
> 高层摘要见：[../orchestration.md](../orchestration.md)

## 定位

multica 是「开源 Agent 托管平台」：把 14+ 种编码 Agent CLI（Claude Code / Codex / Pi / Hermes / Cursor…）变成看板上可分配任务的「队友」。它的价值不在 Agent 本身，而在**编排**——任务分发、状态机、实时进度、调度。

## 整体架构（四层协作）

```
DB (sqlc)  →  Services (纯逻辑)  →  Handlers (HTTP)  →  Daemon (独立进程)
                ↓ Publish
            EventBus  →  Broadcaster  →  WebSocket → 浏览器
```

| 层 | 位置 | 职责 |
|---|---|---|
| DB | `server/migrations/`, `server/pkg/db/` | 真相源；sqlc 生成类型安全查询 |
| Service | `server/internal/service/` | 纯业务逻辑，发 `events.Event`，无 HTTP |
| Handler | `server/internal/handler/` | HTTP 边界，校验后调 service |
| Daemon | `server/internal/daemon/`, `pkg/agent/` | 独立进程，poll/WS 监听任务，spawn 实际 CLI |
| Event Bus | `server/internal/events/bus.go` | 进程内同步 pub/sub，连接状态变更与 WS 扇出 |

**关键设计：DB 行就是锁。** 状态转换不用内存 mutex，而是单条原子 `UPDATE ... WHERE id=$1 AND status IN (...) RETURNING *`。`WHERE status IN (...)` 子句本身就是状态机守卫。

---

## 1. Agent 作为一等公民指派（数据模型）

核心模式：**多态指派用 `(type, id)` 判别列对**，而非 join table。

```sql
-- server/migrations/001_init.up.sql:52-72
CREATE TABLE issue (
    assignee_type TEXT CHECK (assignee_type IN ('member', 'agent')),
    assignee_id   UUID,
    creator_type  TEXT NOT NULL CHECK (creator_type IN ('member', 'agent')),
    creator_id    UUID NOT NULL
);
CREATE INDEX idx_issue_assignee ON issue(assignee_type, assignee_id);
```

同样的 `(type, id)` 模式遍布所有「actor 可能是人或 agent」的表：`comment.author_type/author_id`、`inbox_item.recipient_type/recipient_id`、`activity_log.actor_type/actor_id`。

### Squad 作为第三种指派类型

`084_squad.up.sql` 直接扩 CHECK 约束加 `'squad'`，另建 `squad`（带 `leader_id REFERENCES agent`）和 `squad_member`（本身多态：`member_type IN ('agent','member')`）。

### Agent 行

```sql
-- 001_init.up.sql:36-49
CREATE TABLE agent (
    runtime_mode   TEXT CHECK (runtime_mode IN ('local','cloud')),
    runtime_config JSONB,
    visibility     TEXT CHECK (visibility IN ('workspace','private')),
    status         TEXT CHECK (status IN ('idle','working','blocked','error','offline')),
    max_concurrent_tasks INT DEFAULT 1,
    owner_id       UUID REFERENCES "user"(id)
);
```

- `status` 是**派生**的，由 `RefreshAgentStatusFromTasks`（`internal/service/task.go:2274`）根据任务状态刷新。
- `runtime_mode`：`local`=daemon 挂的 CLI；`cloud`=服务端执行。

**TS 移植要点：** 用 discriminated union 对应 `assignee_type`，保留一个 `(assignee_type, assignee_id)` 复合索引。不要建指派解析 join table —— 读时按 type 分流查一次即可。

---

## 2. 任务生命周期状态机 + WebSocket

### 2a. 状态机在 SQL 里，不在 Go 里

每个转换都是单条原子 `UPDATE ... WHERE status IN (...) RETURNING *`。

状态：`queued → dispatched → running → completed | failed | cancelled`，外加 `waiting_local_directory` 和 `deferred`。

**关键转换（全在 `server/pkg/db/queries/agent.sql`）：**

| 操作 | 查询 | 位置 |
|---|---|---|
| enqueue | `CreateAgentTask` 插 `status='queued'` | `agent.sql:162` |
| **claim** | `ClaimAgentTask` 原子 `queued→dispatched` | `agent.sql:349` |
| start | `StartAgentTask` `dispatched→running` | `agent.sql:424` |
| complete | `CompleteAgentTask` `running→completed` | `agent.sql:456` |
| fail | `FailAgentTask` `dispatched\|running→failed` | `agent.sql:521` |

#### Claim 查询是全库皇冠（`agent.sql:349-387`）

```sql
UPDATE agent_task_queue
SET status='dispatched', dispatched_at=now(), prepare_lease_expires_at=now()+@secs
WHERE id = (
  SELECT atq.id FROM agent_task_queue atq
  WHERE atq.agent_id=$1 AND atq.status='queued'
    AND NOT EXISTS (          -- 每个 (agent, scope) 同时只一个在跑
      SELECT 1 FROM agent_task_queue active
      WHERE active.agent_id=atq.agent_id
        AND active.status IN ('dispatched','running','waiting_local_directory')
        AND <同 issue/chat/quick-create scope>)
  ORDER BY atq.priority DESC, atq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED     -- 跨进程公平，不阻塞
) RETURNING *;
```

- `FOR UPDATE SKIP LOCKED` 让多 host 的 daemon poller 可以竞争同一行集而不互相阻塞，只有一个赢。
- 内层 `NOT EXISTS` 强制「每个 (agent, scope) 同时只有一个在跑」，不同 agent 可共享一个 issue。

#### Lease / 崩溃恢复机制

三列支撑崩溃恢复：`dispatched_at`、`prepare_lease_expires_at`、runtime `last_seen_at`。

- `ReclaimStaleDispatchedTaskForRuntime`（`agent.sql:389`）重投递 daemon 没收到的任务。
- `RecoverOrphanedTasksForRuntime`（`agent.sql:552`）daemon 启动时把所有它持有的 dispatched/running 任务 fail 掉。
- `FailStaleTasks`（`agent.sql:569`）服务端清扫器：lease 过期的 dispatched + 心跳过期的 running。**关键**：running 分支**排除**心跳仍活的任务 —— 多小时的长任务只要 daemon 还在心跳就能存活。

**TS 移植要点：** 状态转换用 `UPDATE ... WHERE status IN (allowed) RETURNING *`。不要写内存状态机 —— 行 + 条件更新免费给你幂等、并发安全、崩溃恢复。加 lease 列 + 后台清扫器处理卡死的任务。

### 2b. claim → run → report 流（daemon 侧）

`internal/daemon/daemon.go`，每个注册的 runtime 一个 poller goroutine（`runRuntimePoller` daemon.go:2591）：

1. 从 buffered channel（信号量，`MaxConcurrentTasks`）拿并发槽。
2. `client.ClaimTask` → HTTP POST → 服务端跑 ClaimAgentTask。
3. `handleTask`（daemon.go:2827）拿 `local_directory` 路径锁，必要时转 `waiting_local_directory`。
4. `runTask`（daemon.go:3451）：准备隔离 exec 环境 → `client.StartTask`（dispatched→running，**在 workdir 落盘后才转**，race fix #3999）→ 构 prompt → `executeAndDrain`。
5. `executeAndDrain`（daemon.go:4126）：包 `backend.Execute`，goroutine 里 drain `Session.Messages` channel，批量 POST `ReportTaskMessages`（daemon.go:4219）。独立 idle watchdog 在静默时取消子进程和 drain。
6. `reportTaskResult`（daemon.go:3126）：`CompleteTask` 或 `FailTask`。
7. `watchTaskCancellation`（daemon.go:2777）：若服务端已转 terminal（用户取消/重派）或删行，取消 agent。

### 2c. WebSocket 三跳 pub/sub

与任务行**解耦**的实时流：

| 跳 | 位置 | 动作 |
|---|---|---|
| 1 | service（`task.go:2539` `broadcastTaskEvent`） | 状态转换后 `Bus.Publish(events.Event{Type, WorkspaceID, Payload})` |
| 2 | `events.Bus`（`bus.go`）同步 in-process pub/sub | `Subscribe(type, handler)` / `SubscribeAll`，panic recovery |
| 3 | `cmd/server/listeners.go:151` 单个 `bus.SubscribeAll` | 序列化事件 → `Broadcaster.BroadcastToWorkspace` |

`Broadcaster` 是接口（`internal/realtime/broadcaster.go`）：单节点用 `realtime.Hub`（gorilla/websocket，按 workspace 分 room），横向扩展用 Redis Streams relay（`redis_relay.go`）。

**进度特殊性：** daemon POST `/tasks/{id}/progress`（`handler/daemon.go:2209`）→ `ReportProgress`（`task.go:2256`）只发 `task:progress` 事件，**不写 DB** —— 是 fire-and-forget。token/message 流（`ReportTaskMessages`）写 `task_message` 表供回放，但实时也走 bus。

事件类型（`pkg/protocol`）：`task:queued`、`task:dispatch`、`task:running`、`task:progress`、`task:completed`、`task:failed`、`task:cancelled`、`task:waiting_local_directory`。

**TS 移植要点：** 解耦「行转换」（DB）和「通知客户端」（事件总线 → WebSocket）。总线可同步 in-process；唯一扩展缝是 `Broadcaster` 接口。进度用临时事件，不要进 DB 列。

---

## 3. Squads —— 组长路由

**核心设计：Squad 永远由恰好一个 agent —— 它的 `leader_id` —— 执行。** 任务层没有 fan-out；leader 被 brief 去通过 @mention 委派，那些 mention 在 leader 的 peer 上排新任务。这让任务队列模型保持统一（每个 task 一个 agent_id）。

### 路由决策 —— `IssueService.WillEnqueueRun`

`internal/service/issue_trigger.go:89-166` 是「这次 issue 写入会不会启动一次 run，给谁」的唯一判定。对 `assignee_type='squad'`（issue_trigger.go:136-163）：解析 squad → 拿 leader → 检查 `AgentReadiness` → 返回 `IssueRunTrigger{AgentID: squad.LeaderID, AssigneeType:"squad"}`。

即 squad 指派变成 **leader agent 队列上的一个任务**。

### Comment 触发的路由

`internal/handler/comment.go:1465` `computeCommentAgentTriggers` 解析 `ParseMentions` 并分类每个 mention：

| Source | 含义 |
|---|---|
| `commentTriggerSourceIssueAssignee` | 无 mention，路由到 issue 指派人（或 squad leader） |
| `commentTriggerSourceMentionAgent` | 显式 `@agent` |
| `commentTriggerSourceMentionSquadLeader` | 显式 `@squad` → 解析 squad → 排 leader |
| `commentTriggerSourceThreadParent` | 回复父作者 |

还有一个 **deferred fallback**（`task.go:799` `EnqueueDeferredAssigneeFallback`）：主路由可带 `EscalationFallback`，创建惰性 `deferred` 任务，`fire_at` 之后才可 claim —— 主 agent N 分钟没响应就自动 escalate。

### Leader briefing —— claim 时注入

两列驱动（`090_task_is_leader.up.sql`、`127_task_squad_id.up.sql`）：`is_leader_task BOOLEAN`、`squad_id UUID`。claim 时（`handler/daemon.go:1458`）：若 task 是 leader task 且 squad 已解析，构建 briefing 追加到 `agent.Instructions`。

briefing 三段（`handler/squad_briefing.go:112`）：
1. **Squad Operating Protocol**（常量，`:20-97`）：告诉 leader「用 @mention 委派，别自己干，记录每次评估，派完后停」。
2. **Squad Roster**：每个成员渲染成字面 `[@Name](mention://agent/<UUID>)` markdown，leader 可直接贴回。
3. 用户自定义 squad 指令。

mention-link 语法闭环：leader 的 comment mention 一个 worker → comment trigger 再触发 → 在 worker 上排任务。

**为什么 `is_leader_task` 而非查 `issue.assignee_type='squad'`：** `@squad` mention 在指派给普通 agent 的 issue 上也需要 leader briefing（MUL-3724），issue 级判定漏了这条路径。flag 在 enqueue 时盖一次（`task.go:774`），随重试/clone 传播。

**TS 移植要点：** 不要建单独的「squad task」抽象。Squad = leader agent + claim 时注入的 briefing blob + 一组可 mention 的 peer roster。委派机制就是「leader 发一条带类型 mention 的 comment，现有 comment-trigger 管线排下一个任务」。deferred-escalation 任务（`deferred` 状态 + `fire_at`）是做「N 分钟无响应则升级」的干净方式。

---

## 4. Autopilot —— Cron / Webhook 调度器

两层架构：底层通用调度器 + 上层 autopilot hook。

### 层 A：通用调度器（`internal/scheduler/`）

`JobSpec`（`spec.go:102-192`）：`Name`、`Cadence`、`CatchUpMode`（`latest_only`/`every_plan`）、`RunTimeout`、`StaleTimeout`、`HeartbeatInterval`、`MaxAttempts`、`RetryBackoff`、`Scopes` provider、`Handler`。

锁模型：单表 `sys_cron_executions`，唯一键 `(job_name, scope_kind, scope_id, plan_time)`。

`Manager.Run`（`manager.go:95`）每 `TickInterval`（默认 30s）tick 一次，每个 tick 跑 `runJob`：`markStaleAsFailed` → 算 plans → `tryClaim`（DB 原子 INSERT + lease token）→ `runClaimed`（跑 Handler，heartbeat goroutine 续 lease，返回写 terminal）。

**关键属性：每个 app 实例都 tick 同样的 jobs，但唯一索引保证只有一个赢，输家 no-op。** 这是基于 DB 锁的 multi-leader 调度。

### 层 B：autopilot 作为 hook 驱动的调度 job

`internal/scheduler/jobs_autopilot.go` 注册 `autopilot_schedule_dispatch`。因 cron 表达式任意，用 `PlansForScope`（`:118`）而非 cadence grid：**每个 trigger 是自己的 scope**（scope_id = trigger UUID），`autopilotPlansForScope`（`:235`）枚举 `(lastPlan, now]` 的 cron 触发点。

### 层 C：实际分发（`internal/service/autopilot.go`）

`DispatchAutopilot`（`autopilot.go:67`）入口。幂等守卫：部分唯一索引 `uq_autopilot_run_trigger_planned` on `(trigger_id, planned_at)`。

核心 `dispatchAutopilot`（`:200`）：
1. **准入 gate**（`shouldSkipDispatch` `:843`）：解析指派人（agent，或 squad→leader `:963`）、查 `AgentReadiness`、查调用权限。
2. 建 `autopilot_run` 行。
3. 按 `execution_mode` 分支：
   - `create_issue`（`:288`）：DB 事务里去重、建 issue（`creator=leader agent`, `origin_type=autopilot`）、扇出模板订阅、commit、发 `issue:created`。issue listener 走正常路径排任务。**autopilot-on-squad 复用和人工指派完全相同的 squad 路由。**
   - `run_only`（`:548`）：直接建任务，调 `NotifyTaskEnqueued` 唤醒 daemon。

**离线行为差异**（关键设计）：`run_only` 模式离线时**跳过**（记 `skipped`），`create_issue` 模式离线时**允许**（issue 是持久审计记录，稍后被 claim）。防止离线笔记本任务堆积（MUL-1899）。

### Webhook 触发

`autopilot_trigger` 行 `kind='webhook'` 有唯一 `webhook_token`（`042_autopilot.up.sql`）。`HandleAutopilotWebhook`（`autopilot_webhook.go:343`）：签名校验（per-provider HMAC，如 GitHub）→ 规范化为 `WebhookEnvelope`（`event`+`eventPayload`）→ 事件过滤 → 存 `webhook_delivery` → `DispatchAutopilot(source="webhook", payload)`。payload 作为 JSON 块嵌进 issue description，agent 内联看到事件。

**TS 移植要点：** 先建通用「plan+claim+lease+heartbeat+terminal write」调度原语，键 `(job, scope, plan_time)` 加唯一约束 —— 然后把 cron 表达为产出 plan_times 的 hook，webhook/manual 表达为绕过 planner 但复用 `dispatchAutopilot` 核心的直接调用。

---

## 5. 本地 Daemon —— Agent CLI 发现与路由

daemon（`multica daemon`）是 server 任务队列和实际编码 CLI 的桥。

### 发现（`internal/daemon/config.go`）

`LoadConfig`（`config.go:141`）启动时探针每个支持的 CLI：

1. env 覆盖 `MULTICA_<NAME>_PATH`，否则裸命令名。
2. `resolveAgentExecutablePath`（`config.go:663`）→ `exec.LookPath`，**排除 `~/.multica/hooks` 目录**防自解析 hook shim。
3. LookPath 失败 → 登录 shell 一次性解析所有命令名（`resolveAgentsViaLoginShell` `config.go:832`，`-ilc`）。救回 fnm/nvm 装的 CLI。
4. 特例：Codex Desktop 捆在 `Codex.app/Contents/Resources/codex`。

结果 `cfg.Agents map[string]AgentEntry`，键是 provider slug。空则硬失败。

### 注册

`registerRuntimesForWorkspace`（`daemon.go:917`）：对每个发现的 CLI 跑 `--version`，构 `{name, type, version, status="online"}`，POST `/register`。server 建 `agent_runtime` 行返回 runtime ID，daemon 存 `runtimeIndex`。

### Backend 抽象（`pkg/agent/`）

```go
// agent.go:16
type Backend interface {
    Execute(ctx, prompt, opts) (*Session, error)
}
```

`agent.New(type, cfg)`（`:177`）工厂 switch 返回 14 个具体 backend 之一。每个 spawn 自己的 CLI（如 claude `--output-format stream-json`），pipe stdin/stdout，返回 `Session{Messages <-chan Message, Result <-chan Result}`。**所有 provider 归一成流式 message channel** —— 这是 daemon 能统一对待它们的原因。

### 唤醒路由 —— 推而非纯 poll

daemon 不纯 poll。维护 **WebSocket 任务唤醒连接**（`internal/daemon/wakeup.go:33`），scope 到自己的 runtime ID。任务入队时 `TaskService.notifyTaskAvailable`（`task.go:2489`）：
1. bump 该 runtime 的「空 claim 缓存」失效版本。
2. `Wakeup.NotifyTaskAvailable(runtimeID, taskID)` → `RelayNotifier`（`daemonws/notifier.go:23`）推 `task_available` 帧到本地 daemon hub，经 Redis 到 daemon 连接的 API 节点。

daemon 侧 `runTaskWakeupConnection`（`wakeup.go:93`）读帧 → 信号 per-runtime poller 的唤醒 channel → 立即 `ClaimTask` 而非等下个 poll。polling 作为 WS 不可用时的 fallback。

**TS 移植要点：** 每个 agent runtime 归一到 `Backend { execute(prompt): AsyncIterator<Message> }` 接口；每个 provider adapter 就是 arg 构建 + stdout 解析。发现 = `LookPath` + env 覆盖 + 登录 shell fallback。推送达：保持一个按 runtime ID scope 的长 WebSocket，enqueue 时发 `task_available` nudge；polling 作 fallback。

---

## 跨切面模式（值得逐字搬）

| 模式 | 位置 | 为什么重要 |
|---|---|---|
| **DB 行即锁** | 所有状态转换 | 条件 `UPDATE...WHERE status IN(...) RETURNING *` 给幂等+并发安全+崩溃恢复，零 mutex |
| `FOR UPDATE SKIP LOCKED` | Claim、stale 清扫 | 公平非阻塞多消费者 claim |
| 进程内同步总线 → Broadcaster 接口 → WS/Redis | 三层 | `Broadcaster` 是唯一横向扩展缝 |
| 多态 `(type, id)` 指派列 + CHECK | 所有 actor 表 | 不用 join table |
| Lease + heartbeat + sweeper | 崩溃恢复 | dispatched 的 `prepare_lease`，running 的 `last_seen_at`，`FailStaleTasks` 兜底 |
| 「Leader 执行；briefing 教委派」 | Squad | 不需要原生 fan-out 原语 |
| 部分唯一索引做幂等 | autopilot `(trigger_id, planned_at)` | 安全重试 |
| 准入 gate vs 持久审计 | `run_only` 跳过 / `create_issue` 继续 | issue 行就是审计记录 |

## 给 TS 移植的告诫

multica 的状态机累积了大量边界 case 列（`wait_reason`、`force_fresh_session`、`head_sha` 去重、`failure_reason` 分类、`GetLastTaskSession` 的毒会话排除）。TS 移植**从核心六状态 + lease 列起步**，按需再加那些精修。

## 关键文件索引

| 主题 | 位置 |
|---|---|
| 指派 schema | `001_init.up.sql:52-72`、`084_squad.up.sql`、`090_task_is_leader.up.sql`、`127_task_squad_id.up.sql` |
| 任务状态机 SQL | `server/pkg/db/queries/agent.sql:349`(Claim) `:424`(Start) `:456`(Complete) `:521`(Fail) `:552`(Recover) `:569`(FailStale) |
| service 广播 | `internal/service/task.go:2539` `:2507` `:2256` `:2489` |
| 事件总线 | `internal/events/bus.go` |
| Bus→WS 桥 | `cmd/server/listeners.go:151` |
| daemon claim/run | `internal/daemon/daemon.go:2591`(poller) `:2827`(handle) `:3451`(run) `:4126`(drain) |
| squad 路由 | `internal/service/issue_trigger.go:89-166`、`internal/handler/comment.go:1398-1462` |
| squad briefing | `internal/handler/daemon.go:1458`、`internal/handler/squad_briefing.go:20,112` |
| 调度器 | `internal/scheduler/spec.go:102`、`manager.go:95,194,319` |
| autopilot | `internal/scheduler/jobs_autopilot.go:89,235,328`、`internal/service/autopilot.go:67,200,288,548,843` |
| webhook | `internal/handler/autopilot_webhook.go:343` |
| daemon CLI 发现 | `internal/daemon/config.go:141,663,832`、`internal/daemon/daemon.go:917` |
| Backend 抽象 | `pkg/agent/agent.go:16,177`、`pkg/agent/claude.go:24` |
| 唤醒 WS | `internal/daemon/wakeup.go:33`、`internal/daemonws/notifier.go:23` |
