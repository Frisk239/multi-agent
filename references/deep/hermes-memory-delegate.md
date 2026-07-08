# hermes-agent — 记忆 / Delegate / 扩展系统源码深读

> 源码：`references/repos/hermes-agent/` · 栈：Python · 更新：2026-07-08
> 配套：Agent loop + Tool Registry 见 [hermes-execution.md](hermes-execution.md)
> 高层摘要：[../memory-and-skills.md](../memory-and-skills.md)

---

## 1. MemoryProvider 系统

### 架构：ABC + Orchestrator（「一个外部 provider」模式）

系统显式遵循 Footprint Ladder 的「ABC + orchestrator」建议（`AGENTS.md:208-211`）：一个 ABC、一个 manager/orchestrator、一个插件发现层。

### The ABC —— `agent/memory_provider.py:43-316`

`MemoryProvider(ABC)` 定义契约。接口分**核心生命周期**（多为 `@abstractmethod`）和**可选 hooks**（no-op 默认）：

**核心（abstract）：**
- `name`（property）—— 短标识如 `"mem0"`（`:46-49`）
- `is_available()` —— config/deps 检查，无网络（`:53-59`）
- `initialize(session_id, **kwargs)` —— 连接、建资源（`:61-83`）。`kwargs` 带 scoping 上下文：`hermes_home`、`platform`、`agent_context`（`"primary"|"subagent"|"cron"|"flush"`）、`agent_identity`、`parent_session_id`、`user_id`、`user_id_alt`
- `get_tool_schemas() -> List[dict]` —— OpenAI function-tool schema（`:134-142`）

**核心（带默认实现）：**
- `system_prompt_block()` —— 注入 system prompt 的静态文本（`:85-92`）
- `prefetch(query, *, session_id="")` —— 为**即将到来/当前** turn 召回上下文（`:94-106`）。应快；用后台线程
- `queue_prefetch(query, *, session_id="")` —— 为**下一个** turn 后台召回（`:108-114`）
- `sync_turn(user, asst, *, session_id, messages)` —— 持久化一个完成的 turn（`:116-132`）。必须非阻塞
- `handle_tool_call(tool_name, args, **kwargs)` —— 分发 tool call（`:144-150`）
- `shutdown()`（`:152-153`）

**可选 hooks：**
- `on_turn_start(turn_number, message, **kwargs)`（`:157-164`）
- `on_session_end(messages)` —— 仅真实边界（`:166-174`）
- `on_session_switch(new_session_id, *, parent_session_id, reset, rewound, **kwargs)` —— `/resume`、`/branch`、`/reset`、`/new`、context compression 时 fire（`:176-218`）
- `on_pre_compress(messages) -> str` —— context compression 丢消息前抽取（`:220-230`）
- `on_delegation(task, result, *, child_session_id)` —— **父侧**观察子 agent 工作（`:232-243`）
- `get_config_schema()` / `save_config()` —— `hermes memory setup` 向导用（`:245-278`）
- `on_memory_write(action, target, content, metadata)` —— 镜像内置 memory 写（`:280-297`）
- `backup_paths() -> list[str]` —— `hermes backup` 用（`:299-315`）

### Orchestrator —— `MemoryManager`

`agent/memory_manager.py:353-1087`。关键设计决策：

1. **一个外部 provider 上限**（`:374-440`）。Builtin 总被接受；最多一个非 builtin provider。第二个被拒并 warning。防「tool schema 膨胀和冲突的 memory 后端」。

2. **「Builtin」不是 MemoryProvider。** 内置 memory 是 `memory` tool + `agent._memory_store`（MEMORY.md 文件存储），在 `agent_runtime_helpers.py:2211-2236` 单独接线。MemoryManager 只持有外部插件。

3. **核心 tool 名保护**（`:400-434`）。Memory provider 不能注册 shadow 保留核心 tool（`clarify`、`delegate_task` 等，来自 `toolsets._HERMES_CORE_TOOLS`）的 tool。

4. **后台单 worker 执行器**（`:618-666`）。`sync_all` 和 `queue_prefetch_all` 分派到惰性创建的 `DaemonThreadPoolExecutor(max_workers=1)`。理由（`:566-582`）：曾有个配错的 provider 内联阻塞了 ~298s，agent 标记「running」好几分钟。单 worker 串行化保证 turn N 先于 turn N+1 落地。执行器不可用时回退内联。

5. **上下文围栏**（`:152-350`）。预取上下文包在 `<memory-context>` 围栏里 + system note，让模型当它参考数据而非新输入。`StreamingContextScrubber`（`:171-333`）是有状态状态机，跨流 chunk 边界剥这些围栏（一次性 regex 在 split delta 上失败）。

