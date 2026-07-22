# UX Gap Report: multi-agent vs Multica

Date: 2026-07-21
Scope: app/packages/server + app/packages/web vs references/repos/multica/ (daemon execenv / task service / chat / runs UI)

---

## 1. Executive summary

- 本仓已修两处硬伤：chat 默认隔离 scratch cwd（不再默认踩 workspace 仓根）与 chat 硬超时 15min（原 3min 过短）。
- 与 Multica 的结构性差距仍在：cwd 模型只有「全局 workspace root」，无 project → local_directory 资源绑定；issue/QC/squad 一律进同一根目录。
- chat 无多轮 history 注入（只喂当前 quickPrompt），与 Multica trailingUserMessages 差一整代产品体验。
- issue 执行无 wall-clock / idle / tool watchdog；仅靠 2min heartbeat stale 收尸，长工具静默会被误杀或挂死两难。
- 指派/enqueue 服务端几乎不校验 readiness（UI 仅警告不硬拦）；checkAndEnqueue 返回 null 时静默，用户以为已开工。
- Runs Mission Control CTA 误导：chat 失败行无「再聊」入口；retry API 对无 issue 的 chat/QC 直接 400，列表却对有 issue 的行统一「再执行」。
- Projects 无本机路径资源 → skill / AGENTS / wiki 全绑 workspace root，多项目场景上下文必错。
- Inbox 成功 run 也推送，完成噪声高；chat 终态甚至不进 inbox。
- 优先级建议：P0 多项目 cwd + chat 多轮；P1 issue 超时模型 + enqueue 可观测；P2 Runs/Settings/Inbox 可行动 CTA。

---

## 2. Method / sources

**本地（read-only）**

- Server: runtime/resolve-run-cwd.ts, orchestration/run-worker.ts, stale-runs.ts, readiness.ts, run-service.ts, issue-create.ts, inbox-writer.ts, runtime/prompt.ts, routes/{chat,issues,runs,settings,projects}.ts, db/schema.ts, skill/scanner.ts, wiki/agents-bridge.ts, workspace-cwd.ts
- Web: components/{ChatPage,RunsPage,RunDetailPage,SettingsPage,NewIssueForm,AssigneeSelect,InboxPage,ProjectsPage,ProjectDetailPage}.tsx

**Multica**

- Daemon: server/internal/daemon/execenv/execenv.go (Prepare/Reuse), local_directory.go, config.go (timeouts/watchdogs), handler/daemon.go (trailingUserMessages)
- Service: service/task.go (RerunIssue / prepare lease / stale reclaim), service/agent_ready.go
- Chat: handler/chat.go, chat claim workdir reuse in handler/daemon.go

对比原则：同轴找「用户感知坏体验」→ 本地根因 file:line → Multica 对照 file:line → 薄切片修复。

---

## 3. Ranked findings table

| # | Severity | Axis | Finding (1 行) | Demoable? |
|---|----------|------|----------------|-----------|
| F1 | **P0** | cwd | Issue/QC 无 per-project local_directory，一律 workspace root | Y |
| F2 | **P0** | chat | Chat prompt 无会话 history，每轮失忆 | Y |
| F3 | **P1** | timeout | Issue run 无 idle/tool/wall timeout；2min HB 与长工具冲突 | Y |
| F4 | **P1** | assignee | Enqueue 静默失败 / 不校验 readiness | Y |
| F5 | **P1** | runs CTA | Chat/无 issue 失败行 CTA 错误（再执行不可用或误导） | Y |
| F6 | **P1** | prompt | Wiki/AGENTS/skills 绑全局 cwd，错仓上下文 | 部分 |
| F7 | **P2** | settings | Health 多项只 hint、少一键动作；cwd 默认文案绑本机路径 | Y |
| F8 | **P2** | board | 指派 UI 警告但不拦；服务端仍 enqueue | Y |
| F9 | **P2** | skills | 项目 skill 目录 = 全局 workspace .skills，无 per-project | 中 |
| F10 | **P2** | inbox | 成功 run 全推送；chat 终态缺失；噪音与漏报并存 | Y |
| F11 | **P3** | chat product | 无会话级「绑定项目目录」；UI 空态文案仍暗示「了解工作区」 | Y |
| F12 | **P3** | rerun | Rerun 不复用 workdir/session（Multica 有 PriorWorkDir） | 中 |

---

## 4. Detailed findings

### F1 — Issue/QC 执行目录只有全局 workspace，无 project local_directory（P0）

