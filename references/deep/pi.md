# Pi — 可嵌入 Agent Harness 源码深读

> 源码：`references/repos/pi/` · 栈：TypeScript monorepo · 更新：2026-07-08
> 高层摘要：[../runtime.md](../runtime.md)

## 定位

Pi 自我描述是 "Pi Agent Harness"（`README.md:13`），构建目标明确：**Agent runtime 可作为更大编排平台下的一个层被嵌入**。对你的毕设，这是关键 —— Pi 可能直接成为你的执行层。

## 1. Monorepo 结构

五个 workspace 包，清晰依赖顺序（根 `package.json:18` build 脚本按此序）：

| 包 | npm 名 | 角色 |
|---|---|---|
| `packages/ai` | `@earendil-works/pi-ai` | **LLM provider 层** —— 跨 OpenAI/Anthropic/Google 等的统一 streaming API。拥有原始 `Message`、`AssistantMessage`、`ToolResultMessage` 类型和 `streamSimple()` |
| `packages/agent` | `@earendil-works/pi-agent-core` | **核心 runtime（"harness"）** —— `Agent`、`AgentHarness`、agent 循环、`AgentMessage` 抽象、tool 执行、session tree、compaction。框架无关 |
| `packages/tui` | `@earendil-works/pi-tui` | **UI 原语** —— 差分渲染的终端渲染库。无 agent 知识 |
| `packages/coding-agent` | `@earendil-works/pi-coding-agent` | **产品 + SDK** —— `pi` CLI、编码工具（read/bash/edit/write/grep/find/ls）、四种运行模式、可嵌入 SDK 入口。依赖上面三个 |
| `packages/orchestrator` | `@earendil-works/pi-orchestrator` | **实验性嵌入示例** —— spawn 多个 `pi --mode rpc` 子进程并复用它们。只依赖 `pi-coding-agent` |

依赖事实：`agent` 只依赖 `ai`（`packages/agent/package.json`）。`coding-agent` 依赖 `agent` + `ai` + `tui`。`AgentHarness` 类通过注入接口（`FileSystem`、`Shell`、`ExecutionEnv`、`Session`、`Models`）保持 transport/env 无关，所以 core 对 Node、文件系统、HTTP 一无所知。

### 重要：两层「harness」

- **低层 `Agent`**（`packages/agent/src/agent.ts`）是裸循环 + `convertToLlm`、`streamFn`、hooks、事件发射器。
- **`AgentHarness`**（`packages/agent/src/harness/agent-harness.ts`）包 `Agent`，加 session 持久化、队列（steer/followUp/nextTurn）、model/tool/resource 状态、compaction、branch summarization、事件/hook 系统。

值得注意的是 **coding-agent SDK 不用 `AgentHarness`**。它直接实例化低层 `Agent`（`packages/coding-agent/src/core/sdk.ts:294`）并加自己的 `AgentSession` 包装（`packages/coding-agent/src/core/agent-session.ts`）做 auto-compaction、auto-retry、extensions、持久化。**意味着 SDK 是更经实战检验的嵌入表面。**

---

## 2. AgentMessage / LLM Message 双层 + `convertToLlm`

**核心设计思想。** Agent 整个对话 transcript 保存在 `AgentMessage[]`，但 LLM 只看 `Message[]`（来自 `pi-ai`）。故意分开。

### 两层（`packages/agent/src/types.ts:309-314`）

```typescript
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```

`Message`（LLM 层）是 `pi-ai` 的 `{role:"user"|"assistant"|"toolResult"}` 闭联合。`AgentMessage` 用 TypeScript declaration merging 重开它，也包含 app 通过 `CustomAgentMessages` interface 声明的任意自定义消息类型（`types.ts:297-307`）：

```typescript
declare module "@earendil-works/pi-agent-core" {
  interface CustomAgentMessages {
    bashExecution: BashExecutionMessage;
    custom: CustomMessage;
    branchSummary: BranchSummaryMessage;
    compactionSummary: CompactionSummaryMessage;
  }
}
```