6. **Skill 脚手架剥离**（`:477-493`）。扇出到 provider 前，`_strip_skill_scaffolding()` 只抽 `/skill` 展开里用户的指令，防 prompt 脚手架污染 embedding。

### Provider 如何插入（发现）—— `plugins/memory/__init__.py`

- 扫两个目录：bundled `plugins/memory/<name>/` 和用户 `$HERMES_HOME/plugins/<name>/`。bundled 碰撞优先（`:90-121`）。
- `_load_provider_from_dir()`（`:208-316`）支持两种模式：`register(ctx)` 函数（plugin 风格，配 fake `_ProviderCollector` ctx），或内省发现的 `MemoryProvider` 子类。
- **只有一个 provider 活跃**，通过 `memory.provider` in config.yaml 选（`:339-351`）。

### 具体实现：mem0 —— `plugins/memory/mem0/__init__.py`

`Mem0MemoryProvider(MemoryProvider)` at `:193-622`。值得移植的模式：

- **Tool schema 作模块常量**（`:116-186`）：`SEARCH_SCHEMA`、`ADD_SCHEMA` 等 —— 裸 function schema `{"name", "description", "parameters"}`。
- **两阶段预取**（`:425-476`）：`on_turn_start` 调 `_start_prefetch()` spawn daemon thread；`prefetch()` 消费缓存结果，短热路径等待（`_PREFETCH_WAIT_SECS=3`）。慢后端 → 跳注入，回退到 `mem0_search` tool。
- **非阻塞 sync**（`:478-511`）：`sync_turn` spawn `mem0-sync` thread，先 join 上一次 sync（5s timeout）防重复 ingest。
- **断路器**（`:293-334`）：连续 5 次失败（`_BREAKER_THRESHOLD`）后暂停 120s（`_BREAKER_COOLDOWN_SECS`）。client error（404、校验）不触发。
- **Scope 模型**（`:371-382`）：读 scope 到 `user_id`（跨 agent 召回）；写 tag `agent_id` + `channel` 元数据。user_id 解析顺序（`:341-355`）：运维配置 → gateway 原生 id → 硬编码 fallback。
- **懒 SDK 安装**（`:266-291`）：`_create_backend()` import 前调 `tools.lazy_deps.ensure("memory.mem0")`。
- **register() 入口**（`:625-627`）：`ctx.register_memory_provider(Mem0MemoryProvider())`。

其他 provider 同形：`plugins/memory/{honcho,hindsight,holographic,byterover,openviking,retaindb,supermemory}/__init__.py`。

### Memory 写/读时序

**读（turn 前/中）** —— `agent/turn_context.py:536-551`：
```
on_turn_start(turn_count, user_msg)       # :540 — prefetch 前
ext_prefetch_cache = prefetch_all(query)  # :549
```
缓存在 API call 时注入 turn 的 user 消息（`conversation_loop.py:796-807`）via `build_memory_context_block()`，不改持久化消息。

**写（turn 后）** —— `run_agent.py:3325-3384` `_sync_external_memory_for_turn()`：
- `run_conversation` 末尾调。中断的 turn 完全跳过（`:3359-3360`）。
- 调 `sync_all(user_text, response_text, session_id, messages)` 然后 `queue_prefetch_all(user_text)` 暖下一 turn。

**内置 memory tool 镜像** —— `agent_runtime_helpers.py:2211-2236`：内置 `memory` tool 跑完后 `notify_memory_tool_write()` 扇出写到外部 provider via `on_memory_write()`。gate 在 manager（`memory_manager.py:933-988`）：只 committed（非 staged、成功）写，只 mutating action（add/replace/remove）。

**会话边界** —— `on_session_switch` 由 context compression（`conversation_compression.py:906`）和 CLI 命令（`cli_commands_mixin.py:806, 988`）fire；`on_session_end` + `shutdown_all` 由 `run_agent.py:3273-3298`（`shutdown_memory_provider`）fire。

### Scope 概念

没有单一「scope」枚举。Scoping 是多维的，穿 `initialize()` kwargs（`agent_init.py:1366-1410`）：

| 维度 | 字段 |
|---|---|
| **user** | `user_id` / `user_id_alt` / `user_name`（gateway 身份） |
| **session** | `session_id`、`session_title`、`gateway_session_key` |
| **agent** | `agent_identity`（profile 名）、`agent_workspace`、`agent_context`（"primary"/"subagent"/"cron"/"flush"） |
| **chat** | `chat_id`、`chat_name`、`chat_type`、`thread_id` |
| **run** | `parent_session_id`（子 agent 用） |

