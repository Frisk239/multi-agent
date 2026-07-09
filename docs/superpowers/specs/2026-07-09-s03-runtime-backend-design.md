# S03 设计 spec — 真实 Agent 执行层（RuntimeBackend）

> 状态：✅ 用户已通过 · 实现计划已就绪 · 日期：2026-07-09 · 切片：S03 · 建议分支：`feat/s03-runtime-backend`
> 真源依据：[AGENTS.md](../../../AGENTS.md) · [design/slices.md](../../../design/slices.md) · [design/synthesis.md](../../../design/synthesis.md) §2.6 · [design/borrow-from-references.md](../../../design/borrow-from-references.md) · [s02-planner-2.md](../../../app/.progress/s02-planner-2.md) · [deep/multica.md](../../../references/deep/multica.md) §5 · [deep/pi.md](../../../references/deep/pi.md) §5 · 原型 `renderRuntime` + seed machines/runtimes · RTM UI-RT
> 产出流程：brainstorming（本文件）→ writing-plans → 执行者拆分

## 0. 摘要

S03 在 S01/S02 编排外壳上打通 **本机 CLI 真实执行**：`RuntimeBackend` 三实现（Claude Code / opencode / Cursor）、任务行 `agent_run`、消息回放 `run_message`、指派 agent 即跑、可取消、双栏 `/runtimes` 发现页。  
**Pi 仅作事件/会话设计参考，不做 S03 必验 Backend。** 进程模型：**方案 1**——编排主进程 + 每 run spawn CLI 子进程（非多机 daemon）。

**一句话验收：** 配置 `MA_WORKSPACE_CWD` 且本机装齐三 CLI → `/runtimes` 显示探测 → 详情指派不同 runtime 的 agent → 自动执行 → 轨迹可回放 + 时间线摘要 + 可停止；三 CLI 各成功至少一次。

---

## 1. 范围与架构边界

### 1.1 在范围内

```
┌─ web :3000 ─────────────────────────────────────────────┐
│  / 看板 · /issues/[id]（指派/停止/轨迹）· /runtimes 双栏   │
└──────────────┬──────────────────────┬───────────────────┘
        REST   │                      │ WS
┌──────────────┴──────────────────────┴───────────────────┐
│ server :3001                                              │
│  PUT issue（assignee→enqueue）· runs CRUD/cancel          │
│  GET /api/runtimes（虚拟本机 + detect）                    │
│  RunWorker（claim → Backend.execute → 终态 comment）      │
│  runtime/{claude-code,opencode,cursor}.ts                 │
│  EventBus → WsBroadcaster（+ run:* 事件）                 │
│  DB: agent.runtime · agent_run · run_message              │
└───────────────────────────────────────────────────────────┘
```

### 1.2 不在范围内

| 排除 | 归属 |
|---|---|
| PiBackend 必验 / Pi TUI | 参考 only；可选后续 |
| mention 入队 / Squad briefing | S04 |
| Skill URL / MCP 配 agent | S05 |
| 多机 machine、真 daemon 进程、Redis | 永不（纯本地方案 1） |
| 费用真数据、添加电脑、View logs/Restart daemon | 后置 |
| 自造 Agent loop | 禁止 |
| Wiki / Memory | Phase 2–3 |

### 1.3 刻意简化

1. 单 workspace；cwd 仅 env `MA_WORKSPACE_CWD`  
2. 同 issue 最多一条 active run（queued|running）  
3. 全局 RunWorker 小并发（默认 1～2）  
4. 费用列 UI 占位 `—`  
5. 看板 running 角标可选，**不纳入必验**

---

## 2. 决策记录（brainstorm）

