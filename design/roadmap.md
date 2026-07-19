# 开发路线图

> **历史文档（2026-07-08 起骨架）。** 现行工程模式 / 北星 / 方位真源：  
> [AGENTS.md](../AGENTS.md) · [docs/agents/workflow.md](../docs/agents/workflow.md) · [CONTEXT.md](../CONTEXT.md) · [multica-gap](../app/.progress/multica-gap-2026-07-17.md)  
> 下文中的「计划者-执行者」「S03 进行中」「答辩 FRI-11 驱动」等**不驱动** 2026-07-17 后的排期；产品演进走 Slice Owner + 语义 slug。

## 工程模式（现行摘要）

**垂直切片 × Slice Owner（自动迭代）。** 详见 [AGENTS.md](../AGENTS.md) §工程模式 · [workflow.md](../docs/agents/workflow.md)。

核心：一刀 = 可演示用户路径（契约+API+UI）；Playwright 关刀；默认可 main 直推。目标 = **本地 Multica 控制台体验**，非 daemon 1:1。

---

## 当前状态

- ✅ 调研 + 源码深读 + 技术选型 + 产品原型 全部完成
- ✅ **S01 已合并 main**（PR #1）— Phase 0 看板地基
- ✅ **S02 已合并 main**（PR #2 · `e1d42b9`）— 详情 + 时间线 + 评论
- ⬜ **S03 进行中（计划者会话）** — 真实 agent 执行
- ⬜ S04–S05 · Phase 2 Wiki · Phase 3 记忆

**最新交接：** [app/.progress/s02-planner-2.md](../app/.progress/s02-planner-2.md)

---

## Phase 0 — 地基（1-2 月）

> 目标：看板端到端通 + WebSocket 实时推送。FRI-11 答辩路径的看板部分点亮。
> 详细切片划分见 [slices.md](slices.md)

| 切片 | 覆盖 | 验收画面 | 分支 |
|---|---|---|---|
| ~~S00~~ | ~~提交文档基线~~ | ✅ 已完成 | — |
| **S01** | monorepo 骨架 + shared 契约 + DB schema/seed + Issue CRUD API + 六列看板 + 状态机最薄版 + WebSocket 实时推送 | ✅ 六列看板真实数据；拖拽/新建实时同步；双窗口联动 | `feat/s01-kanban-ws` → **已合 main** |

**Phase 0 验收：** ✅ `pnpm dev` → 看板显示 FRI-11 → 拖拽改 status 实时同步 → 新建 issue 实时出现。

**论文：** 需求分析、总体架构、相关工作表

---

## Phase 1 — 编排闭环 + 执行层（2-5 月）

> 目标：真实 agent 跑任务，小队能委派，Issue 时间线完整。FRI-11 答辩路径全真实。

| 切片 | 覆盖 | 验收画面 | 状态 |
|---|---|---|---|
| **S02** | Issue 详情 + 时间线 + 评论 CRUD + @mention pill 渲染 | ✅ 已合 main（PR #2） | ✅ |
| **S03** | RuntimeBackend 接口 + Pi/Claude 真实接入 + 运行时发现 + 执行事件流进时间线 | Issue 指派 agent → 真实执行 → 时间线显示工具调用和产出；运行时页显示探测到的 CLI | ⬜ 计划中 |
| **S04** | Squad CRUD + 成员管理 + briefing 注入 + mention-trigger 路由 | 指派小队 → leader claim 注入 briefing → @mention 委派 → 队列入任务 | ⬜ |
| **S05** | Skill URL 导入 + 分配 + MCP 配置 | agent 详情可导入/分配 skill，MCP Tab 配 MCP server | ⬜ |
| **S06+** | 待定（收件箱/智能体详情/运行时页/命令面板等，做到时定） | — | ⬜ |

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

## Phase 4 — 产品硬化；然后进入「补充阶段」（暂停前推）

> S12 起按**可用产品**补齐运营能力。  
> **2026-07-17 决议：** S12 之后 **只做补充阶段（补1、补2…，刀数不固定）**，**不再前推**后续能力切片；补到差不多再开后续。

### Phase 4a — S12 产品硬化 ✅

- Chrome（toast / Ctrl+K / 可指派新建 / 空态 / 错误边界 / 诚实导航）
- `run:progress` 消费；Squad 只读详情；**合成** Inbox
- 详见 [s12 spec](../docs/superpowers/specs/2026-07-17-s12-product-hardening-design.md)

### 补充阶段 — 补1 / 补2 / … ✅ 已收官

真源：[补充阶段 spec](../docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md)

- ✅ 补1–5 已合 main（A+B → C+D → E → G → F）
- ✅ 2026-07-17 退出清单勾满；人授权 Playwright 日常路径过则 **不开补6**
- H/I/J 与体验债 **不自动开工**；有明确痛点再开独立切片
- **不做：** Redis、多节点、完整 GitHub/Lark channel、Graphiti（另议）

### Phase 5+ — 产品演进（当前主线）

> **2026-07-17 产品立场：** 本项目按**真实产品**继续建设，**不以答辩/论文排期驱动切片**。  
> 补充阶段解决的是「能运营」；之后解决的是「更好用、更深、更稳」。

**开刀原则：**

1. 人指定主题；计划者 grill → to-spec → to-tickets → 执行者 implement  
2. 优先级 = **日常使用价值**（少摩擦、可诊断、知识/记忆累积、小队协作深度）  
3. 不默认恢复旧「S13 接着 S14」编号；feature 用语义 slug（如 `feat/issue-labels`）  
4. 论文实验 / Graphiti / 消融等 **可选支线**，不挡产品主线  
5. seed 里的 FRI-11 等样例仅作回归锚点，**不是**产品目标本身  

**能力方向池（非合同、按痛点抽）：**

| 方向 | 例 |
|---|---|
| 工作项厚度 | labels、筛选、附件路径、父子 issue |
| 运行可观测 | run 错误聚合、失败可行动提示、轻量 usage |
| Wiki / Memory 产品化 | DLQ 可操作、键缺失引导、空态与失败文案、检索体验 |
| 协作深度 | Squad 体验打磨、mention 闭环可发现性、briefing 可见性 |
| 自动化延伸 | webhook、更丰富 schedule（明确需要时再开） |
| 执行可靠 | 多 backend 边界、cwd/密钥引导与恢复 |

**不做（除非产品明确需要并另开刀）：** 云端多租户、Redis 舰队、为答辩单独做的一次性脚本仓库主线。

### 可选支线（论文 / 展示，非产品主线）

- 测量与消融、图表、对外演示脚本——**并行、非挡板**；不占用「下一刀必须是答辩」的默认位。

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