Provider 各取所需（mem0 只读 user_id；honcho 从 session_title 派生 chat-scoped session key）。

---

## 2. delegate_task / 子 Agent 系统

全在 `tools/delegate_tool.py`（~3450 行）。

### 工具函数 —— `delegate_task()` at `:2342-2888`

签名（`:2342-2350`）：`goal`、`context`、`tasks`（批量数组）、`max_iterations`、`role`、`background`、`parent_agent`。

两种模式：**单任务**（`goal` + 可选 `context`）或**批量**（`tasks: [{goal, context, role}]`）。返回 JSON 带 `results` 数组。

**子 agent 屏蔽的 tool**（`:45-54`）—— 子 agent 永远没有：`delegate_task`（无递归）、`clarify`、`memory`、`send_message`、`execute_code`、`cronjob`。

### 父子关系 —— `_build_child_agent()` at `:1044-1342`

每个子是完整 `AIAgent` 实例（`run_agent.py:1301-1332`）。关键属性：

- `child._delegate_depth = parent_depth + 1`（`:1338`）—— 深度追踪的递归控制
- `child._delegate_role = effective_role`（`:1341`）—— `"leaf"` 或 `"orchestrator"`
- `subagent_id = f"sa-{task_index}-{uuid8}"`（`:1094`），`parent_subagent_id` 穿给嵌套树
- `skip_memory=True`（`:1320`）—— **子 agent 无 memory provider session**；这就是为什么 `on_delegation` 在父侧 fire
- `skip_context_files=True`、`quiet_mode=True`、`ephemeral_system_prompt=child_prompt`（全新对话，无父历史）
- `parent_session_id=parent.session_id`（`:1324`）
- `platform="subagent"`（`:1318`）
- `enabled_toolsets` 从父派生（子继承父的 toolset；模型不能收窄）+ `_strip_blocked_tools()`

**角色解析**（`_normalize_role` `:337-351` + `:1078-1087`）：`"leaf"`（默认）不能继续 delegate；`"orchestrator"` 保留 `delegation` toolset（`:1141-1142` 重加）可 spawn 自己的 worker，受 `delegation.max_spawn_depth`（默认 2，`:2388-2402`）限。两层降级：未知字符串 → leaf + warning；深度/kill-switch 限 → leaf。

**深度限制**（`:2388-2402`）：`depth >= max_spawn_depth` 时硬 error JSON。

**凭证隔离**（`:1196-1300`，`_resolve_delegation_credentials`）：子 agent 可路由到不同 `delegation.provider:model` 对。子用不同 provider 时 `api_mode` **不**继承（重新派生）—— 修 MiniMax/DeepSeek 上的 404。

### 并行 vs 后台委派

**并行（同步批量）** —— `_execute_and_aggregate()` at `:2514-2757`：
- 单任务 → 直接跑（无 pool 开销）（`:2524-2528`）
- 批量 → `DaemonThreadPoolExecutor(max_workers=max_children)`（`:2537-2538`），默认 3 并发
- 用 `_cf_wait(timeout=0.5, FIRST_COMPLETED)`（`:2600-2602`）轮询而非 `as_completed()`，让父能在中断时 bail（`:2561-2596`）。父阻塞到全部完成。
- 结果按 task_index 排序（`:2650`）

**后台（异步）委派** —— `:2766-2885`：
- `background=true` 把**整个批量**当一个 async 单元 via `dispatch_async_delegation_batch()`（`:2830-2842`）分派到 daemon 执行器。
- 整个 `_execute_and_aggregate()` 后台跑；子 agent 互等；**一个**合并结果在全部完成后作为单条消息重入对话。
- 子 agent 从父的中断列表 detach（`:2804-2814`）；注册单独的 `_batch_interrupt()`。
- **无状态 HTTP fallback**（`:2778-2796`）：API server / WebUI 在 turn 后无法投递 detached 结果，回退同步内联。
- **Pool 满回退**（`:2868-2885`）：内联跑 + note。

注：单任务 `background` 参数正被废弃（schema `:3383-3392`）—— 单任务委派现在自动后台跑。

### 子 agent 结果如何回流

`_run_single_child()` at `:1719-2272` 跑预构建的子 agent，返回结构化 dict。

结果抽取（`:2035-2057`）：
```
summary = result.get("final_response") or ""
status = "interrupted" | "completed" | "failed"   # "(empty)" 哨兵 → failed
```

