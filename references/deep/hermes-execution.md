# hermes-agent — 执行层源码深读（Agent Loop + Tool Registry）

> 源码：`references/repos/hermes-agent/` · 栈：Python · 更新：2026-07-08
> 配套：记忆/delegate/扩展系统见 [hermes-memory-delegate.md](hermes-memory-delegate.md)
> 高层摘要：[../runtime.md](../runtime.md)

## 定位与最重要的架构发现

hermes 是全功能 Agent 运行时：同一份 core 跑 CLI / TUI / 20+ 消息平台 / 桌面。

**关键发现：`run_agent.py`（6000 行）是个门面，不是逻辑所在。** `AIAgent` 是个巨型类，方法都是一行转发到 `agent/` 下的模块。真正的循环是 `agent/conversation_loop.py::run_conversation`（5312 行）。这本身是个值得抄的刻意模式 —— 保持公共类表面稳定，把实现推到可测试的、较纯的模块。

---

## 1. 主 Agent 循环

**文件：** `agent/conversation_loop.py`

### 循环头（line 638）

```python
while (api_call_count < agent.max_iterations
       and agent.iteration_budget.remaining > 0) or agent._budget_grace_call:
```

**双终止门**：legacy `max_iterations` 上限（默认 90）+ 独立的线程安全 `IterationBudget` 计数器。`_budget_grace_call` flag 在预算归零后多给模型一次迭代。

### 每次迭代的循环周期

1. **中断检查**（`:643`）—— `_interrupt_requested` 立即 break，exit reason `"interrupted_by_user"`。在循环**顶部**，每次 API call 前、每个 tool 前都查。
2. **消耗预算**（`:659`）—— `iteration_budget.consume()`；返回 False 则 exit `"budget_exhausted"`。
3. **fire `step_callback`**（`:666`）—— 发 `agent:step` 事件给 gateway/TUI，带 `prev_tools`（向后扫描重建）。
4. **drain `/steer`**（`:711`）—— 用户在模型思考时插入的中途 steering 消息，append 到**最后一条 `tool`-role 消息**（绝不用 `user` 消息 —— 会破坏 role 交替）。
5. **build `api_messages`**（`:787`）—— 复制每条消息，把临时上下文（memory recall、plugin hooks）注入**当前 turn 的 user 消息**，复制 reasoning content，剥内部字段。
6. **prepend system prompt**（`:847`）—— 每 session 只 build 一次，原样 replay（见 §3）。
7. **apply cache_control**（`:889`）—— 若 `_use_prompt_caching` 则 `apply_anthropic_cache_control`。
8. **sanitize**（`:900`）—— `_sanitize_api_messages` 剥孤儿 tool result / 加 stub。
9. **LLM call** —— streaming via `interruptible_streaming_api_call`，delta 回调按 chunk fire（见 §4）。
10. **inspect `assistant_message.tool_calls`**（`:4420`）。

### 终止分支（line 4420）

- **有 tool calls** → 校验名（`valid_tool_names`）、`_repair_tool_call` 修拼写、JSON 校验 args。无效 → append error tool-result + `continue`（最多 3 次重试）。有效 → `_execute_tool_calls`（`:4688`）→ `continue`（`:4784`）。
- **无 tool calls**（`:4786` `else`）→ 这是最终响应。`final_response = assistant_message.content`，set `_turn_exit_reason`，`break`。

循环结束返回 dict：`{"final_response", "messages", "api_calls", "completed", "partial"}` —— 每条 exit 路径（中断/预算耗尽/guardrail halt/重试耗尽）都一致。

### Tool 执行分发（`:5631`）

```python
def _execute_tool_calls(self, assistant_message, messages, ...):
    if not _should_parallelize_tool_batch(tool_calls):
        return self._execute_tool_calls_sequential(...)
    return self._execute_tool_calls_concurrent(...)
```

`_should_parallelize_tool_batch`（`agent/tool_dispatch_helpers.py:104`）判定：只读工具永远安全；file 工具仅当目标路径不重叠时并行；`_NEVER_PARALLEL_TOOLS` 黑名单强制串行。