| 代号 | 决议 |
|---|---|
| N1 | Backend：Claude Code / opencode / Cursor **三端到端**；Pi **参考不实现** |
| N2 | 指派变为 `assignee.type=agent` → **自动跑**；squad/null **不跑**并 cancel active |
| N3 | 流式 **对齐 multica**：progress **仅 WS**；消息 → `run_message` + WS；终态 **1 条** agent comment |
| N4 | 薄表 `agent_run` + `run_message`（非 issue 挂字段、非 multica 边界列全集） |
| N5 | cwd = `MA_WORKSPACE_CWD` |
| N6 | `/runtimes` **双栏**（抄原型 IA，单机） |
| N7 | `agent.runtime` 字段；seed 三 agent 各绑一个 |
| N8 | 进程 **方案 1**（主进程 + CLI 子进程） |
| N9 | **终止必做**（停止按钮 + 改指派 cancel + Abort/kill） |
| N10 | 指派 agent 前 **confirm** |

---

## 3. 数据模型

### 3.1 `agent` 扩展

| 列 | 类型 | 说明 |
|---|---|---|
| `runtime` | text NOT NULL | `claude-code` \| `opencode` \| `cursor` |

**Seed 绑定（可调，须覆盖三 runtime）：**

| agent | runtime |
|---|---|
| `agt-lead` | `claude-code` |
| `agt-research` | `opencode` |
| `agt-prd` | `cursor` |
| `agt-proto` | `claude-code`（或 cursor，与 lead 可重复） |

### 3.2 `agent_run`

| 列 | 说明 |
|---|---|
| `id` | text PK UUID |
| `issue_id` | FK → issue |
| `agent_id` | text NOT NULL |
| `runtime` | 快照：执行时用的 backend id |
| `status` | `queued` \| `running` \| `completed` \| `failed` \| `cancelled` |
| `error` | text null |
| `started_at` / `finished_at` / `created_at` | integer ms |

**不变量：** 同一 `issue_id` 至多一条 `status IN ('queued','running')`（部分唯一索引若 SQLite 版本支持；否则应用层条件检查 + 事务）。

### 3.3 `run_message`（对齐 multica `task_message`）

| 列 | 说明 |
|---|---|
| `id` | PK |
| `run_id` | FK → agent_run |
| `seq` | integer，run 内递增 |
| `kind` | `assistant` \| `user` \| `tool_start` \| `tool_end` \| `system` |
| `body` | text（纯文本或 JSON 字符串） |
| `created_at` | ms |

索引：`(run_id, seq)`。

### 3.4 comment 分工

| 内容 | 存储 |
|---|---|
| 进度/心跳/token delta | **不进 DB**，仅 `run:progress` WS |
| tool/消息轨迹 | `run_message` |
| 人读最终回复 | **一条** `comment`（author_type=agent, author_id=agentId） |
| 取消 | run.status=cancelled；可选一条短 system comment（非必须） |

### 3.5 Issue 指派

- `UpdateIssueInput.assignee` **放开**：`{ type, id } | null`（无 label）  
- GET 仍服务端填 label  
- 仅 `type==='agent'` 触发 enqueue  

### 3.6 配置

| 变量 | 含义 |
|---|---|
| `MA_WORKSPACE_CWD` | 执行 cwd；缺失 → run 快速 `failed`，error 说明配置 |
| `CLAUDE_PATH` / `OPENCODE_PATH` / `CURSOR_PATH` | 可选覆盖 LookPath |

密钥：各 CLI 自带登录；平台不存 provider key。

---

## 4. shared 契约（要点）

```ts
RuntimeId = z.enum(['claude-code', 'opencode', 'cursor'])

AgentRunStatus = z.enum(['queued','running','completed','failed','cancelled'])

AgentRun = z.object({
  id, issueId, agentId, runtime: RuntimeId, status: AgentRunStatus,
  error: z.string().nullable(),
  startedAt, finishedAt, createdAt // ISO strings in API
})

RunMessageKind = z.enum(['assistant','user','tool_start','tool_end','system'])
RunMessage = z.object({ id, runId, seq: z.number().int(), kind, body, createdAt })

// AgentSummary 扩展 runtime
// UpdateIssueInput 增加 assignee（与 Create 输入同形，无 label）

// WS
RunQueuedEvent | RunRunningEvent | RunCompletedEvent | RunFailedEvent | RunCancelledEvent
RunProgressEvent  // ephemeral, 无 DB id 要求
RunMessageEvent   // 与 RunMessage 同形，按 id 幂等
```

`DomainEvent` 联合加入上述 run 事件。