每个结果条目（`:2012-2022, :2128`）带：`task_index`、`status`、`summary`、`error`、`exit_reason`、`api_calls`、`duration_seconds`、`_child_role`、`_child_cost_usd`、`tool_trace`。

`_execute_and_aggregate()` 聚合：
1. **摘要预算**（`:2656`）：`_apply_summary_budget(results, parent_agent)`（`:1664`）按父剩余上下文 headroom 限每个子摘要；全文溢到磁盘不丢。
2. **Memory 通知**（`:2658-2681`）：每个结果 `parent_agent._memory_manager.on_delegation(task=goal, result=summary, child_session_id=...)` —— 父侧观察 hook。（子 agent 跳自己的 memory，这是委派唯一的 memory 信号。）
3. **`subagent_stop` hooks**（`:2683-2728`）：每个子在父线程 fire 一次（串行，插件作者不处理并发），带 `parent_session_id`、`child_session_id`、`child_role`、`child_summary`、`child_status`、`duration_ms`。
4. **成本汇总**（`:2730-2750`）：子成本折入 `parent_agent.session_estimated_cost_usd`；嵌套 orchestrator→worker 树自然汇总。

最终 tool 结果 `json.dumps({"results": [...], "total_duration_seconds": ...})`（`:2754-2757, :2888`）。父上下文只看到委派调用 + 摘要结果 —— 永不看子的中间 tool call。

**心跳/陈旧检测**（`:1755-1807`）：后台线程把子活动传到 `parent_agent._touch_activity`，防 gateway 不活动超时；计陈旧周期（in-tool vs idle 阈值分开）。

**每 turn 调用上限**（`run_agent.py:3767-3773`）：计每 turn `delegate_task` 调用数防失控 fan-out。

---

## 3. plugins/ 和 skills/ —— 扩展系统

### Footprint Ladder（`AGENTS.md:182-211`）

「新能力放哪」的规范决策框架。每阶加更多永久表面；选**正确解决问题的最高（最小足迹）阶**：

| 阶 | 机制 | 模型工具足迹 | 代码表面 |
|---|---|---|---|
| 1. 扩展现有代码 | 已有东西的变体 | 零 | 零新表面 |
| 2. CLI + skill | `hermes <cmd>` agent 按 SKILL.md 跑 | 零 | Shell + markdown |
| 3. Service-gated tool (`check_fn`) | 需结构化参数/返回 + 仅前置配置时出现 | 条件 | Python tool + registry |
| 4. 插件 | `register(ctx)` + hooks/tools 在 `~/.hermes/plugins/` | 经 `register_tool` | Python 运行时发现 |
| 5. MCP server（catalog 里） | 外部进程，catalog 条目，内置 MCP client | 零永久核心 schema | 任意语言，进程外 |
| 6. 新核心 tool | `toolsets.py` `_HERMES_CORE_TOOLS` 硬编码 | 永久 | `tools/` 里的 Python |

收尾规则（`AGENTS.md:208-211`）：「当 3+ 个 open PR 试图集成**同类别**东西（memory 后端、provider、notifier）时，别一个个 merge —— 设计 ABC + orchestrator，把已有内置包成第一个 provider，把竞争 PR 变插件。」**这正是 MemoryProvider 诞生的方式**（mem0 PR #2933 被改成 ABC，见 `plugins/memory/mem0/__init__.py:6`）。

### 插件系统 —— `hermes_cli/plugins.py`

四个发现源（`:5-17`）：
1. Bundled：`<repo>/plugins/<name>/`（排除 `memory/` 和 `context_engine/` 子目录 —— 它们有自己路径）
2. 用户：`~/.hermes/plugins/<name>/`
3. 项目：`./.hermes/plugins/<name>/`（opt-in via `HERMES_ENABLE_PROJECT_PLUGINS`）
4. Pip：暴露 `hermes_agent.plugins` entry-point group 的包

后源覆盖前源同名碰撞。每个目录插件需 `plugin.yaml` manifest + `__init__.py` 带 `register(ctx)`。

**`PluginContext`**（`:337`）暴露：
- `register_tool()`（`:389`）—— 委托 `tools.registry.register()`，插件工具和内置并排
- `register_hook(hook_name, callback)`（`:1156`）
- `register_cli_command()`（`:502`）

**`VALID_HOOKS`**（`:135-190`）：`pre_tool_call`、`post_tool_call`、`transform_terminal_output`、`transform_tool_result`、`transform_llm_output`、`pre_llm_call`、`post_llm_call`、`pre_verify`、`pre_api_request`、`post_api_request`、`api_request_error`、`on_session_start`、`on_session_end`、`on_session_finalize`、`on_session_reset`、`subagent_start`、`subagent_stop`、`pre_gateway_dispatch`、`pre_approval_request`、`post_approval_response`，外加 kanban 任务生命周期 hooks。agent core 在每点调 `invoke_hook(name, **kwargs)`。

