# G8-5 Transcript / 日志密钥 scrub：最小可验证垂直切片调研

> 2026-08-17，只读调研；未修改 app/、上游 clone 或提交。上游细节另见同目录的 research-transcript-upstream-notes.md。

## 结论与推荐

推荐将 G8-5a 定义为“运行时观察副本的写前脱敏”：在 run worker 已汇合 runtime event、但尚未写入 run_message 或发布事件的位置，构造脱敏的观察副本；同一副本再流向 DB、event bus、WebSocket 与 API replay。不要在 WebSocket 广播器或 API 读取端补救，也不要扩大为所有 activity payload 或所有用户输入。

完整消息的单一可信接入点是 app/packages/server/src/orchestration/run-worker.ts:508-573 的每 run onEvent：它同时决定 runMessages 落库和 run:message / runtime:event 发布。唯一并列的旁路是 executor 终态 ExecutionResult.finalText/error（同文件 :720-910、:953-1025），它不经过 onEvent。因此 G8-5a 的安全边界是这两个相邻的 runtime 输出汇合处，而不是全局 event bus。

~~~text
CLI adapter / child stdout、stderr、tool result
                 │
                 ▼
run-worker onEvent（508-573）
  完整消息 / tool：scrub → run_message DB → eventBus → app.ts → WS → 浏览器
  delta / log：    stateful scrub → run:progress / run:stream_chunk → WS
                 │
                 ▼
ExecutionResult finalText / error（720-910；failRun 953-1025）
  scrub → assistant/comment/memory/agentRuns.error/lifecycle

GET /api/runs/:id/messages（routes/runs.ts:147-175）
  只重放已脱敏的 run_message；不在读取时二次扫描
~~~

这保留 API 现有分页 SQL 与 (runId, seq) 路径；新扫描只发生在写入/广播时。

## 本仓边界与数据流依据

| 观察面 | 现在的原始流 | G8-5a 处理点 |
| --- | --- | --- |
| 完整 assistant / tool 消息 | run-worker.ts:544-573 的 body、runMessages.insert、run:message | 构造 body 前 scrub；DB 与 WS 使用同一安全副本。tool args/result 需递归复制后 scrub，不能只清 content。 |
| tool runtime event | :511-522 将 e.args/e.result 放进 normalizeRuntimeEvent；shared/src/schema.ts:342-350 的 RuntimeEvent.metadata 是自由对象 | 传入已深复制、已脱敏 metadata；不改执行器仍在使用的原对象。 |
| live 文本 / stderr log | :524-540 的 message_delta/log 直接发布 run:progress/run:stream_chunk；现有 StreamScrubber 只遮 fence | 每个 channel 的流状态机后才发布。文本与 stderr/log 不共用状态；结束时和既有 fence flush（:687-701）一起 flush。 |
| 终态文本、失败信息 | result.finalText/error 在 :720-910 分流至 comment、chat、memory、subagent 解析；failRun 在 :953-1025 写 agentRuns.error 和 lifecycle | fan-out 前将 finalText/error 规范成安全观察值；在 failRun 内再建 error 本地安全边界。只清理 result 派生的 run_failed activity payload，不改通用 activity logger。 |
| WS transport 与回放 | app.ts:91-105 盲转 event bus；ws-broadcaster.ts:157-163 JSON 序列化；routes/runs.ts:147-175 直接读 DB | 均不改。全局过滤会影响无关 issue/comment/activity，也无法清除已落库原值。 |

spawn-line.ts:163-203 会将 stdout 转 delta、stderr 转 log，故 worker 边界能保护控制台的 runtime 观察流；它不等于对 Node 宿主 logger、子进程原始 stderr 文件或任意直接 console 调用作出安全承诺。

## 与 G8-3 的可共享 / 不可共享边界

G8-3 的语义是 Agent 配置中的密钥不持久化/不回显：secret-safety.ts:1-302 扫描 agent.env_vars/mcp_servers 等结构化配置，仅留下字段路径、key、长度、指纹等安全诊断信息；runtime/mcp-config.ts:9-19、59-98、152-190 按敏感配置 key 隐藏读取值，runtime/agent-inject.ts:26-105 则 fail-close 解析 env ref。

可共享的只有：

- 稳定占位符 [redacted]；绝不记录、返回或以 debug logger 打印匹配到的值。
- 敏感字段名分类可作为 assignment pattern 的辅助，结果必须仍是安全副本。
- 对已经起始且高置信的 token 候选，fail-closed 优先于保留它。

不可直接复用或扩张：

- 不将 scanAgentSecretSafety、清理/指纹逻辑或 G8-3 ops route 用于 transcript；其输入契约是配置 JSON，不是任意文本、工具结果或流。G8-5 不应新建 token 指纹或把值送入 DB。
- 不用 redactMcpConfig 处理 runtime output；它无法覆盖自由文本、嵌套 tool args/result、跨 chunk stream。
- 不在 G8-5a 扫描 chat 用户消息、Issue 描述/评论、quickPrompt 或历史库；这会改变给 agent 的输入与保留策略，属于另一个产品决定。

