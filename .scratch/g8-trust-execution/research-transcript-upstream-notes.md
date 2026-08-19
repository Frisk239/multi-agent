# G8-5 调研：Transcript / 日志密钥 scrub 的上游证据

> 2026-08-17；只读核对 Multica 与 Hermes 源码。未改 `app/` 或 `references/repos/`。

## 结论

G8-5 应采用 **“同一纯 scrubber，写入/广播边界强制调用”** 的结构：先脱敏，再入库、截断和从同一安全对象广播。替换符使用不携带长度或首尾字符的稳定 `[redacted]`。只覆盖高置信凭据形状；它是防 CLI 回显进入本地 transcript 的纵深防御，不是密码学保证或通用 PII 系统。

不要把现有 `stream-scrubber.ts` 的 memory/think 围栏能力当成 secret 脱敏：它的**有状态、跨 chunk、末尾 fail-safe**形态很值得移植，但其匹配目标不同。若 live WS 也发送文本 delta，不能对每个 delta 做无状态 regex 后就宣称安全；应在独立 `StreamSecretScrubber` 中保留可能的 token 前缀直至分隔符/流结束，或先只广播已聚合并 scrub 的消息。无论 UI 流式策略如何，最终合并消息入库必须再次 scrub。

## Multica：持久化/广播的正确边界，以及日志例外

| 一手来源 | 已实现行为 | 对 G8-5 的价值与边界 |
|---|---|---|
| `references/repos/multica/server/pkg/redact/redact.go:19-75,166-180` | `Text` 按已知 AWS、GitHub、API key、JWT、Bearer、连接串、敏感 `KEY=value` 等规则逐个替换为**完整类别 placeholder**。 | 模式清单应只取高置信集合；`Text` 是单个字符串的无状态扫描，不能处理一个 token 跨两次调用的情况。G8 应用统一 `[redacted]`，不回显首尾字符。 |
| `references/repos/multica/server/pkg/redact/redact.go:77-152` | `InputMap` 深拷贝递归 map/slice；深度到 32 时以 `[REDACTED DEPTH LIMIT]` 代替原值。 | 结构化 tool input 也会带 secret，且深度上限走 fail-safe，而非返回未处理内容。若本仓 later 扩到 JSON input，可复用这个递归/不改原对象的边界。 |
| `references/repos/multica/server/internal/handler/daemon.go:3685-3713` | `ReportTaskMessages` 对 `Content`、`Output`、`Input` 先 scrub，随后 `CreateTaskMessage`，最后从已创建记录构造 `publishTask` payload。 | 这是本刀最直接应学的顺序：**入库和 WS 都只见同一份已脱敏数据**，不能靠前端遮盖。 |
| `references/repos/multica/server/internal/daemon/daemon.go:5928-5960,6042-6052` | daemon 将 text/thinking 聚合为批次，并在 tool input 离开 daemon 前额外 `InputMap`；服务端仍会二次清洗。 | 双边界可容忍版本滚动，但 text batch 本身不是 stateful secret scrubber：500ms flush 前后的 token 分段仍可能逃过单次 regex。因此 G8 不应把“批量”当作跨 chunk 解决方案。 |
| `references/repos/multica/server/pkg/agent/codex.go:2564-2584` | patch 内容先 `InputMap`，再套 size budget；注释明确说明先截断会把完整 private-key pattern 切坏。 | 本仓任何 transcript 长度截断也应遵守 **redact before truncate**。 |
| `references/repos/multica/server/internal/service/task.go:3011-3014` | synthesized fallback comment 也是先 `redact.Text`，后截断再写入 issue thread。 | 失败摘要、fallback/comment 同样是 transcript 的旁路，不能只补正常 run-message 路径。 |

### Multica 的日志泄露边界

Multica 的“DB / WS 前脱敏”并不等于“所有本地 daemon 日志前脱敏”：

- `references/repos/multica/server/internal/daemon/daemon.go:6095-6111` 把 `MessageText` 和 `MessageError` 的原始 `msg.Content` 交给 `taskLog`，之后才交给服务端 ingest。
- `references/repos/multica/server/pkg/agent/stderr_tail.go:25-40` 会清洗要放入 `Result.Error` 的 stderr tail；但 `stderrTail.Write` 在 `:42-80` 先把原始 bytes 写给 `inner` daemon logger，再保留 tail。

所以可移植结论是：run message 的安全边界应在**本仓写库/广播之前**，而 worker/child-process 原始日志则需单独在 logger sink 前 scrub；不能因为最终 API 安全便声称宿主日志也安全。

## Hermes：更丰富的 regex/log 覆盖，及其不是 transcript 总闸门的证据