**Tool override 保护**（`:73-76`）：除非运维 opt-in `plugins.entries.<plugin_id>.allow_tool_override` 否则 `PluginToolOverrideError`。

**具体插件例** —— `plugins/disk-cleanup/`：`plugin.yaml` 声明 `hooks: [post_tool_call, on_session_end]`；`__init__.py:309-317` `register(ctx)` 调 `ctx.register_hook(...)` + `ctx.register_command("disk-cleanup", ...)`。这是阶 4 能力，取代了之前的 skill+script 设计（docstring 明说「Replaces PR #12212's skill-plus-script design: the agent no longer needs to remember to run commands」）。

其他插件类别（`plugins/` 下）：`memory/`（MemoryProvider 插件）、`context_engine/`、`model-providers/`（推理后端：openrouter、anthropic、gmi）、`kanban/`、`image_gen/`、`browser/`、`cron_providers/`、`dashboard_auth/`、`google_meet/`、`observability/` 等。

### Skills 系统 —— markdown 驱动，零足迹

Skills 是**阶 2**。它们是带 YAML frontmatter 的 markdown 文档（`SKILL.md`），**不是代码**。结构（如 `skills/github/github-pr-workflow/SKILL.md:1-12`）：

```yaml
---
name: github-pr-workflow
description: "GitHub PR lifecycle: branch, commit, open, CI, merge."
version: 1.1.0
metadata:
  hermes:
    tags: [GitHub, Pull-Requests, ...]
    related_skills: [github-auth, github-code-review]
---
```

Skills 含 `bash`/指令让 agent 遵循；可含 `references/` 和 `templates/` 子目录。

**作为 slash 命令加载** —— `agent/skill_commands.py:320-429`：
- `scan_skill_commands()` 扫 `~/.hermes/skills/` + `skills.external_dirs`，迭代 `SKILL.md` 索引文件（`:342`）
- `/skill` 调用展开成**user 消息**（非 system prompt）嵌入 skill 正文 —— 保 prompt caching（`AGENTS.md:381`）
- 这就是为什么 MemoryManager 有 `_strip_skill_scaffolding()` —— 从展开消息恢复用户的真实指令

Skills 按类别目录组织（`skills/github/`、`skills/creative/`、`skills/data-science/` 等）。`optional-skills/` 放更重/更小众的 skill。

---

## TS 移植笔记

承重的、值得移植的模式：

1. **ABC + orchestrator + 单活跃 provider 约束**（`memory_provider.py` + `memory_manager.py`）。TS 里把 provider 建成 `interface`/abstract class；manager 强制「builtin 总在 + 至多一个外部」。生命周期 hook 集合（`initialize`、`prefetch`、`queue_prefetch`、`sync_turn`、`on_turn_start`、`on_session_switch`、`on_pre_compress`、`on_delegation`、`on_memory_write`）是考虑良好的表面 —— 整套照搬。

2. **后台单 worker 串行化**（`memory_manager.py:618-666`）。TS 里用单并发 async queue（如 promise chain 或 `p-queue` concurrency 1）达同样「turn N 先于 turn N+1」顺序。关停时 bounded timeout drain 值得留。

3. **上下文围栏 + 流 scrubber**（`memory_manager.py:152-333`）。`StreamingContextScrubber` 状态机处理跨流 delta 的 split `<memory-context>` tag —— 非平凡，流到 UI 时值得移植。

4. **插件发现**（`plugins/memory/__init__.py` + `hermes_cli/plugins.py`）：目录扫 + manifest + `register(ctx)` 入口。TS 里用动态 `import()` 发现模块 + 带 `registerTool`/`registerHook` 的 context 对象。四源优先级是好稳健性模式。

5. **子 agent 隔离**（`delegate_tool.py`）：全新上下文、`skip_memory`、深度+角色追踪、屏蔽 tool 集、单 worker per batch 可中断轮询（非 `as_completed`）、摘要预算、父侧 `on_delegation` + `subagent_stop` hooks、成本汇总。daemon-thread approval callback 问题（`:60-112`）是 Python 线程特有；TS 用 async 审批队列。

6. **Footprint Ladder 作决策框架** —— 移植**哲学**，非代码。「3+ PR 同类别就 ABC + orchestrator」规则是关键元模式。
