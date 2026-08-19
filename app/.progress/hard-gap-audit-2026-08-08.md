# 当前硬性缺口审计（后端功能 × 前端交互）

- 日期：2026-08-08
- 范围：只读审计；未运行服务、未修改应用代码、测试或数据库。
- 目标：判断本仓离「本机编码 CLI 的日用编排控制台」还差哪些**会使能力失真、执行不可控或高频交互不能闭环**的项目；不把云端、多租户、Multica daemon 1:1、RBAC 等既定边界误报为缺口。
- 方法：阅读 `AGENTS.md`、`design/roadmap.md`、当前 `app/` server/web/shared 实现与既有 closeout；交叉核对 `references/repos/multica`、`pi`、`hermes-agent`、`openwiki` 的源码。上游仅作设计证据，不主张照搬其云端/daemon 架构。

## 结论先行

主链路 **Issue → 指派/Squad → Run → 观测/恢复 → Wiki/Memory → Settings** 已经具备，G7 也补齐了侧滑返回、长转录虚拟化、表单与键盘等高频体验；当前不缺一次“重做大页面”的工程。

但还存在一组更关键的可信度缺口：控制台有时把“已配置 / 已就绪 / 已限制 / 已注入”展示成事实，而某些 runtime、异常重启或多项目路径并没有兑现。优先应先把这些能力契约收紧，再扩宽功能面。

| 优先级 | 缺口 | 为什么是硬问题 | 建议方向 |
|---|---|---|---|
| P0 | Agent 环境变量与 MCP 可直接携带密钥并落 SQLite | 违背项目“密钥不落库/UI”约束；备份、导出和本机数据库读取都会扩大暴露面 | 改为 env 引用名/进程环境解析，拒绝敏感值持久化，统一脱敏 |
| P0 | Runtime 配置契约不一致：MCP 会静默失效，Claude 参数会重复追加 | UI 所见不等于运行时实际效果，直接影响派活正确性 | 统一 canonical config + runtime capability matrix；先修 Claude 重复 args |
| P1 | Pi 的 confirm/select/input/editor 只提示、不回传 | 有交互式扩展时 CLI 会阻塞到 idle timeout，控制台无法完成闭环 | 支持持久化请求和响应，或显式无人值守并 fail-closed |
| P1 | “ready”只表示 CLI 被找到，不表示可认证、可建会话、可跑配置 | 用户会在派活后才发现登录、模型、扩展或配置错误 | 每个 adapter 提供无副作用 preflight；UI 分层展示安装/可执行/已配置 |
| P1 | Run 状态的实时投影不完整 | 服务端已发 `waiting_local_directory`，前端忽略；部分 deferred 转换也不广播 | 为每个状态转换规定事件与 cache 投影，并做契约测试 |
| P1 | 长 Run 只虚拟 DOM，仍全量查库/传输/保存在 JS | 长任务会卡在网络、JSON 和内存；此项也仍是 G6-5 | `afterSeq + limit` 游标分页、WS 重连增量 catch-up、按需加载旧消息 |
| P1（多项目前） | Memory 无 project 边界 | 两个项目相似术语会产生跨仓错误注入 | `projectId | global` 的检索契约与迁移；全局记忆显式标识 |
| P2（战略） | 同仓多 Agent 只能安全串行 | 这不是 bug，但限制了“多 Agent 并行编码”吞吐 | 保留共享目录串行，另增 opt-in Git worktree 模式 |

## P0：配置与密钥的真实性

### 1. 密钥不落库约束被 Agent 配置绕开

项目宪法明确规定密钥不落库，但 Agent 的 `envVars` 与 `mcpServers` 是可编辑、可回读并直接持久化的原始值：

- 表字段：`app/packages/server/src/db/schema.ts:54-59`。
- 创建/更新会 `JSON.stringify(input.envVars)` 写入：`app/packages/server/src/routes/roster.ts:121-126,169-183`。
- Shared 契约允许任意 `key/value`：`app/packages/shared/src/schema.ts:1052-1070,1090-1119`。
- 前端明确让用户录入 `KEY=VALUE`，并把 MCP `env` 放在示例中：`app/packages/web/components/AgentDetailPage.tsx:921-986,1111-1115,1192-1222`。
- 执行 worker 再将其解析后注入子进程：`app/packages/server/src/runtime/agent-inject.ts:1-26`、`app/packages/server/src/orchestration/run-worker.ts:367-379,574-601`。