| 一手来源 | 已实现行为 | 对 G8-5 的价值与边界 |
|---|---|---|
| `references/repos/hermes-agent/agent/redact.py:59-68,491-682` | `redact_sensitive_text` 覆盖前缀型 token、ENV/JSON/YAML 赋值、认证 header、私钥、连接串、JWT 等；默认开启，但 `HERMES_REDACT_SECRETS=false` 可关闭，`force=True` 才是不受开关影响的安全边界。 | G8 的持久化/广播/日志入口应使用不可关闭的调用语义，不能把安全性放在 runtime user toggle 上。Hermes 也刻意保留某些 Web URL query/userinfo 场景（`:655-667`），说明 pattern 范围必须写明而非假称全覆盖。 |
| `references/repos/hermes-agent/agent/redact.py:309-361,464-488` | 日志显示用的 `mask_secret` 对长 token 保留首尾；而文件读取路径改用不可复用 sentinel，避免 agent 将截断 token 写回配置。 | G8 的 DB/WS transcript 选择更保守的 `[redacted]`：不泄露长度/首尾，也不让显示值看起来可再次使用。 |
| `references/repos/hermes-agent/agent/redact.py:803-811`；`references/repos/hermes-agent/hermes_logging.py:315-360,384-398` | `RedactingFormatter` 在 formatter 阶段处理 logging record；配置的滚动文件 handler 和 verbose console handler 都使用它。 | logger sink 是正确的防线位置。不过只覆盖经过 Python logging handlers 的记录；直接 callback、`print`、子进程原始 stderr 等不能由此自动保证。 |
| `references/repos/hermes-agent/run_agent.py:2525-2612` | 可选 JSON session snapshot 在每条 message `content` 与 system prompt 写盘前调用 redactor。 | 这体现“持久化前 scrub”，但开关默认外置且只显式处理 content/text；不能据此假设所有结构化字段已清。 |
| `references/repos/hermes-agent/run_agent.py:1829-1877`；`references/repos/hermes-agent/hermes_state.py:3437-3495` | canonical `state.db` flush 将 `content`、`tool_calls`、reasoning 及 Codex items 原样交给 `append_message` JSON/SQLite 序列化；该写入边界没有 `redact_sensitive_text`。 | Hermes 不应被误读为“所有 transcript 都已脱敏”。本仓应把 scrub 放在自己的 canonical run-message writer，而非只处理可选 export/snapshot。 |
| `references/repos/hermes-agent/tools/process_registry.py:2148-2170` | background process output 在送给 model、session DB、CLI display 前调用 terminal-output redactor，避免前景/后台路径分叉。 | 证明所有 transcript 入口（run event、activity/fallback、background/terminal output）都要列出，而不是只修一个 UI API。 |

## Hermes 的跨 chunk 经验：可借状态机，不可误称 secret scrub

`references/repos/hermes-agent/run_agent.py:4650-4701` 的 `_fire_stream_delta` 先喂 `StreamingThinkScrubber` 和 `StreamingContextScrubber`，再交 callback；这里**没有**调用 `redact_sensitive_text`。它解决的是 reasoning 和 `<memory-context>` 隐藏内容，而非凭据。

其状态机实现 `references/repos/hermes-agent/agent/memory_manager.py:171-270` 说明了可移植的流式安全原则：保存部分 tag tail；未闭合 span 在 `flush()` 时丢弃，选择截断而不是泄露。回归测试 `references/repos/hermes-agent/tests/run_agent/test_run_agent_codex_responses.py:1963-2011` 明确覆盖 tag/payload 跨多个 delta 且 turn 间 reset。

对 G8 的对应要求：secret stream scrubber 必须有自己的 chunk-split 测试（例如 credential 前缀、body、终止分隔符落在三个 chunk），不能复用 memory/think 的测试来证明密钥安全。

## 建议落点与验收补充

1. 新建纯函数 `runtime/secret-scrubber.ts`：高置信文本规则、稳定 `[redacted]`、模块注释声明“非密码学保证，防 CLI 回显”。先让 canonical run-message 持久化函数 scrub `content` / `output`，再由该安全消息广播；对 structured `input` 仅在范围明确时递归处理。
2. 任何截断、分页缓存、fallback failure/comment、activity/terminal output 都调用同一函数并遵循 **scrub → truncate → persist/broadcast**。logger 也在写 sink 前调用，不把 child 原始 stderr 的现有保留逻辑误算为安全。
3. stream 仍与 memory/think scrubber 并列：最终聚合消息必测、必 scrub；若本刀 live-delta 广播，增加有状态 tail 缓冲并测试 split token。若先不做该状态机，文案/实现不得把 live partial 当作已脱敏流。
4. 验收至少包括：fake Bearer / API-key prefix / AWS-style key / `api_key=value` 到 DB、API 和 WS payload 均无原文；跨 chunk 最终消息无原文；正常短 `sk`/代码常量不误伤；分页查询仍是线性。