### 迭代预算退款（`:4729`）

```python
if _tc_names == {"execute_code"}:
    agent.iteration_budget.refund()
```

程序化（RPC 风格）tool call 被退款，不吃预算。成本塑形机制 —— 「真」agentic 迭代花预算，子 agent / code-execution fan-out 免费。

---

## 2. Tool 定义、注册与分发

**这是全代码库最干净的模式，TS 重实现的首选候选。**

### Registry（`tools/registry.py`）

单例 `ToolRegistry` 收 `ToolEntry`。`ToolEntry`（`:78`）用 `__slots__`：

```python
__slots__ = ("name", "toolset", "schema", "handler", "check_fn",
             "requires_env", "is_async", "description", "emoji",
             "max_result_size_chars", "dynamic_schema_overrides")
```

**自注册** —— 每个 tool 文件在模块 import 时调 `registry.register(...)`。例子（`tools/file_tools.py:2170`）：

```python
registry.register(
    name="read_file", toolset="file",
    schema=READ_FILE_SCHEMA,          # OpenAI function schema dict
    handler=_handle_read_file,        # callable(args: dict) -> str
    check_fn=_check_file_reqs,        # 可选可用性探针
    emoji="📖", max_result_size_chars=100_000)
```

schema 是裸 dict（`{"name", "description", "parameters": {...}}`），定义在 handler 旁的模块级常量。`get_definitions` 包成 `{"type":"function", "function": schema}`（`:567`）给 API。

### `register()` 安全（`:356`）

- 拒绝跨 toolset shadow 已有 tool，除非 `override=True`。
- 插件 `override=True` 需运维 opt-in（`allow_tool_override`）否则 `PermissionError`。MCP-to-MCP 覆盖豁免。
- 每次变异 bump `_generation` —— 用作缓存失效 key。

### `get_definitions(tool_names, quiet)`（`:521`）

按 `check_fn()` 过滤（TTL 缓存 30s via `_check_fn_cached`），应用 `dynamic_schema_overrides()` callable 处理运行时依赖的 schema 字段（如 `delegate_task` description 反映当前并发上限），返回 OpenAI 格式 list。`model_tools.get_tool_definitions` 包装（`:279`）加 LRU 缓存，键 `(enabled_toolsets, disabled_toolsets, registry._generation, config-mtime, env-flags)`。

### `dispatch(name, args, **kwargs)`（`:574`）

```python
def dispatch(self, name, args, **kwargs) -> str:
    entry = self.get_entry(name)
    if not entry:
        return json.dumps({"error": f"Unknown tool: {name}"})
    try:
        if entry.is_async:
            return _run_async(entry.handler(args, **kwargs))
        return entry.handler(args, **kwargs)
    except Exception as e:
        return json.dumps({"error": sanitized})
```

**核心不变式：dispatch 永不抛异常** —— 每个失败返回 `{"error": ...}` JSON 字符串，作为 tool result 喂回模型。模型可从中自纠正。

### Toolset 分组（`toolsets.py`）

`TOOLSETS` 是命名组的 dict，每组有 `tools` + `includes`（引用其他 toolset —— 组合）。`resolve_toolset()` 展平 includes 图。`_HERMES_CORE_TOOLS`（`:31`）是所有平台编辑一次的规范共享 tool list。`_HERMES_WEBHOOK_SAFE_TOOLS`（`:85`）是给不可信输入的故意收紧子集 —— 安全姿态机制。

### check_fn 瞬态失败抑制（`:145`）

`_check_fn_cached` 有宽限窗：探针（Docker daemon、playwright binary）在最近一次成功后 60s 内失败，serve 上次的 `True` 且不缓存失败 —— 防止 flaky 外部状态在 session 中途静默剥工具。这是微妙的生产硬化细节。

### Middleware 缝