agent-core 自己定义基线自定义消息集（`packages/agent/src/harness/messages.ts:54-61`），coding-agent 重新声明同一集（`packages/coding-agent/src/core/messages.ts:70-77`）。这些消息（bash 运行、UI 通知、compaction/branch 摘要）是 transcript 里 UI 渲染的真实条目，但**没有 LLM role**。

### 边界：`convertToLlm`

`AgentMessage[]` 变 `Message[]` 的唯一地方。agent 循环每 turn 恰好调一次，provider 请求前立即调（`packages/agent/src/agent-loop.ts:288-302`）：

```typescript
// 可选 context transform（AgentMessage[] -> AgentMessage[]）
let messages = context.messages;
if (config.transformContext) {
    messages = await config.transformContext(messages, signal);
}
// 转 LLM 兼容消息（AgentMessage[] -> Message[]）
const llmMessages = await config.convertToLlm(messages);
const llmContext: Context = {
    systemPrompt: context.systemPrompt,
    messages: llmMessages,
    tools: context.tools,
};
```

`convertToLlm` 是**必需** config 字段，非可选（`types.ts:140-169`）。契约：每条 AgentMessage 映射到 `user`/`assistant`/`toolResult` 消息，或被滤掉（返回 `undefined`）。参考实现（`packages/coding-agent/src/core/messages.ts:148-195`）展示模式：

- `bashExecution` → 渲染成 user 文本消息（或 `excludeFromContext` 即 `!!` 前缀时丢）
- `custom`（扩展注入）→ user 消息
- `branchSummary`/`compactionSummary` → 包在 `<summary>` XML 标签的 user 消息
- `user`/`assistant`/`toolResult` → 原样透传
- 其他 → `undefined`（滤掉）

### 为什么分开

让 transcript 同时是 UI 渲染和 LLM 上下文的**单一真相源**，同时保持解耦。一个 UI-only 通知或 `!` 跑的 bash 命令可在 transcript 里（UI 显示、持久化、可 fork/export）但 LLM 永不见。也给宿主一个拦截点（`transformContext` 然后 `convertToLlm`）做上下文窗管理、redaction、自定义消息编码。coding-agent 还再包一次 `convertToLlm`（`sdk.ts:256-290`）在 `blockImages` 开启时剥图 —— 完全在边界内的纵深防御。

---

## 3. 事件驱动 UI 架构

Agent 发射类型化事件流，所有消费者订阅。没有基于返回值的进度回调；一切都是 pushed event。三个嵌套事件层。

### Tier 1 —— `AgentEvent`

（`packages/agent/src/types.ts:413-428`），循环 `runAgentLoop`（`agent-loop.ts:95`）发射。runtime 生命周期事件：

- Agent：`agent_start`、`agent_end {messages}`
- Turn（一个 assistant 响应 + 其 tool calls/results）：`turn_start`、`turn_end {message, toolResults}`
- Message：`message_start`、`message_update`（assistant delta，带原始 `assistantMessageEvent`）、`message_end`
- Tool 执行：`tool_execution_start`、`tool_execution_update`（部分结果）、`tool_execution_end {result, isError}`

经 sink callback（`AgentEventSink`，`agent-loop.ts:25`），`Agent` class 多路复用到订阅者 via `agent.subscribe(listener)`。

### Tier 2 —— `AgentHarnessOwnEvent`

（`packages/agent/src/harness/types.ts:634-656`），`AgentHarness` 发射。加 session/queue/provider 事件：`queue_update`、`save_point`、`abort`、`settled`、`before_agent_start`、`context`、`before_provider_request`、`before_provider_payload`、`after_provider_response`、`tool_call`、`tool_result`、`session_before_compact`、`session_compact`、`session_before_tree`、`session_tree`、`model_update`、`thinking_level_update`、`tools_update`、`resources_update`。完整联合 `AgentHarnessEvent = AgentEvent | AgentHarnessOwnEvent`（`types.ts:658-660`）。

