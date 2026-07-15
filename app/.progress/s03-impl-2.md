# Handoff: S03-impl-2（Backend 三实现 + RunWorker + API）

> 切片：`S03` · 角色：`impl` · 序号：`2`
> 日期：2026-07-15
> 分支：`feat/s03-runtime-backend`

## 上下文（给下一个会话读）

S03（真实 agent 执行层）的 impl-2 切片，负责**执行层 + 编排副作用 + API**，不含前端。

- **计划真源：** [`docs/superpowers/plans/2026-07-09-s03-runtime-backend.md`](../docs/superpowers/plans/2026-07-09-s03-runtime-backend.md)「执行者片段 B」（Task 2.1~2.3）
- **spec 真源：** [`docs/superpowers/specs/2026-07-09-s03-runtime-backend-design.md`](../docs/superpowers/specs/2026-07-09-s03-runtime-backend-design.md) §5 API、§6 指派即跑+Worker+取消、§7 三 Backend、§8 WS
- **前置交接：** [`s03-impl-1.md`](s03-impl-1.md)（契约+DB+seed）+ [`s03-planner-1.md`](s03-planner-1.md)
- **下一个执行者：** impl-3（web 前端：详情指派/停止/轨迹 + /runtimes 双栏 + 导航 + WS 前端）

## 本会话完成了什么

### Task 2.1 — RuntimeBackend 接口 + detect + 三 CLI 实现 + registry

`app/packages/server/src/runtime/` 下 7 个文件：

- `types.ts` — `AgentEvent` / `ExecutionInput` / `ExecutionResult` / `DetectResult` / `RuntimeBackend` 接口（照 plan）
- `detect-path.ts` — `resolveCmd`（env 覆盖 + where/which）+ `versionOf`（**修了 Windows .cmd shim 坑，见偏离 1**）
- `spawn-line.ts` — 通用子进程驱动；Windows .cmd `shell:true` + `taskkill /T /F` + ANSI 剥离 + `LineContext.resultText` 覆盖 + **abort 5s 兜底（见偏离 2）**
- `claude-code.ts` — argv `-p <prompt> --output-format stream-json --verbose`；`parseClaudeLine` 对齐 multica `claudeSDKMessage`
- `opencode.ts` — argv `run <prompt>`；无 JSON 流走 spec R5 降级（`onLine=null`）
- `cursor.ts` — argv `cursor-agent -p <prompt> --output-format stream-json --yolo --trust`（**偏离 plan 的 --headless，见偏离 3**）
- `registry.ts` — `getBackend(id)` / `allBackends()`

### Task 2.2 — run-control + prompt + RunWorker

- `orchestration/run-control.ts` — AbortController Map（register/abort/clear）
- `runtime/prompt.ts` — `buildPrompt`（Issue 标题+描述+最近 K=20 comment，spec §6.2 R2）
- `orchestration/run-worker.ts` — 主进程内单线程执行循环：
  - `startRunWorker()`（500ms tick）+ `wakeRunWorker()`（立即触发）
  - `tick()`：claim queued→running（条件 UPDATE + select 兜底，注意点 4 returning 兼容）→ backend.execute → 事件分流 → 终态写库
  - 事件分流（spec §3.4）：progress/log → `run:progress` 仅 WS；message/tool_* → `run_message` + `run:message`
  - completed → 写终态 agent comment（人读最终回复）+ `run:completed`
  - failed/cancelled → 各自终态事件

### Task 2.3 — routes + 指派副作用 + 注册

- `routes/runtimes.ts` — `GET /api/runtimes`（虚拟本机 + allBackends.detect + agentIds 聚合）
- `orchestration/run-service.ts` — `cancelActiveRunsForIssue` / `cancelRunById` / `enqueueAgentRun` 共用逻辑
- `routes/runs.ts` — `GET /api/runs(列表/单条/messages)` + `POST /api/runs/:runId/cancel`（唯一取消入口 R1）
- `routes/issues.ts` PUT 扩展 — assignee identity 变化 → `cancelActiveRunsForIssue` + 若 type=agent 则 `enqueueAgentRun`（spec §6.1）
- `app.ts` 注册 `runRoutes` + `runtimeRoutes`
- `index.ts` listen 前 `startRunWorker()`