**Symptom**
用户有多个真实代码仓时，issue 指派后 agent 总在 Settings 里那个 MA_WORKSPACE_CWD / workspace.root_path 下干活；挂了 project 的 issue 也不会切目录。QC/squad 同理。误改错仓或「空仓」风险高。

**Local root cause**

- app/packages/server/src/runtime/resolve-run-cwd.ts:78-108：kind === "chat" 才走 scratch；其余一律 resolveWorkspacePath()（全局 root）。
- app/packages/server/src/orchestration/run-worker.ts:92-110：execute 只调 resolveRunCwd({ kind, runId, chatThreadId })，**不读 issue.projectId**。
- app/packages/server/src/db/schema.ts:87-108：projects 仅 title/status，**无 path / resource 表**。
- app/packages/server/src/routes/projects.ts / web Project 页：无本机目录绑定 UI/API。

**Multica contrast**

- references/repos/multica/server/internal/daemon/execenv/execenv.go:250-300：Prepare 默认 {workspacesRoot}/{ws}/{taskShort}/workdir；LocalWorkDir 非空时 WorkDir 指向用户本机目录，LocalDirectory=true。
- references/repos/multica/server/internal/daemon/local_directory.go:16-93：project_resource type=local_directory，按 daemon_id 解析绝对路径。
- Rerun：service/task.go:3339-3351 可复用 PriorWorkDir。

**Severity** P0 — 多项目核心价值未落地。

**Thin-slice fix**
1) project 表加 localPath（或 project_resource 简表）；2) issue run resolve：issue.projectId → project.localPath 若存在且 isDir 则 cwd=该路径，否则 workspace；3) Project 详情页可编辑路径 + Settings 健康检查。不需要完整 Multica daemon lease。

---

### F2 — Chat 每轮只注入当前用户句，无多轮 history（P0）

**Symptom**
用户在同一 thread 连续提问，agent 像新会话；「刚才那个文件呢」必翻车。UI 有完整消息列表，执行侧没有。

**Local root cause**

- app/packages/server/src/routes/chat.ts:207-216：enqueue 时 quickPrompt: body 仅本条。
- app/packages/server/src/runtime/prompt.ts:43-67：chat 分支只拼 runRow.quickPrompt，**不读 chat_messages 历史**。

**Multica contrast**

- references/repos/multica/server/internal/handler/daemon.go:2647+ / trailingUserMessages：claim 时加载会话消息，投递自上次 assistant 以来的全部 trailing user 消息（含 debounce 连发）。
- Chat session 持久化 WorkDir，claim 可 PriorWorkDir 复用（daemon.go:2096+）。

**Severity** P0 — chat 产品「能聊」但「不能对话」。

**Thin-slice fix**
resolveRunPrompt chat 分支：查 thread 最近 N 条 messages（或 trailing since last assistant），拼进 prompt；可选把 assistant 失败也计入锚点（与 Multica 一致）。UI 无需大改即可 demo。

---

### F3 — Issue/QC 无执行超时分层；仅 2min heartbeat stale（P1）

**Symptom**
- 长编译/测试：若 CLI 长时间无「被 worker 看到的」进度且 heartbeat 停更 → 2min 被标 stale: heartbeat timeout（stale-runs.ts:10,50）。
- 真挂死 CLI：issue 路径 **不传 timeoutMs**（run-worker.ts:186-210 仅 chat 设超时）→ 可能一直 running 直到 HB 机制介入；与 Multica 的 idle/tool 语义不同，运维难解释。
- Chat 已 15min 硬超时，issue 却「无限」依赖 HB。

**Local root cause**

- app/packages/server/src/orchestration/run-worker.ts:186-210：timeoutMs 仅 kind === "chat"。
- app/packages/server/src/orchestration/stale-runs.ts:9-13,31-50：STALE_RUNNING_MS = 120_000；无区分「工具进行中」。
- app/packages/server/src/runtime/spawn-line.ts:25-34：有通用 timeout 能力，但 issue 未用。

**Multica contrast**

- references/repos/multica/server/internal/daemon/config.go:24-60：DefaultAgentTimeout=0（不硬杀长任务）；DefaultAgentIdleWatchdog=30m；DefaultAgentToolWatchdog=2h；Codex semantic inactivity 等。
- prepare lease 延长 claim→start 窗口（task.go ExtendTaskPrepareLease / daemon.go lease extender）。

**Severity** P1 — 误杀合法长任务 或 挂死感知差。