**AgentEvent（进程内，Backend → Worker，形状参考 Pi）：**

```ts
| { type: 'message_delta'; text: string }
| { type: 'message'; role: 'assistant'|'user'; text: string }  // 成段落库
| { type: 'tool_start'; name: string; args?: unknown }
| { type: 'tool_end'; name: string; result?: string }
| { type: 'log'; text: string }  // → progress 或 system
```

`ExecutionResult`: `{ finalText: string; exitReason: 'completed'|'cancelled'|'failed'; error?: string }`

---

## 5. API

| 方法 | 路径 | 说明 |
|---|---|---|
| PUT | `/api/issues/:id` | 扩展 assignee；副作用见 §6 |
| GET | `/api/agents` | 含 `runtime` |
| GET | `/api/runtimes` | 见 §5.1 |
| GET | `/api/runs?issueId=` | 列表新→旧 |
| GET | `/api/runs/:runId` | 单条 |
| GET | `/api/runs/:runId/messages` | seq ASC |
| POST | `/api/runs/:runId/cancel` | **唯一**取消入口（R1）。详情先 `GET /api/runs?issueId=` 取 active 再 cancel |

### 5.1 `GET /api/runtimes` 响应

```ts
{
  machine: {
    id: 'machine-local',
    name: '林远 本机',
    status: 'online',
    cwd: string | null,
  },
  runtimes: Array<{
    id: RuntimeId,
    label: string,
    installed: boolean,
    version: string | null,
    path: string | null,
    agentIds: string[],
  }>
}
```

**不建 machine 表**——虚拟本机。`agentIds` 由 DB agent.runtime 聚合。

---

## 6. 指派即跑 · Worker · 取消

### 6.1 PUT issue 副作用

```
1. load prev issue
2. apply updates (incl assignee)
3. if assignee identity changed:
     cancelActiveRun(issueId)  // abort + status cancelled
     if newAssignee?.type === 'agent':
       insert agent_run(queued) if no other active
       wake worker
4. publish issue:updated
5. publish run:* as needed
```

「identity」= `(type, id)` 对；仅 label 变化不触发。

### 6.2 RunWorker

- 主进程内循环/队列；`claim`：`UPDATE … WHERE status='queued' …` → `running`  
- `backend = registry[run.runtime]`  
- `!await detect().installed` → `failed`  
- `!MA_WORKSPACE_CWD` → `failed`  
- `execute(input, onEvent, signal)`：  
  - progress/log/delta → `run:progress` only  
  - message/tool_* → insert `run_message` + `run:message`  
- success → `completed` + comment(body=finalText, author=agent)  
- abort → `cancelled`  
- throw → `failed` + error  

Prompt 最少：title + description + 最近 **K=20** 条 comments 文本（R2，可配置常量）。临时上下文进 user 侧内容（hermes cache 规则）。

### 6.3 取消（必做）

```
POST cancel:
  row = UPDATE agent_run SET status='cancelled', finished_at=now
        WHERE id=? AND status IN ('queued','running') RETURNING *
  if no row → 409 or 204
  abortControllers.get(id)?.abort()
  kill process group if any
  WS run:cancelled
```

入口：详情「停止」；改指派/清空指派时内部调用。

---

## 7. 三 Backend

### 7.1 发现

| id | 探测 |
|---|---|
| claude-code | `CLAUDE_PATH` → `claude` + `--version` |
| opencode | `OPENCODE_PATH` → `opencode` + version |
| cursor | `CURSOR_PATH` → `cursor` / 官方 CLI 名 + version |

### 7.2 执行（实现期 spike 钉死 argv）

| id | 初值策略 |
|---|---|
| claude-code | `claude -p <prompt> --output-format stream-json --verbose`（+ 文档推荐 partial 标志）NDJSON 解析 |
| opencode | `opencode run "<prompt>"`；无稳定 JSON 流则行缓冲/整段 assistant message |
| cursor | headless CLI（spike 钉死）；同 opencode 降级策略 |

