# memory-system-redesign-design-1

> 对照 Hermes MemoryProvider + 本仓现状，设计「何时写 / 写什么 / 何时读」。
> **本刀先落设计**；实现另开 Slice（issue 轨迹 UI 已先收口）。

## 本仓现状（真源：代码）

| 方向 | 时机 | 写什么 | 代码 |
|---|---|---|---|
| **读 prefetch** | issue run 启动 buildPrompt | title+desc 检索 top5 → `# Memory Context` + `[id=…]` | `manager.prefetchForIssue` · `runtime/prompt.ts` |
| **写 ambient 评论** | member 普通 comment（非 status_change） | `[ambient:comment] Issue ID: title\nbody` | `routes/comments.ts` |
| **写 ambient done** | Issue → done | `[ambient:issue_done] …` + desc 截断 | `routes/issues.ts` |
| **写 run 完成** | run completed + 有 issue | user=issue 摘要；assistant=finalText | `run-worker` → `syncRunCompleted` |
| **写 curated** | 人在 /memory POST | 原文 | `addCurated` |
| **不写** | status_change only；failed/cancelled run；quick_create 无 issue | — | 有意 |

**缺口（相对 Hermes）：**

1. **无 turn 级 sync_turn 语义分层**——整段 assistant 原文入库，噪声大（尤其 CLI 轨迹）。
2. **无 agent 主动 memory tool**——只能环境侧 ambient / 人手 curated。
3. **无 session 边界 hook**（session_end / compress / delegation）。
4. **Wiki vs Memory 边界糊**：done 同时 enqueue wiki **且** ambient；人不知道「经验碎片」vs「编译页」。
5. **失败 run 零学习**——orphan/cwd 失败不沉淀，排障经验丢。
6. **UI 叙事弱**：Memory 页偏运维列表，缺「写入来源 / 生命周期」说明。

## Hermes 可搬原则（深读摘要）

见 `references/deep/hermes-memory-delegate.md`：

1. **ABC + Manager + ≤1 外部 provider**（本仓已近似：sqlite-text | pgvector）。
2. **写路径分层：**
   - **Builtin MEMORY.md / memory tool**（agent 显式写）
   - **External provider `sync_turn`**（turn 后非阻塞）
   - **`on_memory_write` 镜像**（tool 提交后扇出）
3. **读路径：** turn 前 `prefetch` + 围栏 `<memory-context>`；可选 queue_prefetch 下一 turn。
4. **质量门：** 单 worker 串行 sync；strip scaffolding；失败断路器。
5. **子 agent `skip_memory`**，仅父侧 `on_delegation` 观察。

本仓差异：**不自造 agent loop** → 不能 1:1 挂 turn hooks 进 Claude/opencode 内部；写点必须钉在 **编排边界**（comment / status / run terminal / 人手）。

## 目标产品语义（本仓）

| 层 | 是什么 | 不是什么 |
|---|---|---|
| **Wiki** | 编译式项目知识（done → ingest 页） | 会话碎语 |
| **Memory curated** | 人认定的长期经验 / 约定 | 自动流水账 |
| **Memory ambient** | 编排事件产生的可检索碎片 | 完整 run 日志（那是 Runs/轨迹） |

## 写入策略（推荐 · v1 升级）

### A. 继续写（保留）

| 触发 | 内容模板 | 质量门 |
|---|---|---|
| 人手 curated | 原文 | 非空；长度 cap 4k |
| member 评论 ambient | `kind=comment` + issue id + 截断 body | 仅 `type=comment` + `authorType=member`；去 status_change |
| Issue → done ambient | `kind=issue_done` + title + 短 desc | 与 wiki job **并列但文案不同**：ambient 一句结论，不塞全文 |
| run **completed** | **摘要化** assistant（见 B） | 必须有 issueId |

### B. 改写内容（核心升级）

**`syncRunCompleted` 不再整段 finalText。** 改为结构化短条：

```
[ambient:run_ok] Issue FRI-xx · <title>
Agent: <name> · runtime=<id>
Outcome: <first 400 chars of assistant OR 规则抽取的「结论」段>
```

可选后续：若 finalText > N，只取最后非工具噪声段 / 或标 `needs_summary`。

### C. 新增写（小步）

| 触发 | 写什么 | 为何 |
|---|---|---|
| run **failed** 且 classifiable | `[ambient:run_fail] code=cwd_missing|cli_missing|orphan …` + 短 hint | 排障可检索；**默认关**或仅 cwd/cli 两类，防失败刷屏 |
| leader 委派闭环（mention 后 member 完成） | 可选 `delegation` 一行 | 学 Hermes on_delegation；Squad 有价值时再开 |
| Agent 工具（远期） | 显式 `memory_add` skill/tool | Footprint Ladder：先 Skill 文档约定，再 gated tool |

### D. 明确不写

- 纯 status 流转（todo→in_progress）无评论
- cancelled run
- chat/quick_create 无 issue（除非将来 session 记忆）
- 每次 heartbeat / tool_start 事件（轨迹层负责）

## 读取策略

| 时机 | 行为 |
|---|---|
| issue run prompt | 保持 prefetch top-k；查询 = title+desc（可加 labels/project） |
| chat run（可选下一刀） | thread 最近 user 句 prefetch |
| Memory UI | 列表 + 详情抽屉已有；展示 **source 标签**（curated/comment/issue_done/run_ok/run_fail） |
| Wiki 问答 | **不**自动混 memory（边界清晰）；需要时人在 Memory 页运维 |

## 实现切片建议（勿一刀做完）

1. **M1 内容质量**：`syncRunCompleted` 摘要模板 + ambient 前缀规范化 + Memory 列表 kind 徽章（UI）。
2. **M2 失败学习（可选开关）**：settings 或 env `MA_MEMORY_CAPTURE_FAILS=1`。
3. **M3 来源可观测**：item meta `source` 字段（schema 扩展）替代纯文本前缀解析。
4. **M4（远期）** agent-facing memory skill + 写后 `on_memory_write` 镜像。

## 与 Issue 轨迹 UI 的关系

- **轨迹 / Runs** = 当次执行证据（不进 memory 原文）。
- **Memory** = 跨 issue 可检索经验。
- Issue 详情「运行」折叠区只负责观测与再执行，不承担记忆编辑。

## 决策记录（Owner）

- 保持「编排边界写入」，不假装有 Hermes 级 in-loop memory tool（宪法：不自造 agent loop）。
- Wiki 与 Memory 双写 done 保留，但 **文案职责分离**（M1）。
- 失败 ambient 默认关，避免 orphan 风暴污染检索。

## 下一实现刀候选

- M1 + Memory 页 kind 过滤/徽章 + Settings 一句「写入说明」
- 或先收完 Issue 顶栏/属性轨视觉债（本会话并行）