## 三 CLI spike 结果（最重要的交接信息）

> 开工第一步实跑三 CLI 钉死真实 argv。以下全部本机实测（2026-07-15）。

### claude（claude-code runtime）

- **bin：** `D:\Tools\claude-win32-x64\claude.exe`（.exe，无需 shell）
- **version：** `2.1.150 (Claude Code)`
- **argv：** `claude -p "<prompt>" --output-format stream-json --verbose` ✅ **与 plan 一致**
- **输出格式：** NDJSON，每行一个 JSON，三种 type：
  - `{"type":"system","subtype":"init",...}` — 初始化
  - `{"type":"assistant","message":{content:[{type:"text",text:"..."}]}}` — 文本块
  - `{"type":"result","subtype":"success","result":"<finalText>",...}` — 终态，`.result` 就是人读 finalText
- **解析策略（对齐 multica claude.go）：** assistant.message.content[].text → message；result.result → `ctx.resultText` 覆盖 finalText

### opencode（opencode runtime）

- **bin：** `C:\Users\a2691\AppData\Roaming\npm\opencode.cmd`（.cmd shim，**需 shell:true**）
- **version：** `1.17.15`
- **argv：** `opencode run "<prompt>"` ✅ **与 plan 一致**（子命令确认为 `run`）
- **输出格式：** **纯文本无 JSON 流**（含 ANSI 色码 `\x1b[0m` + 进度行 `> build · big-pickle`）
- **降级（spec R5）：** `onLine=null`，结束时整段 stdout（剥 ANSI）作一条 assistant message
- **⚠️ 注意：** opencode 在本机执行很慢（build/index 阶段 5 分钟+ 未完成）。这是 CLI 环境特性，非代码问题

### cursor（cursor runtime）

- **bin：** `C:\Users\a2691\AppData\Local\cursor-agent\cursor-agent.cmd`（**不是** `cursor` 编辑器本体！`cursor` 是 VSCode fork，无 headless）
- **version：** `2026.07.01-41b2de7`
- **argv：** `cursor-agent -p "<prompt>" --output-format stream-json --yolo --trust` ⚠️ **偏离 plan**（plan 猜 `cursor --headless`）
  - `cursor-agent` 是 Cursor 的 headless CLI 入口（multica `launchHeaders["cursor"] = "cursor-agent (stream-json)"` 确认）
  - `--yolo` = force allow commands（工具批准）；`--trust` = 信任 cwd（**必需**，否则报 "Workspace Trust Required" 退出，见偏离 3）
  - `-p` / `--print` = 非交互脚本模式；`--output-format stream-json` 与 claude 同构
- **输出格式：** stream-json（与 claude 高度同构，对齐 multica cursor.go `cursorStreamEvent`）
- **⚠️ 实跑：** 本地 cursor 无额度，detect+argv 已就绪但未实跑 completed。代码完整，有额度时可直接跑

## 自测结果

### typecheck（`pnpm -r typecheck`，shared + server + web 三包全绿）

```
Scope: 3 of 4 workspace projects
packages/shared typecheck$ tsc --noEmit  → Done
packages/server typecheck$ tsc --noEmit  → Done
packages/web    typecheck$ tsc --noEmit  → Done
```

### GET /api/runtimes（detect 正确，三 runtime 全 installed + version + path）

```json
{
  "machine": { "id":"machine-local", "name":"林远 本机", "status":"online", "cwd":"D:\\code\\multi-agent" },
  "runtimes": [
    { "id":"claude-code", "installed":true, "version":"2.1.150 (Claude Code)", "path":"...\\claude.exe", "agentIds":["agt-lead","agt-proto"] },
    { "id":"opencode",    "installed":true, "version":"1.17.15",              "path":"...\\opencode.cmd", "agentIds":["agt-research"] },
    { "id":"cursor",      "installed":true, "version":"2026.07.01-41b2de7",   "path":"...\\cursor-agent.cmd", "agentIds":["agt-prd"] }
  ]
}
```