本地产品不等于“数据库备份、诊断导出、另一位本机用户、日志/截图”没有风险；更重要的是这是与当前宪法直接相反的实现。建议将 Agent 配置仅保存**环境变量名/引用**，例如 `ANTHROPIC_API_KEY -> process.env.ANTHROPIC_API_KEY`；运行时解析，不在 API 回读值。MCP 的 `env`/`headers` 同样应采用引用，且所有运行快照、失败文本、诊断都遵守同一脱敏器。不要为了本问题引入云端 vault。

### 2. MCP / runtime 配置“显示已配”但跨 backend 不同效，另有 Claude args 回归

这是当前最明确的运行时正确性问题，而不是功能愿望单：

1. Agent 页面要求并示例的是裸 object：`{ "github": { ... } }`（`app/packages/web/components/AgentDetailPage.tsx:1192-1222`）。Claude adapter 会把它包成 `{mcpServers: parsed}`，因此 Claude 可工作（`app/packages/server/src/runtime/claude-code.ts:165-177`）。
2. Grok ACP 转换器却读取 `parsed.mcpServers`；裸 object 会返回空数组而不抛错（`app/packages/server/src/runtime/acp-mcp.ts:54-75`），Grok 仅在非空时写“已注入”日志（`app/packages/server/src/runtime/grok.ts:298-317`）。结果是同一 UI 配置对 Grok **静默注入 0 个 server**。
3. `opencode.ts`、`cursor.ts`、`pi.ts` 的 adapter 不消费 `input.mcpServers`；通用 MCP Tab 仍对所有 Agent 可见。也就是说它们的设置同样可能成为静默 no-op。
4. `buildClaudeArgv` 已追加一次 `customArgs`（`app/packages/server/src/runtime/claude-code.ts:116-133`），`execute` 又追加一次（`184-186`）。任意 Claude 自定义参数会被传两遍。

Multica 将“后端不读取 mcp_config”视为必须隐藏 MCP Tab 的情况，测试注释直接指出保存配置会导致 silent no-op：`references/repos/multica/packages/views/agents/components/agent-overview-pane.test.tsx:172-198`。其 OpenCode adapter 还将统一 MCP config 映射到 `OPENCODE_CONFIG_CONTENT`，而不是假装所有 runtime 使用同一底层格式：`references/repos/multica/server/pkg/agent/opencode_mcp.go:58-115`、`references/repos/multica/server/pkg/agent/opencode.go:139-158`。

建议的最小切片顺序：

1. 先去掉 Claude 的二次 `customArgs` 追加并加 execute 级回归测试。
2. 为 backend 声明 `supportsMcpConfig`、`supportsCustomArgs`、`supportsInteractiveInput`、`supportsSessionResume` 等能力；前端基于真实能力隐藏/禁用，不能支持时 fail-closed 而不是保存后无效。
3. 定义一个 canonical MCP 结构，在每个 adapter 边界做显式投影/校验；只在各 backend 真正支持后开放其编辑入口。

## P1：执行闭环与可观测性的缺口

### 3. Pi extension UI 的请求没有响应通道

当前 Pi adapter 的运行中命令只含 `steer/compact/set_model`（`app/packages/server/src/runtime/pi.ts:27-35,107-147`）。收到 `extension_ui_request` 时仅写一次“正在等待确认”的日志，然后 return（`pi.ts:382-393`）；Run 详情只提供 steer/compact 控件（`app/packages/web/components/RunDetailPage.tsx:600-638`）。因此 Pi 扩展请求 confirm、select、input 或 editor 时，控制台既没有可答复的状态，也没有答复 API，最终靠 idle 超时收尸。

Pi 自身 RPC 明确把这些 dialog 定义为“stdout 请求后阻塞，等待 stdin 的 `extension_ui_response`”：`references/repos/pi/packages/coding-agent/docs/rpc.md:1050-1056,1089-1138,1219-1236` 与 `references/repos/pi/packages/coding-agent/src/modes/rpc/rpc-types.ts:229-275`。Hermes 的 ACP edit approval 也采用 proposal → allow/deny → timeout deny 的闭环：`references/repos/hermes-agent/acp_adapter/edit_approval.py:233-261,286-336`。