关键：有些是 **hook 事件**可返回值影响运行（`AgentHarnessEventResultMap` at `types.ts:704-724`）。例如 `tool_call` 可返回 `{block:true}` 否决工具，`context` 可返回改写消息，`before_provider_request` 可 patch headers/transport。harness 区分 fire-and-forget 事件（`emitOwn`/`emitAny`，广播到 `*` 订阅者）和 hook 事件（`emitHook`，收集最后非 undefined 返回）。见 `agent-harness.ts:212-249`。

### Tier 3 —— `AgentSessionEvent`

（`packages/coding-agent/src/core/agent-session.ts:127-152`），coding-agent 的 `AgentSession` 发射。重新发射 agent 事件（`agent_end` 加 `willRetry`）并加产品级事件：`queue_update`、`compaction_start`/`compaction_end`、`entry_appended`、`session_info_changed`、`thinking_level_changed`、`auto_retry_start`/`auto_retry_end`。这是 UI 和 RPC client 实际消费的事件类型。

### UI 如何消费

每个模式 `session.subscribe(listener)`，`session` 是 `AgentSession`。订阅扇出在 `agent-session.ts:497-501`（简单数组迭代 `_eventListeners`），`AgentEvent` 到 `AgentSessionEvent` 的桥接 + extensions + 持久化在 `_handleAgentEvent`（`agent-session.ts:515`）。注意持久化本身事件驱动：`message_end` 时 handler append 到 session manager（`agent-session.ts:545-562`）。

三个消费者：
- **交互 TUI**：订阅并增量渲染（`message_update` delta 路径 at `agent-session.ts:533`）
- **Print/JSON 模式**：`runPrintMode` 订阅，JSON 模式下每事件写成 JSONL 行到 stdout（`print-mode.ts:104-108`）
- **RPC 模式**：`runRpcMode` 订阅，每事件作为 JSONL 行转发（`rpc-mode.ts:354-356`）

---

## 4. 四种交互模式

模式在 `resolveAppMode`（`packages/coding-agent/src/main.ts:100-111`）选，`main.ts:806-853` 分发。概念上四种驱动方式，但代码里只有三种「run mode」。

### A. 交互模式（`InteractiveMode`，TUI）

`appMode === "interactive"`。stdin 和 stdout 都是 TTY 且无 `-p`/`--print` 时选。`main.ts:810` 构造，`interactiveMode.run()` 驱动。完整 `@earendil-works/pi-tui` 终端 UI：差分渲染、每种消息类型组件（`packages/coding-agent/src/modes/interactive/components/`）、键绑定、model/thinking/session 选择器。经 `session.subscribe` 消费事件。

### B. Print 模式（`runPrintMode`）

`appMode === "print" | "json"`。一个函数两个子模式（`packages/coding-agent/src/modes/print-mode.ts`）：
- `text`：单发，只打印最终 assistant 文本，退出（`print-mode.ts:129-145`）。即 `pi -p "prompt"`
- `json`：每个 `AgentSessionEvent` 作 JSONL 行流（`print-mode.ts:104-108`）。即 `pi --mode json "prompt"`。这是有效的轻量嵌入路径。

### C. RPC 模式（`runRpcMode`）

`appMode === "rpc"`。主要的无头嵌入模式（`packages/coding-agent/src/modes/rpc/rpc-mode.ts`）。协议：stdin/stdout 上的 JSON lines。stdout 上三类消息：`response`（按 `id` 关联 command）、流式 `AgentSessionEvent`、`extension_ui_request`（宿主须答的扩展对话框）。完整 command 词汇是 `RpcCommand`（`rpc-types.ts:20-72`）：`prompt`、`steer`、`follow_up`、`abort`、`new_session`、`get_state`、`set_model`、`cycle_model`、`compact`、`bash`、`fork`、`clone`、`get_tree`、`get_messages`、`get_commands` 等。经 `rpc-entry` export（`packages/coding-agent/src/rpc-entry.ts`）启动，只调 `main(["--mode","rpc", ...])`。甚至桥接扩展 UI 需求（select/confirm/input/editor/notify）过线（`rpc-mode.ts:135-310`、`rpc-types.ts:230-265`）。