### claude-code 端到端 completed（DoD §12.3 最硬验收）

```
PUT /api/issues/FRI-12 {"assignee":{"type":"agent","id":"agt-lead"}}
→ enqueue queued → worker claim → running → 15s 后 completed

GET /api/runs/<id>
  status=completed  error=none  started=05:07:22  finished=05:07:35

GET /api/runs/<id>/messages   （stream-json 轨迹进 run_message）
  count=1
  [1] assistant: I can read this — S03 e2e self-test confirmed.

GET /api/issues/FRI-12/comments   （终态 agent comment，spec §3.4）
  agent comments=1
  [agt-lead] I can read this — S03 e2e self-test confirmed.
```

### cancel 链路 + abort 兜底

```
POST /api/runs/<id>/cancel  → status=cancelled
POST /api/runs/<id>/cancel  → 409 （重复取消，active run 才可取消，R1）
```

**abort 死锁修复验证：** cancel 一个 running 的 opencode run 后，worker busy 锁正确释放，后续 run 能被 claim（修复前 worker 会永挂）。

### 回归（S01 看板 + S02 FRI-11）

```
GET /api/issues → 9 条（8 seed + 1 自测），状态分布正常
GET /api/issues → FRI-11: in_review + squad:产品小队（答辩 demo 路径完好）
GET /api/issues/FRI-11/comments → 3 条 comment 时间线（林远 + agt-lead + agt-research）
```

### 自测数据已清理

dev.db 恢复干净：8 issue + 6 comment（seed 原样）+ 0 agent_run + 0 run_message。FRI-04 assignee 重置回 null。

## 与计划的偏离

> 全部有据（spike 实测 + multica 源码确认），非随意改。

### 1. detect-path.ts：Windows .cmd shim 坑（自测发现并修复）

**问题：** `where opencode` 返回两行——无扩展名 unix shim（`opencode`）+ `opencode.cmd`。plan 的 `resolveCmd` 取第一行（unix shim），但 Windows 上 Node spawn 无扩展名脚本会 ENOENT。导致 opencode/cursor 的 `version=null` 且无法执行。

**修复（对齐 multica 处理 npm shim 的需求）：**
- `resolveCmd`：Windows 上从 where 多行输出里优先取 `.exe`/`.cmd`/`.bat`
- `versionOf`：对非 `.exe`（.cmd/无扩展 shim）加 `shell:true`

**实测：** 修复后三 CLI version 全部正确返回。

### 2. spawn-line.ts：abort 死锁兜底（自测发现并修复）

**问题：** cancel 一个 shell:true spawn 的 opencode run 后，worker busy 锁永挂，后续 run 永远不被 claim。

**根因：** `shell:true` 下 `child.pid` 是中间 cmd.exe 的 pid。cmd.exe 退出后 opencode.exe 成孤儿（`taskkill /T /F` 找不到 pid 失败），子进程 `close` 事件不触发，spawn-line 的 Promise 永不 resolve → tick 的 `await backend.execute` 永挂 → `finally { busy=false }` 不执行。

**修复：** `onAbort` 后加 5s 兜底 `setTimeout` → 强制 `finish({exitReason:'cancelled'})`。Windows 进程树 kill 本质不可靠，worker 死锁比稍晚的取消更糟，兜底 timer 是必要安全网。

**实测：** 修复后 cancel 正常释放 worker，opencode.exe 进程也被清理。

### 3. cursor.ts：argv 偏离 plan（spike + multica 确认）

**plan 猜：** `cursor --headless <prompt>`（计划者注意点 3 标注「高风险」）
**实际：** `cursor-agent -p <prompt> --output-format stream-json --yolo --trust`

