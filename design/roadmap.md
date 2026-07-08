# 开发路线图

> 更新：2026-07-08 · 工程模式见 [AGENTS.md §工程模式](../AGENTS.md) · 架构见 [architecture.md](architecture.md) · 技术选型见 [synthesis.md](synthesis.md)

## 工程模式

**垂直切片 × 计划者-执行者。** 详见 [AGENTS.md](../AGENTS.md) §工程模式。

核心：每个垂直切片 = 一个计划者主会话 + 多个顺序执行的执行者子会话，靠 handoff 文档交接。切片端到端可跑，不做水平分层。

---

## 当前状态

- ✅ 调研 + 源码深读 + 技术选型 + 产品原型 全部完成
- ⬜ **工程实现未启动**——以下切片待执行

---

## Phase 0 — 地基（1-2 月）

> 目标：看板端到端通 + WebSocket 实时推送。FRI-11 答辩路径的看板部分点亮。
> 详细切片划分见 [slices.md](slices.md)

| 切片 | 覆盖 | 验收画面 | 分支 |
|---|---|---|---|
| ~~S00~~ | ~~提交文档基线~~ | ✅ 已完成（commit `ac85f88`） | — |
| **S01** | monorepo 骨架 + shared 契约 + DB schema/seed + Issue CRUD API + 五列看板 + 状态机最薄版 + WebSocket 实时推送 | 五列看板真实数据；拖拽/新建实时同步；双窗口联动 | `feat/s01-kanban-ws` |

**Phase 0 验收：** `pnpm dev` → 看板显示 FRI-11 → 拖拽改 status 实时同步 → 新建 issue 实时出现。

**论文：** 需求分析、总体架构、相关工作表

---

## Phase 1 — 编排闭环 + 执行层（2-5 月）

> 目标：真实 agent 跑任务，小队能委派，Issue 时间线完整。FRI-11 答辩路径全真实。

| 切片 | 覆盖 | 验收画面 |
|---|---|---|
| **S02** | Issue 详情 + 时间线 + 评论 CRUD + @mention pill 渲染 | 点卡片进详情，看到描述+评论，能发评论，mention 渲染成 pill |
| **S03** | RuntimeBackend 接口 + Pi/Claude 真实接入 + 运行时发现 + 执行事件流进时间线 | Issue 指派 agent → 真实执行 → 时间线显示工具调用和产出；运行时页显示探测到的 CLI |
| **S04** | Squad CRUD + 成员管理 + briefing 注入 + mention-trigger 路由 | 指派小队 → leader claim 注入 briefing → @mention 委派 → 队列入任务 |
| **S05** | Skill URL 导入 + 分配 + MCP 配置 | agent 详情可导入/分配 skill，MCP Tab 配 MCP server |
| **S06+** | 待定（收件箱/智能体详情/运行时页/命令面板等，做到时定） | — |

**Phase 1 验收：** FRI-11 答辩路径全真实——看板建 Issue 指派产品小队 → 队长 briefing → @mention 委派 → 队员执行（真实 Pi/Claude）→ 时间线显示汇报。

**参考：** [deep/multica.md](../references/deep/multica.md) §2 §3 §5 / [deep/pi.md](../references/deep/pi.md)

---

## Phase 2 — 项目 Wiki（5-8 月，创新点）

> 目标：编排事件驱动 Wiki ingest；编译式 Wiki vs RAG 实验数据

| 切片 | 目标 | 参考 |
|---|---|---|
| **S07+** | Wiki 存储结构（raw/ + wiki/ + index.md + log.md） | [concepts/llm-wiki-pattern.md](../concepts/llm-wiki-pattern.md) |
| | ingest 管线（Issue 完成 → 抽取 → entity/concept 页） | openwiki（Git diff evidence）/ OpenDeepWiki（分阶段流水线） |
| | query + health（零 LLM）+ lint（语义） | llm-wiki-agent 四操作 |
| | Wiki 浏览器 UI | [chanpin prototype](../chanpin/prototype/) |
| | AGENTS.md 桥梁（Wiki ingest → 更新 → runtime 加载） | agents.md 规范 |
| | ingest 队列 + DLQ（产品化） | WeKnora |

**论文实验：** 编译式 Wiki vs 朴素 RAG 的 ablation

**参考：** [wiki.md](../references/wiki.md) / [synthesis.md §4 知识层](synthesis.md)

---

## Phase 3 — 记忆与 Skill pack（8-11 月，创新点）

> 目标：MemoryProvider + 向量检索；mem0 vs graphiti 对比

| 切片 | 目标 | 参考 |
|---|---|---|
| **S13+** | MemoryProvider ABC + MemoryManager | hermes [deep/hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md) §1 |
| | mem0 向量后端（TS SDK） | mem0 |
| | brain-first 协议（搜→用→写回 + ambient capture） | GBrains 笔记 |
| | graphiti 时序图后端（可选实验） | graphiti |
| | Skill pack 预置（plan/review/QA/ship） | gstack |

**论文实验：** 向量（mem0）vs 时序图（graphiti）记忆 ablation

**参考：** [memory-and-skills.md](../references/memory-and-skills.md) / [synthesis.md §4 记忆层](synthesis.md)

---

## Phase 4 — 打磨（11-12 月）

- 端到端 demo + 性能数据 + 答辩材料
- Autopilot 调度器（cron/webhook，如时间允许）

---

## 答辩 Demo：FRI-11 闭环

> 这个路径随每个切片渐进点亮，Phase 1 末全真实。

1. 看板创建 Issue「毕设 multi-agent」→ 分配给**产品小队**
2. 队长（Pi/Claude）claim → 读 briefing + AGENTS.md + Wiki + memory
3. 队长 @mention 委派队员 → 队员（Cursor/opencode）执行
4. Issue 时间线显示所有 comment + 工具调用 + 汇报
5. Issue 完成 → Wiki ingest → memory 摘要

**指标：** 任务完成率、tool call 次数、Wiki 链接密度、memory hit@k、ablation（无 Wiki / 无 Memory / 向量 vs 图）

---

## 风险与对策

| 风险 | 对策 |
|---|---|
| 范围过大 | Phase 1 稳定前不开 Wiki；每切片端到端可跑 |
| Agent 不可控 | 沙箱 + approve 门禁；执行者子会话 scope 限定 |
| 创新点不足 | 编排事件→Wiki + Wiki/Memory 分工 + 两组 ablation 实验 |
| 跨会话上下文丢失 | handoff 文档（见 [AGENTS.md](../AGENTS.md) §工程模式） |
| 会话质量随长度下降 | 切片内部拆短会话；计划者-执行者串行 |

---

## 切片 → Handoff 文档

每个切片的 handoff 存 [`app/.progress/`](../app/.progress/)，命名 `<slice-id>-<role>-<seq>.md`。

**最新 handoff 是下一个会话的第一份读物。**
