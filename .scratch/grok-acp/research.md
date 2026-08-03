# G1-2 Grok ACP stdio 客户端 — M1 调研摘要

> 2026-08-03 · Slice Owner 勘察 · 先信这些再实现。产物：上游 file:line 索引 + 本机实测 + 协议状态机。

## 1. 上游蓝图（最高优先级参考 = multica ACP 客户端）

| 组件 | 位置 | 职责 |
|---|---|---|
| grok backend 完整流程 | `references/repos/multica/server/pkg/agent/grok.go` | spawn `grok --no-auto-update agent --always-approve [--effort] [custom] stdio` → initialize → authenticate → session/new\|load → set_model → session/prompt → 事件流 → drain → Result |
| 传输层 hermesClient | `references/repos/multica/server/pkg/agent/hermes.go:741-980` | 行分隔 JSON-RPC；request/response id 关联（`pending` map）；writeMu 串行化 stdin；agent→client request 处理（`session/request_permission` 自动应答） |
| 通知归一化 | `hermes.go:1285-1371` | `session/update` → updateType 归一化（`sessionUpdate` camelCase / `type` / externally-tagged wrapper 三种形态）；`agent_message_chunk` / `agent_thought_chunk` / `tool_call` / `tool_call_update` / `usage_update` / `turn_end` |
| usage 解析 | `hermes.go:1201-1261, 1736-1825` | PromptResponse 顶层 `usage` → 兜底 `_meta.usage` / `_meta` 平铺字段；`excludeACPCachedInput`（totalTokens == input+output 时把 cachedRead 从 input 剥离，防 4x 多计费） |
| 会话辅助 | `hermes.go:1856-1940` | `extractACPSessionID` / `extractACPAuthMethods` / `extractACPCurrentModelID` / `resolveResumedSessionID` |
| 失败诚实 | `hermes.go:1097-1116`（isACPSessionNotFound）、`hermes.go:2350-2573`（provider error sniffer + promote）、`acp_deliverable.go`（deliverable tracker） | stderr 终端失败标记（auth/rate-limit）→ completed→failed 提升；deliverable = 最后一次 tool call 之后的文本 |
| auth 方法选择 | `grok.go:522-561` | `xai.api_key`（env XAI_API_KEY 存在且被提供时）→ `cached_token` → 无可用 → 引导 `grok login` |

## 2. 协议状态机（本工程将实现的客户端）

```
spawn grok --no-auto-update agent --always-approve [--effort L] [custom] stdio
  │
  ├─ 1. initialize {protocolVersion:1, clientInfo, clientCapabilities:{}}
  │     ← result: protocolVersion, agentCapabilities{loadSession, mcpCapabilities},
  │       authMethods[], _meta.modelState.currentModelId, availableModels
  │
  ├─ 2. authenticate {methodId, _meta:{headless:true}}
  │     （cached_token 优先——本仓密钥不落库；XAI_API_KEY 在 env 才考虑 xai.api_key）
  │
  ├─ 3a. resume 路径：session/load {cwd, sessionId, mcpServers}
  │      ← 注意：响应**顶层无 sessionId**（ACP ResumeSessionResponse 无此字段）——
  │        **_meta.sessionId / _meta.x.ai/sessionDetail.sessionId 兜底**，再无则回退请求 id（实测钉死）
  ├─ 3b. fresh 路径：session/new {cwd, mcpServers}
  │      ← result.sessionId（必需，无则 fail）
  │
  ├─ 4. （可选）session/set_model {sessionId, modelId} —— input.model 非空才发；失败诚实 fail
  │
  ├─ 5. session/prompt {sessionId, prompt:[{type:'text',text}]}
  │     ← result: {stopReason, _meta:{modelId, usage:{inputTokens, outputTokens, cachedReadTokens,
  │        cacheCreationTokens, totalTokens, costUsdTicks, modelUsage}}}
  │     流式通知 session/update（仅 prompt 发送后接受——防历史回放重复输出）：
  │       user_message_chunk / agent_message_chunk / agent_thought_chunk /
  │       tool_call / tool_call_update / usage_update / turn_end / available_commands_update
  │
  ├─ 6. drain：activity 静默 250ms 或硬上限 2s（stdin EOF 后进程自行退出）
  │
  └─ 7. Result{status, output=deliverable, usage, sessionID, error}
       stderr 终端失败标记（auth/429/quota）→ completed 提升为 failed（诚实，不误判）
```

## 3. 本机实测（grok 0.2.118，2026-08-03，`~/.grok/bin/grok.exe`）