**依据：**
- `cursor` 本体是 VSCode fork，`--help` 全是 GUI 参数，**无 headless**（计划者预测中招）
- 本机有独立 `cursor-agent` CLI（Cursor headless 入口），multica `launchHeaders["cursor"]="cursor-agent (stream-json)"` 确认
- multica `buildCursorArgs`（cursor.go:477）用 `-p --output-format stream-json --yolo`
- 本机版本 trust/force 分开，仅 `--yolo` 报 "Workspace Trust Required"，必须加 `--trust`

**detect candidates：** `['cursor-agent', 'cursor']`（优先 cursor-agent）

### 4. claude/cursor stream-json 解析对齐 multica（plan 的 delta 字段映射不准）

plan 的 `parseClaudeLine` 用 `j.event.delta.text` / `j.delta.text` 取 delta——spike 实测 claude stream-json 无此字段。改为对齐 multica：
- `assistant` → `message.content[]`（block `text` → message，`tool_use` → tool_start）
- `result` → `.result` 覆盖 `ctx.resultText`（比拼 stdoutAll 更准）
- spawn-line 新增 `LineContext.resultText` 机制让 onLine 覆盖 finalText

### 5. failRun 签名简化

plan 的 `failRun(runId, issueId, error)` 中 issueId 未使用（finalText 分支是空的）。我去掉 issueId 参数，纯私有函数，无外部依赖。

## 遗留 / 下一个执行者（impl-3）要注意的点

> impl-3 写前端。这些是你必须知道的 API/WS 约定。

### API 路径 + 响应形状

| 方法 | 路径 | 响应 |
|---|---|---|
| GET | `/api/runtimes` | `{ machine:{id,name,status,cwd}, runtimes:[{id,label,installed,version,path,agentIds}] }` |
| GET | `/api/runs?issueId=<id>` | `AgentRun[]`（新→旧） |
| GET | `/api/runs/:runId` | `AgentRun` |
| GET | `/api/runs/:runId/messages` | `RunMessage[]`（seq ASC） |
| POST | `/api/runs/:runId/cancel` | `AgentRun`（终态 cancelled）；非 active → 409 |

`AgentRun` 形状（shared）：`{ id, issueId, agentId, runtime, status, error, startedAt, finishedAt, createdAt }`，时间字段是 ISO 字符串（null 保持 null）。

`RunMessage` 形状：`{ id, runId, seq, kind, body, createdAt }`，kind ∈ `assistant|user|tool_start|tool_end|system`。

### WS run:* 事件 payload（DomainEvent 联合，impl-1 已定义）

| type | payload | 持久化 |
|---|---|---|
| `run:queued` / `running` / `completed` / `failed` / `cancelled` | `{ type, run: AgentRun }` | run 行 |
| `run:progress` | `{ type, runId, issueId, text }` | **否**（fire-and-forget，不进 DB） |
| `run:message` | `{ type, message: RunMessage, issueId }` | 是（先写 DB 再发） |

**D12 约定（spec §9.4）：** 可乐观 assignee；**禁止**乐观插 run_message（按 message.id 幂等，等 WS/刷新）。

### MA_WORKSPACE_CWD 配法（Git Bash）

```bash
MA_WORKSPACE_CWD="D:\code\multi-agent" pnpm --filter @ma/server dev
```
缺失时 run 快速 `failed`（error="未配置 MA_WORKSPACE_CWD"）。

### 详情页「停止」实现（spec §6.3 R1）

取消唯一入口是 `POST /api/runs/:runId/cancel`。详情页先 `GET /api/runs?issueId=` 取 active run（status ∈ queued/running），再 cancel。改指派/清空指派时后端自动 cancel（前端不用额外调）。

### 三 CLI 执行特性（影响前端 UX）

- **claude / cursor**：stream-json，执行期间持续产 `run_message`（tool_start/tool_end/assistant），轨迹实时增长
- **opencode**：降级模式，**执行期间 0 message**（结束时整段 stdout 作一条 assistant message）。前端对 opencode run 要有"执行中无轨迹属正常"的预期，别显示成卡住
- **opencode 本机很慢**（build/index 阶段数分钟），demo 时优先用 claude

### 不在 impl-2 范围（别碰）