`handle_function_call`（`model_tools.py:1019`）不直接调 `registry.dispatch` —— 包在 `run_tool_execution_middleware`（`:1275`）里，跑 `pre_tool_call` / `post_tool_call` / `transform_tool_result` hooks。`execute_code` tool 拿特殊 dispatch closure 注入 `enabled_tools`（沙箱 scope）。插件可 block 工具（`resolve_pre_tool_block`）或改写结果。

---

## 3. 「Prompt cache 不可破坏」规则

**实现为显式的、文档化的不变式。两个文件。**

### `agent/prompt_caching.py` —— `system_and_3` 策略

纯函数，无类状态。`apply_anthropic_cache_control`（`:84`）放**恰好 4 个 `cache_control` 断点**（Anthropic 上限）：system prompt 一个 + 最后 3 条「能带 marker」的非系统消息。`_build_marker(ttl)` 产 `{"type":"ephemeral"}`（5m）或带 `"ttl":"1h"`。`_can_carry_marker`（`:52`）跳过空内容消息（纯 tool_calls 的 assistant turn、空 tool result）—— 在 OpenRouter/envelope 布局下会浪费断点。

### 循环里的不变式 —— `conversation_loop.py:832-851`

```python
# Hermes invariant: the system prompt is built ONCE per session
# (cached on _cached_system_prompt) and replayed verbatim on every turn.
# ... Plugin context from pre_llm_call hooks is injected into the user
# message (see injection block above), NOT the system prompt. This is
# intentional — system prompt modifications break the prompt cache prefix.
```

保 cache 的模式：
1. **System prompt 构建一次，原样 replay。** `_invalidate_system_prompt`（`run_agent.py:3809`）是唯一清 `_cached_system_prompt` 的东西。
2. **所有临时/turn 特定内容（memory recall、plugin 上下文、MoA 聚合）注入「当前 turn 的 user 消息」，绝不进 system prompt**（`:796-808`、`:853-874`）。原始 `messages` list 永不变 —— 只变每次 API call 的 `api_msg` 副本。
3. **Append-only 消息历史** —— 新 turn 加到尾部；缓存 prefix 里不重排、不编辑。
4. **`cache_control` 断点放最后 3 条消息** —— 每个 turn 扩展缓存 prefix 而非失效它。

**这是 TS 重实现最高价值的模式。** 「临时上下文进 user 消息，绝不进 system prompt」这条规则是长对话保 prefix cache 的关键。

---

## 4. Streaming / 事件给 UI 进度

三个独立 callback 通道，都可选、per-turn 设置：

| Callback | 方法 | 触发于 | 位置 |
|---|---|---|---|
| `stream_delta_callback` | `_fire_stream_delta` | 每个文本 chunk | `run_agent.py:4650` |
| `reasoning_callback` | `_fire_reasoning_delta` | 每个 reasoning_content chunk | `run_agent.py:4703` |
| `tool_gen_callback` | `_fire_tool_gen_started` | tool-call 名首 token（每 tool 一次） | `run_agent.py:4712` |
| `step_callback` | 循环内联 | 每次 iteration 顶部，带 prev tool result | `conversation_loop.py:666` |

### streaming 消费循环（`agent/chat_completion_helpers.py:2189`）

```python
for chunk in stream:
    agent._touch_activity("receiving stream response")
    if agent._interrupt_requested: break
    delta = chunk.choices[0].delta
    reasoning_text = getattr(delta, "reasoning_content", None) or ...
    if reasoning_text:
        reasoning_parts.append(reasoning_text)
        agent._fire_reasoning_delta(reasoning_text)
    if delta and delta.content:
        content_parts.append(delta.content)
        if not tool_calls_acc:
            agent._fire_stream_delta(delta.content)   # 文本 → UI
    if delta and delta.tool_calls:
        # 按 index 累积 tool_call delta
        # 首个名字片段 fire _fire_tool_gen_started(name)
```