**Thin-slice fix**
1) issue 默认 idle timeout（如 30min 无 event）+ 可选 wall MA_ISSUE_TIMEOUT_MS；2) onEvent 任意 progress/message touch heartbeat（若尚未保证）；3) Settings/Runs 展示「因 idle 失败」可读原因。不先做 tool_use 解析也可用「有任意 stdout/event 即续命」。

---

### F4 — 指派/enqueue 静默失败，readiness 不进服务端闸（P1）

**Symptom**
指派 agent 后看板「好像成功了」，但无 run / 或 run 立刻因 cwd/runtime 失败；用户不知是「没排上」还是「跑挂了」。

**Local root cause**

- app/packages/server/src/orchestration/run-service.ts:95-118：active dedupe → return null（调用方多数不报错）。
- app/packages/server/src/orchestration/run-service.ts:127-142：超 MAX_RUNS_PER_ISSUE → system comment 但 API 仍可能 200。
- app/packages/server/src/orchestration/issue-create.ts:175-190：enqueue 包 try/catch 只 console.error。
- app/packages/server/src/routes/issues.ts:428-435：PUT assignee 调 enqueueAgentRun **丢弃返回值**。
- app/packages/server/src/orchestration/readiness.ts:8-72：只用于 API/UI 展示，**不参与 enqueue**。
- Web：AssigneeSelect.tsx 注释「不硬拦截」；NewIssueForm 有 banner 仍可提交（警告型）。

**Multica contrast**

- references/repos/multica/server/internal/service/agent_ready.go:9-42：archived / runtime bound / runtime online 统一闸；autopilot 与 assign/comment 共用。
- Assign/rerun 路径有 invoke 权限与 readiness 失败可结构化拒绝（ErrRerunInvokeNotAllowed 等）。

**Severity** P1 — 「指派了但没动」最伤信任。

**Thin-slice fix**
1) enqueue 返回 { run | null, reason }；2) PUT/POST issue 若 enqueue 失败 → 响应带 enqueueSkipped + reason，或 409；3) 写 inbox action_required「未开工：cwd_missing / runtime_missing / busy dedupe」；4) UI toast。

---

### F5 — Runs / Mission Control 误导 CTA（P1）

**Symptom**
- 失败 chat 行：RunActions 无 issue → 显示「重派」链到 /?quickPrompt=...（RunsPage.tsx:91-104），语义是 QC 不是回 chat thread。
- retryRun（run-service.ts:262-278）无 issueId → 400 文案写「快速派活…」，chat 也被同一句盖住。
- 有 issue 的失败行「再执行」OK；chat 详情页「再执行」按钮若出现会打到同一 API 失败。

**Local root cause**

- app/packages/web/components/RunsPage.tsx:83-117：分支仅 !run.issueId vs 有 issue；**未分支 kind === "chat"**。
- app/packages/server/src/routes/runs.ts:123-126 + retryRun 无 chat 专用路径。

**Multica contrast**
任务/会话模型分离；chat 重试回到 session；issue rerun 走 RerunIssue 且可复用 workdir。

**Severity** P1 — 运维页主按钮说错话。

**Thin-slice fix**

| kind | CTA |
|------|-----|
| chat | 「打开会话」→ /chat?thread= |
| QC 无 issue | 「重派」→ /?quickPrompt=（保持） |
| issue | 「再执行」→ retry |

详情页同步。另：chat 进行中缺取消按钮（ChatPage composer 仅 disabled={liveRun}）→ 旁挂 cancel → POST /api/runs/:id/cancel。

---

### F6 — Prompt/上下文绑错仓：AGENTS / wiki / skills / memory（P1）

**Symptom**
issue 在「项目 A」叙事下执行，却注入 workspace root 的 AGENTS.md managed 块、.skills、wiki store；memory prefetch 按 issue 文本，不按 repo。

**Local root cause**

- app/packages/server/src/runtime/prompt.ts:117：固定 Please work on this issue in the current workspace.
- app/packages/server/src/runtime/prompt.ts:141-145：readManagedBlock() → wiki/agents-bridge.ts:12-13 读 **workspace cwd** 下 AGENTS.md。
- app/packages/server/src/skill/scanner.ts:39-42：projectSkillsDir = resolve(workspaceCwd, ".skills")。
- app/packages/server/src/wiki/store.ts:8-11：wiki 根 = workspace cwd / process.cwd()。

**Multica contrast**
execenv 在 **task WorkDir** 写 context files / runtime config；local_directory 时 sidecar 不污染用户仓（manifest cleanup）。Project title/resources 进 task payload。

**Severity** P1（随 F1 放大）。

**Thin-slice fix**
随 F1：AGENTS/skills 解析相对 **resolved run cwd**；无 path 时 skip 并在 prompt 注明「未绑定项目目录」。