这里无需机械地做一个大型审批系统，需先选择并兑现一种语义：

- **交互模式**：持久化 pending request、Run 进入 `awaiting_input`、Web 端展示确认/选择/输入，并能在刷新后恢复和超时拒绝；或
- **无人值守模式**：在 preflight 识别会交互的扩展后阻断/立即取消，UI 明示原因。Multica 的 headless Claude 也会禁用 `AskUserQuestion`（`references/repos/multica/server/pkg/agent/claude.go:675-681`）。

关键是不再“提示后挂起”。

### 4. “Runtime ready”是安装探测，不是执行 readiness

`DetectResult` 只有 `installed/version/path`（`app/packages/server/src/runtime/types.ts:59-63`）。Agent readiness 与 Settings live probes 都以“adapter 已实现 + binary 已找到”得到 `ready`（`app/packages/server/src/orchestration/readiness.ts:34-36,81-103`；`app/packages/server/src/settings-live-probes.ts:86-101`），而 Settings/UI 又以 “Live Runtime Probes / runtime ready” 呈现给用户（`app/packages/web/components/SettingsPage.tsx:1847-1908`）。

这无法及早发现认证过期、没有可用模型、Pi 扩展加载错误、项目不可信或 runtime-specific MCP 配置错误。Pi 在创建 runtime 时会收集项目可信、设置、扩展等 diagnostics，说明这些不是纯 PATH 问题：`references/repos/pi/packages/coding-agent/src/main.ts:675-699,786-797`、`references/repos/pi/packages/coding-agent/src/core/agent-session-services.ts:137-176`。

建议把状态拆成“CLI 已安装 / 可启动 preflight / 已认证与模型可用 / 最近一次执行结果”；adapter 的 preflight 必须无副作用、不得写项目、不得弹交互认证。无 safe preflight 的 runtime 也应显示“安装已发现，配置未验证”，而非 `ready`。

### 5. 服务端已产生状态事件，Web cache 没有完整投影

Worker 把被同路径占用的 run 转为 `waiting_local_directory` 并发布 `run:waiting_local_directory`（`app/packages/server/src/orchestration/run-worker.ts:154-176`）。Shared WS 契约也存在该事件，但 web 的生命周期分支只处理 queued/running/completed/failed/cancelled，遗漏 waiting（`app/packages/web/lib/ws.ts:357-398`）。Kanban 仅加载 `queued`/`running` 的轻量 runs，故该状态不一定能实时映射到卡片（`app/packages/web/components/KanbanBoard.tsx:172-175`）。

Multica 把它作为独立协议事件（`references/repos/multica/server/pkg/protocol/events.go:31-40`），前端明确写入 cache，注释说明否则 status pill 会停在旧帧：`references/repos/multica/packages/core/realtime/use-realtime-sync.ts:1352-1389`。

另外，queued 超龄转 `deferred` 时会落 activity/inbox，但该转换本身未发布 run 或 activity WS 事件（`app/packages/server/src/orchestration/stale-runs.ts:658-711`）。部分页面会在短轮询后看到新值，但不应把状态正确性依赖于刷新或偶然轮询。

建议建立单一的“状态转换 → domain event → React Query projection”表与测试：每个可见状态恰有一个更新事件；前端用同一 upsert 覆盖所有 run 状态，deferred 同时发布 `activity:created`。

### 6. 长转录只虚拟了 DOM，传输层仍全量

`GET /api/runs/:runId/messages` 没有查询参数并用 `.all()` 返回全部消息（`app/packages/server/src/routes/runs.ts:146-158`）；前端也整包读取和缓存（`app/packages/web/lib/api/runs.ts:315-331`），之后才虚拟化 DOM（`app/packages/web/components/RunDetailPage.tsx:282-321`）。虚拟化已正确解决渲染树，但不解决查询、网络、JSON parse、过滤/配对和内存。

这正是未完成的 G6-5：`design/roadmap.md:128`。Multica 的持久化消息 `seq` 与 `since` 增量 catch-up 可作简单参照：`references/repos/multica/server/pkg/db/queries/task_message.sql:6-14`、`references/repos/multica/server/internal/handler/daemon.go:3755-3795`。