## Pattern、流式边界与低风险策略

新增独立、纯函数 runtime/secret-scrubber.ts，不与 runtime/stream-scrubber.ts:1-159 合并；后者仅处理 think/context fence，不能充当 secret scrubber。

G8-5a 只处理高置信、可验证的合成样本：

- Authorization: Bearer 长 token，或 Bearer 长 token；
- 常见长 sk- / sk-or- token；
- 精确 AWS access-key-id 形态 AKIA...；
- 明显 api_key=、access_token=、secret=、password= 加不透明实值。

替换必须是完整 [redacted]，不保留首尾、长度、hash/fingerprint。避开一般 PII、短 sk、普通 prose 中的 token，以及 API_KEY=process.env.X / 模板变量等代码示例；这些是高 false-positive 或产品范围外。pattern 应有最小长度与 token 字符集阈值，并测试正常短字符串不变。

跨 chunk 规则：

1. 不能对每个 delta 单独 regex。SecretStreamScrubber 要保留有界的潜在 token 前缀（sk-、AKIA、Bearer、敏感 assignment key）。
2. token 达到高置信阈值后只发一次 [redacted]，随后吞掉其余 token 字符至分隔符；任何一帧不得先泄出前缀或中段。
3. 文本与 log 各用一个状态机，避免 stdout 和 stderr 拼成伪 token。文本顺序为 fenceScrubber.feed → secretStream.feed → publish；结束时先吸收 fence tail，再分别 fail-closed flush 两个 secret stream。
4. flush 时，未达到阈值的普通短前缀可原样放行；已达到或无法判定结束的高置信候选必须替换或丢弃。缓冲区有固定上限，扫描为 O(n)。

必须先 scrub 再 truncate。当前 safeStringifyResult 在 runtime/claude-code.ts:33-38、opencode.ts:17-23、cursor.ts:13-18、pi.ts:79-84 先 slice(0, 4000)：若 secret 恰在截断尾部，会只剩未达到完整 pattern 的前缀。因此严格 G8-5a 要么在这四个 observer serialization helper 中改成 scrub → cap，要么让 worker 对截断尾部的 token 前缀 fail-closed；测试未覆盖此情形时，不应声称完整保护。

## 上游对照

| 结论 | Multica | Hermes | 本仓选择 |
| --- | --- | --- | --- |
| DB 与实时通知使用同一安全记录 | server/internal/handler/daemon.go:3685-3713：Content/Output/Input 先 redact，再 CreateTaskMessage，随后 publishTask | agent/chat_completion_helpers.py:977-1007 在 history/downstream 前清 assistant content | 在 run-worker onEvent 生成一次安全 body，供 insert 与 publish 共用。 |
| 高置信模式、结构安全副本 | server/pkg/redact/redact.go:19-75、77-152、166-180：Text + 深复制 InputMap、深度 fail-safe | agent/redact.py:491-682、803-811：redactor/formatter，但可配置关闭 | 纯函数 text + 深复制 value，固定深度上限，G8 runtime 路径不可关闭。 |
| 顺序 | server/pkg/agent/codex.go:2564-2584：redact before truncate | — | 同样 scrub → truncate，修复本仓四处 4000 字符 cap 风险。 |
| streaming 不可逐 chunk regex | internal/daemon/daemon.go:5928-5960、6038-6052 有来源侧清理，但不足以保证拆分文本 | run_agent.py:4650-4701、agent/memory_manager.py:171-270 展示 stateful/fail-safe flush，但只处理 think/context，不处理 secret | 独立 token 流状态机，逐帧无泄露断言。 |
| 不夸大 logger 安全保证 | internal/daemon/daemon.go:6095-6111、pkg/agent/stderr_tail.go:42-80 仍有原始 daemon log 路径 | agent/agent_runtime_helpers.py:1461-1476 对 request dump 要 force redact；但 canonical SQLite 仍有未 scrub 路径：run_agent.py:1829-1877、hermes_state.py:3437-3495 | 本刀只承诺 app runtime transcript DB/API/WS；宿主日志与旧记录另立范围。 |
| 不修改未来执行所需工具参数 | — | agent/chat_completion_helpers.py:1142-1157 明确不清 tool-call args，以免影响下一次执行 | 只构建 event/持久化的安全观察副本，绝不回写 backend 原值。 |

Multica 的消息 drain 也区分 progress（不持久化）与 transcript message（DB + bus），见 references/deep/multica.md:128-150；这与本仓分流一致。

## 实现范围选项

### A. 仅完整消息/终态的 write-side scrub（最小但不推荐）

在 onEvent 的 complete message/tool 及 finalText/error 上使用无状态 scrubber。DB、API replay、最终 comment/chat 可安全，但 live delta/log 仍可能通过 WS 泄露跨 chunk secret，也未解决 truncate tail。它只能是紧急子刀，不能称为 G8-5 完成。

### B. 推荐：G8-5a 运行时 transcript 观察面闭环