**实现顺序：** 接口+Worker → Claude → opencode → Cursor（Cursor 首 Task 可并行 spike 笔记）。  
**验收：** 三 CLI **各至少一次 completed**（验收机须装齐并登录）。  
**降级（R5）：** opencode/cursor 若无稳定 stream-json，允许仅整段 stdout → 一条 `assistant` `run_message` + 终态 comment，仍算该 runtime 验收通过。  
**迁移（R4）：** `ALTER TABLE agent ADD runtime`（或 regenerate）；本地删 `dev.db*` 后 migrate+seed。

### 7.3 不实现

- `opencode serve` 长驻 HTTP 编排  
- Pi `createAgentSession` 作为必验路径  

---

## 8. WebSocket

| type | 持久化 | 说明 |
|---|---|---|
| `run:queued` / `running` / `completed` / `failed` / `cancelled` | run 行 | 摘要 payload |
| `run:progress` | **否** | fire-and-forget |
| `run:message` | 是（先写 DB 再发或同事务后发） | 按 message.id 幂等 |
| 既有 issue/comment 事件 | 是 | 不变 |

---

## 9. 前端

### 9.1 路由

| path | 内容 |
|---|---|
| `/` | 看板 |
| `/issues/[id]` | 详情 + 指派/停止/轨迹 |
| `/runtimes` | 双栏运行时页 |

顶栏导航：`看板 | 运行时`。

### 9.2 详情扩展

- `AssigneeSelect`：agents + runtime 标签；confirm 后 PUT  
- `RunStatusBar`：状态 pill + **停止**  
- `RunTrace`：`run_message` 列表；WS 追加；刷新拉 API  
- progress：spinner/小字，不进永久 trace 列表  
- 时间线：继续 S02 comments（含终态 agent 摘要）

### 9.3 `/runtimes`（抄原型 `renderRuntime`，本地化）

**布局：**

- 左：固定机器卡「林远 本机」+ Local badge + online + runtime 数量  
- 右头：机器名、在线、已安装数、cwd 摘要、`重新探测`  
- 右表列：运行时 | 健康度 | 智能体 | 费用-7天 | CLI  

**S03 不做：** +添加运行时/电脑、View logs、Restart、真费用（列显示 `—`）、多机 Tab。

**数据：** 一次 `GET /api/runtimes`。

### 9.4 Hooks

`useRuntimes` · `useRuns(issueId)` · `useRunMessages(runId)` · `useCancelRun` · 扩展 `useUpdateIssue`（assignee）· WS 处理 run 事件。

D12：可乐观 assignee；**禁止**乐观插 run_message。

---

## 10. 本切片抄自（Borrow matrix）

| ID | 能力 | 主抄 | 深读/锚点 | 我们落点 | 不抄/延后 |
|---|---|---|---|---|---|
| G-BACKEND | RuntimeBackend | multica + synthesis §2.6 | deep/multica §5 | `server/src/runtime/*` | 14 CLI |
| G-DETECT | LookPath 发现 | multica daemon config | multica §5 发现 | detect + GET runtimes | 登录 shell fallback 可后做 |
| G-STREAM | message 回放 + progress 不进 DB | multica task_message / ReportProgress | multica §2c | run_message + WS | — |
| G-TASK-ROW | 薄 run 状态机 | multica task | multica §2 | agent_run | 边界 case 列 |
| G-ABORT | 取消 | multica cancel + signal | daemon watchTaskCancellation | POST cancel | — |
| G-UI-RT | 双栏机器+表 | **原型** renderRuntime | app.js:703 · RTM UI-RT | `/runtimes` | 费用/多机/daemon 运维 |
| G-EVENT-SHAPE | 事件生命周期 | **Pi 参考** | deep/pi §3 | AgentEvent | PiBackend 必验 |
| G-PROMPT-CACHE | 临时上下文进 user | hermes | hermes-execution §3 | prompt 组装 | 整段 loop |
| G-EXIT | exitReason | hermes | hermes-execution §1 | ExecutionResult | — |

完整审计见 [borrow-from-references.md](../../../design/borrow-from-references.md)。

---

## 11. 执行者拆分