---

### F7 — Settings 健康可行动性不足（P2）

**Symptom**
Status 有 checks/href，但 cwd error 的 href: null（settings.ts:168-174）；依赖复制 export 片段（SettingsPage.tsx:40-61 还硬编码示例 D:/code/multi-agent）。Wiki LLM missing 链到 /wiki 而非配置说明。用户修好后要自己想到 recover-stuck。

**Local root cause**

- app/packages/server/src/routes/settings.ts:161-315：检查全面，动作分散。
- Web Settings：有 set cwd / recover stuck / retry dead wiki，但与 check 行未一一绑定 CTA。
- 占位默认 D:/code/multi-agent（SettingsPage.tsx:106,124）暗示平台仓=业务仓。

**Multica contrast**
Daemon 在线状态 + runtime online 是硬前置；配置项 agent_timeout 等可 multica config set。默认不把装平台的仓当 workdir。

**Severity** P2。

**Thin-slice fix**
每个 error check 行内主按钮：cwd→聚焦保存表单；runtime→/runtimes；stuck runs→一键 recover；文案去掉机器专用绝对路径示例，改为「当前探测路径 / 你的业务项目根」。

---

### F8 — Board 指派体验：警告 ≠ 阻断（P2）

**Symptom**
新建 issue / 改指派：readiness chip 红了仍可提交；随后 F4 静默或 run 秒失败。Squad 队长不可用时详情页有 recovery 链接（较好），看板卡片层较弱。

**Local root cause**

- Web readiness 展示已较完整（NewIssueForm.tsx:73-76, AssigneeSelect.tsx:75「不硬拦截」, SquadDetailPage）。
- 服务端无 gate（见 F4）。
- 另：readiness.ts 对 **chat 也要求 cwd**（chat 已不依赖 workspace）→ Agents 列表全员 cwd_missing 吓阻纯 chat 用户。

**Multica contrast**
isAgentAssigneeReady / squad leader ready 在 assign 路径使用；chat 与 issue 闸门分场景。

**Severity** P2（依赖 F4 服务端）。

**Thin-slice fix**
可选 confirm modal「仍要指派」；默认建议：cwd_missing / runtime_missing 时 primary 改「先修复环境」。Readiness API 增加 forKind 或 chat 不看 cwd。

---

### F9 — Skills / runtimes 与 cwd 耦合（P2）

**Symptom**
导入「项目级 skill」失败提示「工作区 cwd 未配置」（scanner.ts:319）；配置了也只进**全局** .skills。Runtime detect 与 readiness 绑同一 cwd。

**Local root cause**

- app/packages/server/src/skill/scanner.ts:39-42, 313-319
- app/packages/server/src/orchestration/readiness.ts:13-51：cwdConfigured 全局

**Multica contrast**
Skills 装入 task workdir / provider-native paths；local_directory 与 managed workdir 分流。

**Severity** P2。

**Thin-slice fix**
F1 后 project-level skills 根 = project.localPath/.skills；无 project 时明确文案「用户级技能」默认可用。

---

### F10 — Inbox 噪声与缺口（P2）

**Symptom**

- 每次 run completed 也 notifyRunTerminal → severity info（inbox-writer.ts:172-197），订阅 issue 的成功完成刷屏。
- chat 终态不写 inbox（仅 issue / QC 分支）。
- comment 全进 attention（notifyCommentCreated），agent 工作评论与人评论同等。

**Multica contrast**
更细 failure reason / 会话未读；非所有成功任务等价推送（产品侧更强调 actionable）。

**Severity** P2。

**Thin-slice fix**
默认：仅 run_failed + assigned + 人评论进 inbox；run_completed 可选或折叠；chat 失败 → action_required 带 thread 深链。

---

### F11 — Chat 产品层：无选项目 + 文案过时（P3）

**Symptom**
Chat UI 无 project/path 选择（ChatPage.tsx）；空态「它们了解工作区里的 issue 与上下文」（ChatPage.tsx:331）在 scratch cwd + 无 history 下为虚假承诺。Server 注释已写「之后若加会话选项目目录」（resolve-run-cwd.ts:11-12）。Composer 无 cancel/resend。

**Multica contrast**
Chat session 可绑 work_dir / 复用 prior；与 issue 任务分离但有完整 claim 上下文；失败 taxonomy 细。

**Severity** P3（在 F1/F2 之后）。