| 事实 | 证据 |
|---|---|
| 帧格式 = **行分隔 JSON**（非 Content-Length）；初始化响应一行一帧 | probe：11 行帧全部单行 JSON |
| initialize 响应含 `authMethods:[{id:cached_token},{id:grok.com}]`、`loadSession:true`、`mcpCapabilities:{http:true,sse:true}`、`_meta.modelState.currentModelId:"grok-4.5"` | probe 输出 |
| initialize 后 grok 主动推 `_x.ai/mcp/servers_updated`（**含本机 ~/.grok 配置的 MCP 服务器与凭据**）、`_x.ai/models/update` 等私有通知——**必须忽略且不得落日志 payload**（防密钥泄露） | probe 输出 |
| authenticate(cached_token) 成功（返回空结果）；session/new 返回 sessionId | probe |
| session/prompt 流式更新：`user_message_chunk`（prompt 回显）→ `agent_message_chunk` → `available_commands_update`；**无 usage_update 通知**——usage 只在 prompt 响应 `_meta.usage`（含 costUsdTicks: 256456000 等） | probe（小任务回合） |
| 每回合耗时 ~10s（含本地 MCP 服务器初始化） | probe apiDurationMs |
| **session/load 续跑成功**：请求旧 sessionId → prompt 问"上轮要求回什么" → 答 "OKOK"（上下文延续 ✓）；load 响应顶层无 sessionId，`_meta.sessionId` 携带 | probe（两进程两次会话） |
| usage 字段名：`inputTokens/outputTokens/cachedReadTokens/cacheCreationTokens/totalTokens/costUsdTicks/modelUsage`（camelCase）；cached 计数包含在 inputTokens 内（total == input+output 证实 → 需 excludeACPCachedInput 剥离） | probe `_meta.usage` |
| `session/steer` **不存在**于 ACP v1（仅 session/cancel）——sendRunCommand 诚实返回不支持（multica 对 ACP backend 亦未实现） | agentclientprotocol.com schema + multica 无引用 |

## 4. 本仓对接点（已勘察）

| 项 | 位置 | 结论 |
|---|---|---|
| execute 入口/结果 | `runtime/types.ts` ExecutionInput/ExecutionResult | usage/providerSessionId 字段现成，run-worker 自动落库（`run-worker.ts:618-638`） |
| 事件分流 | `run-worker.ts:437-526` | `message`→run_message(assistant)；`log`→直播流 thinking；`tool_start/end`→run_message；**agent_thought_chunk → log（直播 thinking 不落库）** |
| resume 策略层 | `runtime/session-resume.ts` | `supportsSessionResume=true` 后自动注入 resumeSessionId + 终态修正，无需改 |
| 成本管道 | `runtime/model-rates.ts` + `routes/usage.ts:116` | cost = token×价表在读取时估算；grok 对齐此管道（真 token 落库；价表配了才显示 cost，诚实 null） |
| 能力声明 | `routes/settings.ts:572` grok meta + `session-resume.test.ts:38` | M4 改 true 后 Settings 自动加 Session Resume 能力文案；测试断言需更新 |
| cliequalization | `cliequalization.test.ts:170-192` | 断言 print 模式 argv（`-p` 顶层形态）→ M2 重写为 ACP argv 断言 |
| spawn 测试模式 | `pi.test.ts`（vi.mock child_process + EventEmitter 假子进程） | mock ACP server 测试网沿用此模式 |
| MCP | ExecutionInput.mcpServers 现成 | **本刀 `mcpServers: []`**（与现状 print 模式一致不注入；multica 支持 ACP 注入，留边界注释，后续可加） |

## 5. 关键决策（M1 拍板）

1. **传输层新建 `runtime/acp-transport.ts`**（复用 spawnLineProcess 不可行：需要交互式 stdin + 请求-响应关联 + 进程存活跨 prompt）。
2. **认证只用 cached_token**（本机凭据，进程内读）；`xai.api_key` 仅当 XAI_API_KEY 已在 env 且被提供时才用——维持「密钥不落库」。
3. **thinking 块 → log 事件**（对齐 UI 直播 thinking 通道）；message 块 → assistant message 落库。
4. **usage 兜底链**：prompt 响应顶层 usage → `_meta.usage` → `_meta` 平铺 → usage_update 通知（max 累计）；`totalTokens` 判定的 cached 剥离照抄 multica。
5. **失败诚实**：未登录/auth 失败 → 分类错误 + `grok login` 引导；resume session not found → 清 session id（跑 worker 的 resume_miss 语义）；stderr 终端失败标记 → completed 提升 failed。
6. **sendRunCommand**：steer/compact/set_model 统一诚实返回「ACP 运行中不支持」（ACP v1 无对应方法，multica 同）。
7. **mock ACP server 测试网**：`runtime/mock-acp-server.ts` —— 走与真机相同行分隔 JSON 线的假子进程驱动（EventEmitter），脚本化响应 + 断言请求序列，契约级覆盖状态机；不依赖真机。
8. **set_model 语义**：input.model 非空才发（G22 模型绑定）；失败诚实 fail（对齐 grok.go:376-402）；resume + session not found → 清 id。