### D. SDK / 程序化模式

不是「run mode」而是进程内 API。`import @earendil-works/pi-coding-agent`，调 `createAgentSession(opts)` 拿 `AgentSession`，然后 `session.prompt(text)`、`session.steer(...)`、`session.subscribe(listener)` 等 —— 无 stdin/stdout、无子进程。见 §5。

第四项（"SDK"）其实是 RPC 模式的进程内等价：同一 `AgentSession`、同一事件，但函数调用而非 JSON 行。

---

## 5. SDK 入口 —— 嵌入 Pi 作 Runtime

**两种嵌入策略**，都是一等公民，外加一个实验性 supervisor 演示多实例嵌入。

### 策略 A：进程内 SDK（直接嵌库）

`import @earendil-works/pi-coding-agent`。公共表面从 `packages/coding-agent/src/index.ts` export。入口点按你想拥有多少接线排序：

1. **`createAgentSession(options)`**（`packages/coding-agent/src/core/sdk.ts:167`）—— 高层工厂。接 `cwd`、`agentDir`、`model`、`thinkingLevel`、`tools`、`customTools`、`resourceLoader`、`sessionManager`、`settingsManager` 等。返回 `{session, extensionsResult, modelFallbackMessage}`。**主入口点。** 例子 `sdk.ts:132-165`。内部建低层 `Agent`、接线 `convertToLlm`、`streamFn`、auth、retry、transport、所有 hooks（`sdk.ts:294-369`）。

2. **`createAgentSessionServices(opts)` + `createAgentSessionFromServices(opts)`**（`packages/coding-agent/src/core/agent-session-services.ts`）—— 想分开控制 service 构造（settings、model registry、resource loader）和 session 构造时用。CLI 用这些。

3. **`createAgentSessionRuntime(factory, opts)`**（`packages/coding-agent/src/core/agent-session-runtime.ts:406`）—— 最高层。返回 `AgentSessionRuntime`，拥有 session **并**支持拆除/换 session（`switchSession`、`newSession`、`fork`、`importFromJsonl`）带正确扩展生命周期事件。这是三种 run mode 实际持有的。

拿到 `AgentSession` 后，嵌入 API：`session.prompt(text, {images, streamingBehavior})`、`session.steer(text)`、`session.followUp(text)`、`session.abort()`、`session.subscribe(listener)`、`session.setModel(model)`、`session.setThinkingLevel(level)`、`session.compact()`、`session.navigateTree(...)`，外加状态访问器（`session.messages`、`session.model`、`session.isStreaming` 等）。`AgentSessionEvent` 类型是你 listener 消费的契约。

也可经 options 里的 `customTools: ToolDefinition[]` 注册自定义工具，或用 export 的 tool 工厂（`createBashTool`、`createReadTool`、`createEditTool`、`createWriteTool`、`createGrepTool`、`createFindTool`、`createLsTool`、`createCodingTools`、`createReadOnlyTools`）拿绑到自定义 cwd 的编码工具。

要绝对最小（无 coding-agent 产品、无 extensions、无 settings 文件），可降到 `@earendil-works/pi-agent-core` 直接用 `AgentHarness`（`packages/agent/src/harness/agent-harness.ts:157`），注入自己的 `ExecutionEnv`、`Session`、`Models`、tools、model、system prompt。公共 API：`prompt(text)`、`skill(name)`、`promptFromTemplate(name)`、`steer(text)`、`followUp(text)`、`nextTurn(text)`、`compact()`、`navigateTree(targetId)`、`subscribe(listener)`、`on(type, handler)`、`abort()`、`waitForIdle()`，外加 model/thinking/tools/resources/streamOptions 的 getter/setter。