建议按现路线做 `afterSeq + limit`，将首屏/最新尾部和“加载更早”分开；WS 重连只补 gap，保留 seq 去重。用 10,000 消息 smoke/e2e 验收，而不是仅验证 DOM 节点数量。

### 7. 重启后状态能收尸，但不能证明孤儿 CLI 已停止

`AbortController` 与子进程 PID 都是内存 Map；文件注释本身说明崩溃后 CLI 可能由 OS 接管，重启不会重跑也不会杀它（`app/packages/server/src/orchestration/run-control.ts:1-16`、`app/packages/server/src/runtime/process-tree.ts:12-30`）。启动恢复会将 DB `running` 统一标为 `failed: orphan: no live executor after restart`（`app/packages/server/src/orchestration/stale-runs.ts:257-288`），但 `agent_run` 没有持久 PID/start identity/owner lease。

这不是“收尸没做”，而是**DB 状态与真实 CLI 是否仍在写工作区可能不一致**。对会改代码的本机 CLI，应将其列为可靠性缺口。建议持久化 execution owner（PID、启动标识、run id、cwd、命令摘要），启动时以进程起始时间/命令行安全比对；能确认才 kill tree，不能确认则标 `unknown_external_execution` 交给用户，绝不可仅凭可复用 PID 强杀。

## 多项目与并行：条件性高优先级

### 8. Memory 当前刻意全局；多项目日用前必须隔离

该行为不是误实现：状态接口明确 `perProject: false`（`app/packages/server/src/memory/manager.ts:48-54,244-252`）。然而 `memory_item` 没有 `projectId`（`app/packages/server/src/db/schema.ts:422-439`），自动 prefetch 只传 issue 文本/session id（`app/packages/server/src/memory/manager.ts:171-201`），SQLite FTS 查询也没有项目条件（`app/packages/server/src/memory/sqlite-text-provider.ts:78-119`）。当前系统已有 Projects，因此一套控制台管理两个无关仓时，“部署、API、迁移”等同词会召回另一个仓的结论。

OpenWiki 以 cwd 为项目根并用 hash 区分 thread（`references/repos/openwiki/src/agent/index.ts:213-223,246-253`）；Hermes memory provider 的接口允许 workspace/user/session 隔离上下文（`references/repos/hermes-agent/agent/memory_provider.py:73-104`）。建议模型变为 `projectId | global`：旧数据迁为 global，UI 和 prompt 明确 global 来源；默认自动注入限定同 project。若产品继续只服务单仓，保留现状也可以，但应在 Projects 扩展前明确这个边界。

### 9. 同一 Git 仓并行是“安全串行”，不是当前 bug

项目路径会优先使用真实 `project.localPath`（`app/packages/server/src/runtime/resolve-run-cwd.ts:217-250`），同一 `project_local` 被 DB 路径锁串行并显示 `waiting_local_directory`（`app/packages/server/src/orchestration/path-lock.ts:1-2,146-163`；`app/packages/server/src/orchestration/run-worker.ts:98-101,154-186`）。默认隔离目录只是空 workdir，不是 clone/worktree。

这正确避免了两个 CLI 同时改用户 checkout；不应直接移除锁。Multica 也会对用户本机目录使用共享/串行语义，但其托管仓路径能从 bare cache 建每任务 worktree：`references/repos/multica/server/internal/daemon/local_directory.go:339-366`、`references/repos/multica/server/internal/daemon/repocache/cache.go:426-464,935-962`。

若“同仓多 Agent 并行改代码”是下一阶段北星，应新增**显式 opt-in**的 Git worktree 执行模式（base ref、branch 命名、bootstrap、diff、提交/合并交接、回收、异常恢复）；保留默认共享目录串行。否则这是已知产品边界，而非 P0/P1 回归。

## 小而确定的前端诚实性问题