| 会话 | 范围 | 门槛 |
|---|---|---|
| **impl-1** | shared 契约；agent.runtime；agent_run/run_message migration；seed 三绑定；reshape | typecheck；migrate+seed |
| **impl-2** | Backend 三实现 + detect；RunWorker；PUT 指派副作用；cancel；WS 事件；摘要 comment | 三 CLI API 自测 + cancel |
| **impl-3** | 详情指派/confirm/停止/Trace；/runtimes 双栏；导航；WS 前端；§12 浏览器验收 | §12 勾选 |

impl-2 过长时可拆 2a（Claude+Worker）/ 2b（opencode+Cursor）。

---

## 12. 验收标准

### 12.1 工程

- [ ] `pnpm -r typecheck`  
- [ ] `pnpm dev`；文档说明三 CLI 与 `MA_WORKSPACE_CWD`  

### 12.2 运行时页

- [ ] 双栏：本机卡 + 5 列表  
- [ ] 三 CLI 行；installed/version/path；agent 数量合理  
- [ ] 重新探测有效  
- [ ] 费用为 `—` 可接受  

### 12.3 执行

- [ ] 指派 agent → confirm → 自动 run  
- [ ] progress 不刷 comment 表  
- [ ] run_message 刷新可回放  
- [ ] 终态 agent comment  
- [ ] 停止 → cancelled  
- [ ] 改指派 cancel 旧 run；无双 active  
- [ ] **Claude Code / opencode / Cursor 各 ≥1 次 completed**（R5 降级策略允许）  
- [ ] 演示提示（R3）：seed FRI-11 为 **squad**，执行 demo 需改指派到具体 agent（或另建/选用已指派 agent 的 issue）

### 12.4 回归

- [ ] 看板 + S02 评论/状态/双窗口 issue 事件  

### 12.5 不验收

PiBackend、mention 入队、Squad、Skill/MCP、多机、真费用。

---

## 13. 风险

| 风险 | 缓解 |
|---|---|
| Cursor/opencode CLI 变更 | spike 写死 argv；handoff 记版本 |
| 验收机缺 CLI | 失败可见；验收清单要求装齐 |
| Windows 进程树 | tree-kill / taskkill /T |
| 误指派烧调用 | confirm + 停止 + 单 active |
| 切片过厚 | 严守 §1.2；可选拆 impl-2 |
| running 卡死无 sweeper（R6） | S03 靠用户停止；不强制 lease sweeper（S03+） |
| FRI-11 默认 squad（R3） | 验收脚本/说明：改指派到 agent |

---

## 14. 下一步

1. ~~用户复核本 spec~~ ✅  
2. ~~writing-plans~~ → [`docs/superpowers/plans/2026-07-09-s03-runtime-backend.md`](../plans/2026-07-09-s03-runtime-backend.md)  
3. 开 `feat/s03-runtime-backend`，impl-1 → 2 → 3（kickoff：`app/.progress/s03-impl-*-kickoff.md`）

---

## 15. 自审记录（sequential-thinking + superpowers checklist）

| 检查项 | 结果 |
|---|---|
| Placeholder | 无 TBD/TODO；CLI argv 允许实现期 spike 钉死并记 handoff |
| 内部一致 | N1–N10 与数据/API/Worker/前端一致；方案 1 + 终止必做 |
| 范围 | 三 CLI 全通偏厚；§1.2/12.5 排除项清晰 |
| 歧义 | R1–R6 消除：cancel 单路径、K=20、FRI-11 squad、迁移、stdout 降级、无 sweeper |
| 与 S02 | 放开 assignee；摘要进 comment；轨迹独立表 |
| Borrow | §10 完整，链 borrow-from-references.md |
| multica 对齐 | progress 不进 DB；message 进 run_message；非全塞 comment |

### 自审修订 R1–R6

| ID | 修订 |
|---|---|
| R1 | 取消 API 仅 `POST /api/runs/:runId/cancel` |
| R2 | prompt 最近评论默认 K=20 |
| R3 | 验收注明 FRI-11 为 squad，demo 需改指派 agent |
| R4 | agent.runtime 迁移 + 删库重 seed |
| R5 | opencode/cursor 可无 stream，整段 stdout 仍算通过 |
| R6 | S03 不做 stale running sweeper |