值得注意的细节：
- **有 tool_calls 时抑制文本流**（`:2236` `if not tool_calls_acc`）—— 避免 tool call 旁显示啰嗦的「我要用工具…」前导。
- **`on_first_delta`** —— 任何类型首 token 到达时 fire 一次，停「等待」spinner。
- **有状态 scrubber**（`_stream_think_scrubber`、`_stream_context_scrubber`）在 `_fire_stream_delta`（`:4671`）剥跨 chunk 边界的 `<think>` 块和 memory-context span。明确提到早期 per-delta regex 方法在 tag 跨 delta 时坏状态机（`:4663` 注释）—— TS 的真实坑。
- **Tool 边界段落断**（`:4724`）：tool iteration 后 `_stream_needs_break=True`，下个真实文本 delta 前加 `\n\n` —— 防 tool 边界间文本粘连但不堆空行。
- **`None` 作 EOS 哨兵**（`:4684`）：`stream_delta_callback(None)` flush 显示框，但 TTS callback 绝不能收 `None`（它用 None 作 EOS）—— 同通道两 callback 语义不同，靠只调 display 解决。
- **部分流恢复**（`conversation_loop.py:4799`）：连接死但内容已流，已流文本经 `_record_streamed_assistant_text` 捕获并复用为最终响应，而非重试。

---

## TS 重实现模式（按价值排序）

### Tier 1 —— 高价值

1. **Registry + 自注册 + dispatch-never-raises**：`ToolEntry {name, toolset, schema, handler, check_fn}` + `register()` + `dispatch() → string`。dispatch catch 所有异常返回 `{"error":...}` JSON 让模型自纠正。TS 里干净映射到 `ToolRegistry` class + `Map<string, ToolEntry>`。文件 `tools/registry.py`。

2. **保 cache 的消息布局**：system prompt 构建一次原样 replay；所有临时内容注入当前 user 消息副本。`apply_anthropic_cache_control` 放恰好 4 个断点。文件 `agent/prompt_caching.py` + `conversation_loop.py:832-851`。

3. **干净的循环终止契约**：每条 exit 路径返回同 dict 形 `{final_response, messages, api_calls, completed, partial}` + 诊断 `_turn_exit_reason` 字符串。双门（max_iterations + IterationBudget）+ 程序化调用退款。文件 `conversation_loop.py`、`agent/iteration_budget.py`。

### Tier 2 —— 需要生产硬化时值得做

4. **并行 vs 串行 tool 批次判定**（按 tool 类型 + 路径重叠 `_should_parallelize_tool_batch`）。文件 `agent/tool_dispatch_helpers.py:104`。

5. **`check_fn` 可用性探针 + TTL 缓存 + 瞬态失败宽限窗**。防 flaky 外部状态剥工具。文件 `tools/registry.py:145`。

6. **Tool-result 不可信内容包裹**（`make_tool_result_message` → `<untrusted_tool_result>` 分隔符给 web/MCP/browser 工具）。架构级 prompt-injection 防御。文件 `agent/tool_dispatch_helpers.py:361`。

7. **三通道 streaming callback**（text delta / reasoning delta / tool-gen-started）+ 有状态跨 chunk scrubber + None 作 EOS 哨兵。文件 `run_agent.py:4650`、`agent/chat_completion_helpers.py:2189`。

### Tier 3 —— 跳过或简化

8. `_ra()` 懒 import 间接（让测试 monkeypatch `run_agent.OpenAI` 等）—— Python 特有。
9. credential-pool / failover / provider-adapter 机器（巨大：`credential_pool.py` 112KB、`anthropic_adapter.py` 123KB、`chat_completion_helpers.py` 158KB）—— provider 多路复用；只在目标很多 provider 时相关。
10. async 桥接 `_run_async` + 持久 per-thread event loop —— Python 的 sync/async 阻抗失配；TS async-native 不需要。

## 告诫

文件**巨大**且重防御（每个方法处理 5+ provider 怪癖）。上面的核心模式干净，但埋在数千行边界 case 处理里。TS 移植时提取**形状**（`registry.py` 的 ~20 行方法、`prompt_caching.py` 的 ~120 行、`conversation_loop.py` 的循环骨架），留下 provider-specific 的臃肿。