**Thin-slice fix**
Thread 级 cwdMode: scratch | workspace | projectId；header 展示当前 cwd 短路径；空态改「默认隔离目录，不会改你的仓库」；live pill 旁取消 + 失败卡重发。

---

### F12 — Rerun 不复用 workdir / session（P3）

**Symptom**
issue 再执行总是新环境语义（本仓无 per-task workdir 记录）；agent 重做 clone/探索成本高。

**Local root cause**

- app/packages/server/src/orchestration/run-service.ts:197-249：rerunIssue 新 insert，无 prior path 字段。
- cwd 解析不读 rerunOfRunId。

**Multica contrast**

- service/task.go:3339-3351：retry ALWAYS reuses source workdir if on disk；session 是否 resume 另判 poison。

**Severity** P3（单 workspace root 时收益有限；F1 后变重要）。

**Thin-slice fix**
agent_runs 记 workdir；rerun 若目录在则 reuse；chat thread 固定 scratch 路径（已是 per-thread）可标「会话目录已保留」。

---

## 5. Already fixed

| Item | Where | Notes |
|------|--------|------|
| Chat 不再默认用全局 workspace / 仓根 | resolve-run-cwd.ts:45-105, run-worker.ts:92-99, prompt.ts:49-59 | 默认 ~/.multi-agent/chat-sessions/<thread|run>/workdir；MA_CHAT_USE_WORKSPACE_CWD=1 opt-in |
| Chat 硬超时 15min | run-worker.ts:186-210 | 默认 900_000 ms；MA_CHAT_TIMEOUT_MS 可覆盖；0=不限；原 3min 过短 |
| Chat 失败回写 assistant 气泡 | run-worker.ts:382+ | 避免 UI 只剩用户句 |
| Stale/orphan 收尸 | stale-runs.ts 全文件 | orphan running、HB stale、queued 过久、missing agent；Settings/Runs 可 recover |
| Agent readiness API + UI chips | readiness.ts, roster routes, Agents/Squads UI | 展示层已有；enqueue 闸未接 |
| Runs Mission Control 列表 | RunsPage.tsx | 超车 Multica 无独立 /runs；但 CTA 仍有 F5 |

---

## 6. Recommended next 3 demoable slices

### Slice A — Chat 真·多轮（F2 + 部分 F5/F11）
**Demo**: 同 thread 问「写个 fib」→ 再问「改成 tailrec」→ 第二答引用第一答；失败行 CTA「打开会话」；思考中可取消。
**Touch**: runtime/prompt.ts, routes/chat.ts（可选）, RunsPage.tsx / RunDetailPage.tsx / ChatPage.tsx, 空态文案。
**Out of scope**: project picker。

### Slice B — Project local path → issue cwd（F1 + F6 起步）
**Demo**: 建 Project 绑 D:/code/foo；issue 挂该 project 后 run 的 cwd/日志显示 foo；未绑 project 仍走 workspace。
**Touch**: schema + migrate, projects API/UI, resolve-run-cwd.ts（读 issueId→project）, run-worker 传入 issueId。
**Out of scope**: Multica lease / sidecar manifest。

### Slice C — Enqueue 可观测 + issue idle 超时（F3 + F4 + F8）
**Demo**: cwd 未配置时指派 → toast/inbox「未开工：cwd_missing」且无假 running；故意卡住的 issue run 在 idle 阈值后失败原因可读。
**Touch**: run-service 返回 reason, issues/issue-create 透传, inbox-writer, run-worker issue timeoutMs 或 idle, NewIssueForm 可选硬确认。

---

## Appendix — Axis checklist

| # | Axis | Verdict |
|---|------|---------|
| 1 | Execution cwd | Chat scratch 已修；issue/QC/squad/rerun 仍全局 root；无 project path |
| 2 | Timeouts / hangs / orphans | Chat 15m OK；issue 靠 2m HB；缺 Multica idle/tool/lease |
| 3 | Prompt / context | Chat 无 history；wiki/AGENTS/skills 绑 workspace |
| 4 | Assignee / readiness silent fail | UI 警告；server enqueue null 静默 |
| 5 | Chat product | Pin/archive 有；缺 history/project/cwd 展示/cancel |
| 6 | Runs Mission Control CTAs | 列表强；chat/无 issue CTA 错 |
| 7 | Settings health actionability | 信息全；行内动作弱；默认路径文案绑 monorepo |
| 8 | Board / issues | 筛选/指派可用；执行闸弱 |
| 9 | Skills / runtimes | 全局 cwd 耦合 |
| 10 | Inbox noise | 成功 run 噪声；chat 漏报 |

---

*Read-only research; only this progress file written.*