新增纯 scrubber + stream state，覆盖 worker 的 complete event、tool metadata、delta/log、terminal finalText/error；处理四个 safeStringifyResult 的 scrub-before-cap（或等价 tail fail-close）。不改 schema、route replay、eventBus/WS broadcaster、通用 activity logger、chat ingress。这是最小可演示的端到端闭环。

### C. 后续 G8-5b：广义 ingress / retention / logger

再决策 chat/issue/comment 用户输入和 quickPrompt 是否写前处理、旧 DB backfill、backup、直接宿主日志/child process sink、所有 memory 输入。此范围会改变 agent 输入/UX 或触及更大保留策略，不可随 5a 顺手纳入。

## 推荐 G8-5a：Must / Out / 验收

**Must**

- 一个不可配置关闭的纯 text/value/stream secret scrubber；结构值深复制且有 depth/buffer 上限；输出只有 [redacted]。
- 在 run-worker.ts:508-573 写/发前覆盖 message、tool_start、tool_end、delta、log；tool metadata 使用安全观察副本，文本与 log 使用独立流状态。
- 在 run-worker.ts:720-910、953-1025 的终态 fan-out 前 scrub finalText/error，使 runMessages、agentRuns.error、assistant/comment/memory、lifecycle 及该 run 的失败 activity payload 不含原值。
- 保证四个截断 helper 遵循 scrub → cap，或实施并测试完全等价的截断尾前缀 fail-close。
- API replay 不改查询，只验证读到的是已清理 DB 记录；分页/seq 语义不变。

**Out**

- chat/issue/comment 等用户 ingress、quickPrompt、历史记录回填或 backup 重写；
- G8-3 Agent config/环境变量/mcp 逻辑与数据库迁移；
- 通用 eventBus、WsBroadcaster、activity logger 的全局 regex；
- 一般 PII、低置信 token、UI copy 改造，及 Node/CLI 宿主原始日志保证。

**验收测试**

1. secret-scrubber.test.ts：Bearer、sk、AKIA、assignment 的合成值被完整替换；正常短 sk、代码中的 process.env、普通文本不变；嵌套对象不泄露且原输入未变；depth 超限 fail-safe。
2. stream 将一个合成 token 拆在 prefix/body/terminator 三帧，逐帧（含 flush）断言从未出现原始任意片段；文本与 log state 独立；截断尾 case 覆盖。
3. worker fake backend 发 message、tool_start、tool_end、delta、log，并返回 finalText/error；断言 DB run_message / agentRuns.error、eventBus 的 run:message/runtime:event/run:progress/run:stream_chunk/run:failed，以及最终 comment/chat/memory observer 均只见 [redacted]。
4. 经持久化 run 请求 GET /api/runs/:runId/messages?afterSeq&limit，确认 response 无原值、保留 seq/limit 顺序；读端无扫描，分页性能路径无回归。

## 当前 dirty WIP 的精确重叠风险

下列为本报告写入前的 git status --short；均视为他人 WIP，不可覆盖：

| 风险 | 当前 dirty 文件 | G8-5a 建议 |
| --- | --- | --- |
| **最高：核心汇合点** | app/packages/server/src/orchestration/run-worker.ts、run-worker.test.ts 已修改 | 5a 必然触及；先与当前 Owner 对齐最新内容，尽量做小而局部 patch，避免并行覆盖。 |
| **高：truncate 修复会冲突** | runtime/claude-code.ts、cursor.ts、opencode.ts、pi.ts 均已修改 | 若采用严格 scrub-before-cap，四处都需协调；若暂不碰，必须实现并测试 worker 尾前缀 fail-close。 |
| **刻意避开：WS 全局层** | app.ts、orchestration/event-bus.ts、ws-broadcaster.ts 已修改 | 推荐不改这些文件，既降冲突也避免扩大到无关 payload。 |
| **刻意避开：DB/API 契约** | routes/runs.ts 已修改，routes/runs.messages.contract.test.ts 未跟踪；db/schema.ts、db/reshape.ts、shared/schema.ts 已修改 | 无需 migration、schema、route 实现。若添加 route 验收测试，应先协调未跟踪 contract test。 |
| **刻意避开：G8-3 与记忆 WIP** | secret-safety.ts、runtime/agent-config.ts、runtime/mcp-config.ts 未跟踪；memory/manager.ts 已修改 | 不复用/改动 G8-3 模块；在 worker 传入已 scrub 的 finalText，因此无需改 memory manager。 |
| **不需要动的 source adapter** | runtime/spawn-line.ts、grok.ts 已修改 | worker 已覆盖它们产生的 runtime event；除非发现额外 pre-truncate helper，否则不碰。 |

runtime/stream-scrubber.ts、runtime/event-normalizer.ts 与 routes/chat.ts 当时未出现在该状态列表；5a 仍应优先新增独立 scrubber 并在 worker 组合，避免改变现有 fence 语义或扩大到 chat ingress。.scratch/g8-trust-execution/ 是共享的未跟踪工单目录；本次仅新增本报告，未改写 spec 或 upstream notes。