1. Pi 已声明 `supportsSessionResume = true` 并在 spawn 时传 `--session-id`（`app/packages/server/src/runtime/pi.ts:107-109,180-184`），Pi 上游也支持该参数（`references/repos/pi/packages/coding-agent/src/cli/args.ts:104-109,243-250`）；Run 详情仍称 Pi 暂不支持 session resume（`app/packages/web/components/RunDetailPage.tsx:933-936`）。应从 runtime capability matrix 生成文案并加回归测试。
2. “Allowed Paths” UI 写的是“限制 Agent 只能修改这些文件”（`app/packages/web/components/AgentDetailPage.tsx:1060-1062`），实际只是在 prompt 中插入 `<boundary-fence>`（`app/packages/server/src/runtime/prompt.ts:297-300,462-464`），不是 filesystem sandbox；Grok 又以 `--always-approve` 启动（`app/packages/server/src/runtime/grok.ts:42,78`）。短期至少改文案为“提示性边界”，真正强制需独立的 runtime sandbox / worktree 权限设计。
3. G6-7 “Automation 连续 skipped 运营警示”仍未完成（`design/roadmap.md:130`）。这是低中风险运维缺口：规则当前可持续跳过而仅在列表呈现状态，建议在完成上述 P0/P1 后按既有路线取刀。

## 不应列为当前硬缺口

- 云端、多租户、Redis、Webhook/外部 VCS、多人 RBAC、Multica daemon 协议 1:1：与本仓纯本地边界相冲突。
- 自建模型/tool agent loop：与 `RuntimeBackend` 驱动用户既有 CLI 的宪法相冲突；当前 adapter 边界应保留（`app/packages/server/src/runtime/types.ts:65-90`）。
- 再造看板、Run 详情、Wiki/Memory 页面：已有基础与近期 G7 的交互收官，不是当前的瓶颈。
- 立刻支持 20+ runtime：当前缺 Codex 等可视目标用户而定；先修五个已声明 runtime 的能力真实性更高价值。

## 建议开刀顺序

1. **Runtime config truthfulness（小/中）**：Claude `customArgs` 回归修复；MCP 统一形状和 runtime capability matrix；MCP 无支持时禁止静默保存。
2. **Secret policy repair（中）**：将 Agent env/MCP 敏感值迁为引用；扫 API 回读、日志与导入/导出脱敏。
3. **状态事件完整性（小）**：补 `waiting_local_directory` / `deferred` 的 WS 与 query projection 契约测试。
4. **G6-5 消息游标分页（小）**：这已经有路线项，完成后才能称长转录真正可扩展。
5. **Runtime preflight + Pi 无人值守/交互策略（中）**：优先把无法兑现的 runtime 语义在派活前说明或阻断。
6. **多项目 Memory 边界（中）**：在 Projects 成为日用入口前完成；若明确单仓，可暂标产品边界。
7. **崩溃时 execution ownership（中）**：设计安全的持久运行所有权，而不是 PID 盲杀。
8. **Git worktree 模式（大）**：作为明确的吞吐扩展，不破坏当前安全串行默认。

## 审计后落地（2026-08-08）

本轮按上述结论修改了 `app/`，`references/repos/` 保持只读：

- Agent env/MCP 新写入改为 env 引用与 fail-closed 校验；API 回读统一脱敏，旧的明文遗留值不会再注入执行。
- Runtime 增加 MCP/customArgs/resume 能力矩阵；Claude 参数重复追加已移除；Grok/Claude MCP 使用同一 canonical server map；不支持 MCP/customArgs 的 runtime 在执行前明确失败。
- Pi 对阻塞式 extension UI request 自动发送 cancelled response，避免无人值守 run 卡到 idle timeout。
- readiness/live probes 改为显式 `installed · unverified` 语义；Allowed Paths 文案改为 prompt 提示性边界，不再宣称文件系统沙箱。
- `waiting_local_directory` / `deferred` 完成 domain event、WS topic 与 React Query 投影；run messages 支持 `afterSeq + limit`，Run 详情按 500 条增量加载。
- Memory 增加 `projectId` 迁移（旧行保持 global），自动注入默认限定到当前项目 + global，页面显示项目边界。
- Automation 列表显示连续 skipped 警示；Memory/MCP/环境变量安全契约补了回归测试。

验证：server 全量 `112 files / 962 tests`、web 全量 `65 files / 473 tests`、workspace typecheck 全绿。

仍保留为后续独立切片的边界：真实 runtime 认证/模型/扩展 preflight（当前诚实标记 unverified）、崩溃后带身份校验的 CLI execution ownership、显式 Git worktree 并行模式。旧数据库备份中若已有明文 secret，当前只做 API 脱敏和执行跳过；需另行安排一次性清理/迁移，避免误删用户配置。