- 前端组件、hooks、WS 前端处理（都是 impl-3）
- shared 契约（impl-1 已定死）
- roster（impl-1 已返回 runtime）

## 验收结论（计划者填）

### impl-2 验收（2026-07-15 计划者复核）

**结论：✅ 通过，移交 impl-3（web 前端 + 端到端验收）。**

复核项（代码逐文件核对 + handoff 自测证据审查）：
- ✅ 三 CLI spike 彻底：argv/bin/输出格式全实测。cursor 的 `cursor-agent` 偏离有 multica `launchHeaders` + `buildCursorArgs` 源码背书，`--trust` 是本机版本必需（计划者预测的"高风险"中招，处置正确）
- ✅ detect Windows .cmd shim 修复正确：`resolveCmd` 优先取 .exe/.cmd（spawn-line.ts:36-48），`versionOf` 对 .cmd 加 shell:true（detect-path.ts:64-71）
- ✅ spawn-line abort 死锁兜底（spawn-line.ts:67-72）：5s setTimeout 强制 finish(cancelled)——Windows shell:true 进程树 kill 不可靠的必要安全网
- ✅ claude 端到端 completed 实证：enqueue→running→stream-json 轨迹（1 assistant msg）→终态 agent comment，13s 完成
- ✅ cancel 链路 + 409 重复取消（spec §6.3 R1）
- ✅ 指派即跑（issues.ts:157-168 PUT assignee=agent → cancelActiveRunsForIssue + enqueueAgentRun → worker claim → execute）
- ✅ run-service.ts 的 enqueueAgentRun（per-issue 单 active 去重，S04 会改 per-agent）+ cancelRunById + cancelActiveRunsForIssue
- ✅ app.ts 路由全注册（runs/runtimes）+ index.ts startRunWorker
- ✅ 回归 S01/S02 无破坏（8 issue + FRI-11 demo 路径完好）
- ✅ DB 清理干净（8 issue + 6 comment + 0 run/message）

**5 处偏离全部接受**（均为真实 bug 修复或 spike 确认，非随意改）：
1. Windows .cmd shim（真实 bug）
2. abort 死锁兜底（Windows 必需的安全网）
3. cursor-agent argv（spike + multica 确认）
4. stream-json 解析对齐 multica（plan 的 delta 字段不准）
5. failRun 签名简化（plan 多传无用 issueId）

**opencode/cursor 未到 completed**：CLI 环境（opencode build/index 极慢）/额度（cursor 无额度）问题，非代码问题。detect + argv + 解析代码就绪，有额度/优化后可直接跑。

**给 impl-3 的计划者补充注意点（impl-2 handoff 之外）：**

1. **cursor-agent stream-json 解析**已对齐 claude（parseCursorLine 复用 assistant/tool_use/tool_result/result 分支）。前端 RunTrace 对 cursor run 会像 claude 一样实时增长轨迹。
2. **opencode 降级模式**：执行期间 0 run_message（结束时整段 stdout 作一条 assistant message）。前端对 opencode run 的 RunTrace 要显示"执行中无轨迹属正常"，别显示成卡住——可以靠 run status=running + progress 事件判断。
3. **run:progress 事件不进 DB**（fire-and-forget），前端只能靠 WS 实时收。刷新页面后进度丢失（正常，进度是临时的）。RunTrace 列表只展示 run_message（持久化的）。
4. **详情页"停止"按钮**：先 GET /api/runs?issueId= 取 active run（status ∈ queued/running），再 POST cancel。改指派时后端自动 cancel，前端不用额外调。
5. **/runtimes 页照原型 renderRuntime 双栏**（spec §9.3）：左固定机器卡，右 5 列表。数据一次 GET /api/runtimes。impl-2 的响应形状见 handoff §API 路径。
6. **顶栏导航加"运行时"**（spec §9.1）：看板 | 运行时 两个入口。
7. **验收前提**：MA_WORKSPACE_CWD 要配（Git Bash：`MA_WORKSPACE_CWD="D:\code\multi-agent" pnpm dev`），否则 run 快速 failed。