### 策略 B：RPC 子进程（驱动子进程嵌入）

spawn `pi --mode rpc`（或 `rpc-entry` 模块），在其 stdin/stdout 上讲 JSON-RPC。这是 `@earendil-works/pi-orchestrator` 包形式化的边界，是「更大编排平台里的 Runtime 层」最干净的模式：

- **`RpcProcessInstance`**（`packages/orchestrator/src/rpc-process.ts:25`）spawn 子进程（`rpc-process.ts:50-61` 显示它解析 Bun 编译的 `pi` 二进制或 `require.resolve("@earendil-works/pi-coding-agent/rpc-entry")`），从 stdout 读换行分隔 JSON，demux 进三通道：`response`（经 `id` 关联 pending `send()` promise）、`extension_ui_request`（转发给你设的 handler）、其他（作 `AgentSessionEvent` 转发给 `onEvent` listener）。API：`send(command): Promise<RpcResponse>`、`onEvent(listener)`、`onExit(listener)`、`setUiRequestHandler(handler)`、`handleUiResponse(response)`、`dispose()`。

- **`OrchestratorSupervisor`**（`packages/orchestrator/src/supervisor.ts:63`）管理**多个**这样的实例。`spawnInstance({cwd,label})` 建实例记录和活的 `RpcProcessInstance`，同步持久化 session 元数据，跟踪状态（`supervisor.ts:270-298`）。`openRpcStream(instanceId, onEvent, onUiRequest)` 返回 `{handleRpc, handleUiResponse, close}` handle，扇出事件到订阅者并转发 command（`supervisor.ts:197-233`）。处理意外退出、资源清理、orchestrator 自己重启后的恢复（`supervisor.ts:244-255`）。**这是宿主想要 N 个隔离 pi runtime 的参考设计。**

- **IPC 协议**（`packages/orchestrator/src/ipc/protocol.ts`）在其上层分一个 orchestrator 级 request/response（spawn/list/stop/status/rpc/rpc_stream），`RpcClientMessage = RpcCommand | RpcExtensionUIResponse`，`RpcServerMessage = RpcReadyResponse | RpcResponse | AgentSessionEvent | RpcExtensionUIRequest`（`protocol.ts:115-122`）。

### 嵌入建议

- 想 pi 进程内嵌在你的 orchestrator 的 Node 进程里且 OK 共享 auth/settings 文件：用**策略 A** 的 `createAgentSession()`（或需 session 换时 `createAgentSessionRuntime()`）。订阅 `AgentSessionEvent` 做所有 UI/可观测性；调 `session.prompt()` 驱动。注册自定义工具让宿主注入能力。最低延迟、最丰富集成。
- 想隔离（独立进程、可能独立 cwd/auth、崩溃隔离、语言无关宿主）：用**策略 B** —— 驱动 `pi --mode rpc` 过 stdin/stdout。orchestrator 包是可复制粘贴的蓝图。得同样 `AgentSessionEvent` 流和同样 `RpcCommand` 词汇；用子进程边界换 IPC 开销。

无论哪种，契约相同：一个事件流（`AgentSessionEvent`）+ 一个 command 表面（`prompt`/`steer`/`follow_up`/`abort`/`set_model`/`compact`/...）。`AgentMessage`/`convertToLlm` 双层意味着宿主可在 transcript 放任意额外条目（审计记录、宿主侧通知、redaction marker），在 session tree 和 UI 里存活但永不达 LLM —— 经扩展 `CustomAgentMessages` 并提供自己的 `convertToLlm`。

## 嵌入者先读的关键文件

`packages/coding-agent/src/core/sdk.ts`、`packages/coding-agent/src/core/agent-session.ts`、`packages/coding-agent/src/core/agent-session-runtime.ts`、`packages/coding-agent/src/modes/rpc/rpc-types.ts`、`packages/orchestrator/src/supervisor.ts`。
