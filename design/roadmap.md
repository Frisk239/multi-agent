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

> 目标：monorepo 能跑，最薄的端到端路径打通（UI 建 Issue → DB → 列表刷新）

| 切片 | 目标 | 验收（可跑） | 分支 | 参考实现 |
|---|---|---|---|---|
| **S00** | 提交全部文档到 git | main 上有完整文档基线 | `docs/initial-docs` | — |
| **S01** | monorepo 骨架 | `pnpm dev` 起 server+web，互能 import shared 类型 | `feat/s01-monorepo-scaffold` | synthesis §2.2 |
| **S02** | Drizzle schema | `pnpm db:migrate` 建表；照搬 seed.js 结构 | `feat/s02-db-schema` | [chanpin seed.js](../chanpin/prototype/data/seed.js) / synthesis §2.4 |
| **S03** | Issue CRUD API | `POST/GET /issues` 落库；seed 数据能加载 | `feat/s03-issue-api` | synthesis §2.5 |
| **S04** | WebSocket 基础 | 能从 server 推一条假事件到前端 console | `feat/s04-ws-base` | synthesis §2.7 / [multica.md](../references/deep/multica.md) §2c |
| **S05** | 看板视图（移植原型） | Next.js 渲染五列看板，调 GET /issues | `feat/s05-kanban-view` | [chanpin prototype](../chanpin/prototype/) |
| **S06** | 状态机 + 拖拽 | 拖拽改 status → DB 条件更新 → WS 推送 → UI 刷新 | `feat/s06-state-machine` | synthesis §2.5 / [multica.md](../references/deep/multica.md) §2a |

**Phase 0 验收：** 建一个 Issue → 看板显示 → 拖到「进行中」→ 刷新还在。FRI-11 seed 路径可演示。

**论文：** 需求分析、总体架构、相关工作表

---

## Phase 1 — 编排闭环 + 执行层（2-5 月）

> 目标：真实 agent 能跑任务，小队能委派，Issue 时间线完整

### 1a — 执行层接入

| 切片 | 目标 | 验收 |
|---|---|---|
| **S07** | RuntimeBackend 接口 + MockBackend | MockBackend 按协议 emit 事件 |
| **S08** | PiBackend | 真实 Pi 跑一个 prompt，事件流到 Issue 时间线 |
| **S09** | ClaudeCodeBackend | spawn `claude --output-format stream-json`，解析事件 |
| **S10** | 运行时发现 | 启动时 `which` 探测本机 CLI，agent 创建时可选 |

### 1b — Squad（★★★★★ 你的核心体验）

| 切片 | 目标 | 验收 |
|---|---|---|
| **S11** | Squad CRUD + 成员管理 | 小队列表 + 详情（移植原型 squad 视图） |
| **S12** | briefing 注入 | Issue 指派 squad → leader claim 时注入 Operating Protocol + Roster + Directive |
| **S13** | mention-trigger 路由 | leader comment 的 `[@Name](mention://agent/<id>)` → 在被 mention 的 agent 队列排任务 |
| **S14** | Issue 详情 + 时间线 | 完整移植原型 inbox 三栏；agent/人 comment 都进时间线 |

### 1c — Skill + MCP

| 切片 | 目标 | 验收 |
|---|---|---|
| **S15** | Skill URL 导入 + 分配 | 从 URL 拉取 skill 内容；agent 可分配 skill |
| **S16** | MCP 配置 | agent 详情 MCP Tab 可配 MCP server 并连接 |

**Phase 1 验收：** FRI-11 答辩路径全真实——看板建 Issue 指派产品小队 → 队长 briefing → @mention 委派 → 队员执行（真实 Pi/Claude）→ 时间线显示汇报。

**参考：** [deep/multica.md](../references/deep/multica.md) §2 §3 §5 / [deep/pi.md](../references/deep/pi.md)

---

## Phase 2 — 项目 Wiki（5-8 月，创新点）

> 目标：编排事件驱动 Wiki ingest；编译式 Wiki vs RAG 实验数据

| 切片 | 目标 | 参考 |
|---|---|---|
| **S17** | Wiki 存储结构（raw/ + wiki/ + index.md + log.md） | [concepts/llm-wiki-pattern.md](../concepts/llm-wiki-pattern.md) |
| **S18** | ingest 管线（Issue 完成 → 抽取 → entity/concept 页） | openwiki（Git diff evidence）/ OpenDeepWiki（分阶段流水线） |
| **S19** | query + health（零 LLM）+ lint（语义） | llm-wiki-agent 四操作 |
| **S20** | Wiki 浏览器 UI（移植原型 wiki 视图） | [chanpin prototype](../chanpin/prototype/) |
| **S21** | AGENTS.md 桥梁（Wiki ingest → 更新 → runtime 加载） | agents.md 规范 |
| **S22** | ingest 队列 + DLQ（产品化） | WeKnora |

**论文实验：** 编译式 Wiki vs 朴素 RAG 的 ablation

**参考：** [wiki.md](../references/wiki.md) / [synthesis.md §4 知识层](synthesis.md)

---

## Phase 3 — 记忆与 Skill pack（8-11 月，创新点）

> 目标：MemoryProvider + 向量检索；mem0 vs graphiti 对比

| 切片 | 目标 | 参考 |
|---|---|---|
| **S23** | MemoryProvider ABC + MemoryManager | hermes [deep/hermes-memory-delegate.md](../references/deep/hermes-memory-delegate.md) §1 |
| **S24** | mem0 向量后端（TS SDK） | mem0 |
| **S25** | brain-first 协议（搜→用→写回 + ambient capture） | GBrains 笔记 |
| **S26** | graphiti 时序图后端（可选实验） | graphiti |
| **S27** | Skill pack 预置（plan/review/QA/ship） | gstack |

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
