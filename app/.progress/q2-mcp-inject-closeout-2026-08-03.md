# Q2 MCP 经 ACP 注入 — closeout（2026-08-03）

> 第七波「品质波」M1 ACP 边界闭合 · 刀 2：`grok.ts` 的 `mcpServers: []` 硬编码 → agent.mcpServers 真实注入，**grok 0.2.118 真机接受且会话内工具可见**。G1-2 closeout 已知边界「MCP 服务器经 ACP 注入未做」正式关闭。

## 勘察结论

| 项 | 结果 |
|---|---|
| multica 蓝图 | `server/pkg/agent/hermes.go:1986 buildACPMcpServers`（Claude 风格 `{"mcpServers":{...}}` → ACP **数组形态**，env/headers 为 `{name,value}[]`）+ `convertACPMcpServer`（stdio 分类 command/url）+ `filterACPMcpServersByCapability`（:2146，initialize `agentCapabilities.mcpCapabilities` 过滤远程 transport，stdio 总通过）+ `grok.go:317`（session/new|load 携带）+ 注释「grok 0.2.x initialize 声明 mcpCapabilities {http}」 |
| 本仓现状 | `ExecutionInput.mcpServers` 字段已存在（agent.mcpServers JSON 字符串，AgentBuilder/Detail 已有 UI 编辑）；grok.ts session/new|load 硬编码 `mcpServers: []` |
| ACP 协议约束 | 客户端不得发送 agent 未声明的 transport 类型（agentclientprotocol.com/initialization）——违规整个 session/new 被拒（Hermes/Kimi 实测），故 fail closed + 按能力过滤 |

## 改动

| 文件 | 改动 |
|---|---|
| `runtime/acp-mcp.ts`（新） | `buildAcpMcpServers`（解析+排序确定性+malformed throw fail closed+无 command/url throw）+ `extractAcpMcpCapabilities`（未声明=全不支持）+ `filterAcpMcpServersByCapability`（stdio 总通过；远程按声明过滤 + warn 日志）——学 multica hermes.go:1986/2118/2146 |
| `runtime/grok.ts` | initialize 后：`input.mcpServers` → build → capability 过滤 → session/new\|load 携带 `mcpServers`；解析失败诚实 fail（「MCP 配置解析失败」）；注入成功打 log 事件「注入 N 个 MCP server」 |
| `runtime/acp-mcp.test.ts`（新） | 9 用例：空/null→[] / stdio 转换（env 数组形态）/ 远程转换（type 归一化 http·sse）/ 排序确定性 / malformed throw / 无 command·url throw / capabilities 提取 / 过滤（stdio 总通过 + 远程按声明）/ 空列表不 warn |
| `runtime/grok.test.ts` | +3 用例：session/new 携带 ACP array shape（stdio+远程全量）/ malformed → 诚实 fail / 未声明远程 transport → 过滤（stdio 保留 + warn + 注入 1 个日志） |

## 真机验证证据（grok 0.2.118 + 真实 filesystem MCP server，独立验收环境）

配置：agent.mcpServers = `{"mcpServers":{"fs":{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","D:/mcp-test-dir"]}}}`，issue 要求用 fs 工具读取 `D:/mcp-test-dir/sample.txt`。

run 消息序列（DB 直查，run completed）：

```
[tool_start] search_tool {query:"fs"} → 发现 server "fs"（result_count: 14）
[tool_start] use_tool {tool_name:"fs__list_allowed_directories"} → "Allowed directories:\nD:\\mcp-test-dir"
[tool_start] use_tool {tool_name:"fs__read_text_file", tool_input:{path:"D:/mcp-test-dir/sample.txt"}} → "hello from mcp test"
[assistant] hello from mcp test
```

**结论：grok 0.2.118 接受 session/new 的 mcpServers 注入，MCP server 真实 spawn 并连接，会话内工具（fs__*）可见且可用。** 不是上游限制，是完整闭环。截图：`.scratch/q2-mcp-inject/q2-mcp-injection.png`（run 详情页 fs__list_allowed_directories / fs__read_text_file 事件可见）。

## 测试与门禁

- server typecheck 绿；acp-mcp 9/9 + grok 21/21（原 18 + 新 3）绿
- 真机证据：run 消息序列 + 页面截图

## 决策记录

1. **学 multica 全链路**（build → capability filter → session 携带），不是简化版——协议违规的教训（Hermes/Kimi 拒整个 session/new）直接内化为 fail closed + 过滤。
2. **agent.mcpServers 保持 Claude 风格 JSON**（已有 UI/DB/字段语义不变），翻译发生在 grok backend 边界——多 runtime 可复用同配置。
3. **malformed → 诚实 fail 不静默**：坏配置会让 run 失败并给出可行动文案（对齐 multica「Fail closed on malformed JSON」）。
4. **capability 过滤打 warn 日志**（log 事件进 UI）：被跳过的远程 MCP 用户可见原因。

## 已知边界（后续刀）

- run 详情页无独立「MCP 注入清单」展示（当前以 tool 事件 + log 事件体现）；如需显式面板可后置
- 远程（http/sse）MCP 真机未验（grok 0.2.118 声明 http 支持；本刀用 stdio 验证闭环，远程路径由单测覆盖）

## 测试计数

- server：acp-mcp 9（新）+ grok 21（+3）
- 全量门禁（web/shared）在最终统一跑
