# AGENTS.md — 项目宪法

> 这是本地多智能体编排平台的毕设工作区。改任何东西前，先读这份。

## 这是什么

纯本地（非云端）、面向软件工程的多智能体编排平台。人在本地 Web 控制台上分配任务给 Agent，Agent 绑定并驱动本机已有的编码 CLI（Claude Code / opencode / Cursor / Pi…），产出写入项目 Wiki，经验写入记忆层。

**论文一句话：** 四层架构（编排-执行-知识-记忆），用「编译式项目 Wiki」+「可插拔记忆」解决 RAG 不累积、执行不可追踪、跨会话上下文丢失。

**工程实现已启动。** S01–S12 + 补1–4 已合 main；补5 自动化待合 PR。  
**当前主线：补充阶段收尾**——可运营缺口（见 [phase4b](docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md)）；**工作流已迁到 Matt 工程 skills**（见下方 §工程模式），不再默认 superpowers。

## 目录地图

| 目录 | 作用 | 改动规则 |
|---|---|---|
| `design/` | 目标系统的设计文档（架构、路线图、技术选型综合分析） | 改代码前必读 `synthesis.md` |
| `chanpin/` | **产品规格 + 可交互原型**（PM 小队产出，已验收） | 数据模型真源在 `chanpin/prototype/data/seed.js` |
| `references/deep/` | multica/hermes/pi 的源码级深读（带 file:line 索引） | 动手实现某层前读对应深读 |
| `references/`（高层摘要） | catalog/orchestration/runtime/wiki/memory 各层摘要 | 快速了解用 |
| `references/repos/` | 12 个上游开源 clone（**只读，gitignore，独立 git**） | **绝不在此改上游代码** |
| `concepts/` | 跨项目理论（Wiki 模式等） | 论文 Related Work 用 |
| `app/` | 应用代码（pnpm monorepo：shared / server / web） | feature 分支 → PR；见 §工程模式 |
| `docs/agents/` | **Skills 配置**（tracker / domain / triage） | setup 产出；可手改 |
| `CONTEXT.md` | **领域词汇 + 当前方位** | grill / domain-modeling 维护 |
| `.scratch/` | **本地工单与 spec**（to-spec / to-tickets / wayfinder） | 一 feature 一目录 |

## 技术栈（已锁定）

- **TypeScript 全栈**（前后端共享类型）
- **纯本地混合进程**：编排主进程（Node 长驻）+ 每个 agent 执行一个子进程。不需要 Redis、不需要多节点、不需要云端托管。详见 [design/synthesis.md](design/synthesis.md) §进程模型
- 后端：Node + Hono/Fastify + Drizzle ORM
- DB：SQLite（Phase 0-2）→ PostgreSQL+pgvector（Phase 3 起需向量）
- 前端：Next.js + React Query + Zustand
- 执行层：**多 Backend adapter**（非单一 runtime）—— 每个 agent 绑定一个本机 CLI
- 校验：Zod

详见 [design/synthesis.md](design/synthesis.md)。

## 决策原则：先查参考项目（最高优先级）

**遇到路线选择或策略评审问题，第一反应是调研分析参考项目，而不是凭经验拍脑袋。** 本项目不是从零发明，12 个参考项目（multica / hermes / pi / openwiki …）的源码深读就在 `references/deep/` 和 `references/repos/` 里，先看成熟实现怎么解决这个问题，再决定自己的方案。

优先级**高于**「拍脑袋给方案」和「直接问人」：

1. **先查 `references/deep/`（带 file:line 索引的源码深读）** —— 找最贴近问题的那个项目的对应章节。这是最高质量的一手信息，已为你提炼好。
2. **再查 `references/repos/`（12 个上游 clone，只读）** —— 深读没覆盖的细节，直接 grep 上游源码。`grep -rn` 搜关键词比通读快。
3. **交叉验证** —— 同一个问题看 ≥2 个项目怎么解，异同点就是你做架构决策的依据（见下方「关键架构决策」每条都标了「学 multica / 学 hermes」就是这个套路）。
4. **最后才下结论** —— 结论里注明「参考了 X 项目的 Y 做法 / 与 Z 项目的差异」。

**典型场景：**
- 选 A 方案还是 B 方案（如状态机用内存 mutex 还是 DB 行锁）→ 先看 multica 怎么做
- 评估一个抽象是否合理（如要不要建「squad task」表）→ 先看 multica 的 squad 实现
- 不确定某个模式叫什么、业界怎么做（如编译式 Wiki、可插拔记忆）→ 先看 `concepts/` + `references/` 摘要

> 项目宪法里的「关键架构决策」就是**这套方法跑出来的产物**——每条都标了「学 multica / 学 hermes」。新决策也照这个标准：有参考、有出处。

## 关键架构决策（改动前必须知道）

1. **不自造 Agent loop。** 执行层驱动用户本机已有的 CLI，每个 CLI 是一个 `RuntimeBackend`（学 multica 的 `pkg/agent/agent.go:16` Backend 接口）。Pi 是其中一个 backend（进程内 SDK），Claude Code/opencode 是子进程 backend。

2. **DB 行即锁。** 状态转换用条件 `UPDATE ... WHERE status IN (...) RETURNING *`，不用内存 mutex（学 multica）。纯本地主进程是唯一 DB 写入者，无跨进程竞争，可简化，但保留这个模式。

3. **多态指派 `(type, id)`。** Issue/Squad/Comment 的指派用 `(assigneeType, assigneeId)` 判别列对 + CHECK 约束，不用 join table。原型的 `seed.js` 已是这个结构。

4. **Squad = leader 执行 + briefing 注入 + mention 闭环。** 不建独立「squad task」抽象。leader 被 brief 去通过 `[@Name](mention://agent/<id>)` 委派，mention 触发 comment-trigger → enqueue（学 multica）。

5. **AGENTS.md 是 Wiki→Runtime 的桥梁。** Wiki ingest 后更新 workspace 级宪法，runtime 启动时加载。

6. **Footprint Ladder 扩展哲学。** 新能力优先 CLI+Skill > gated tool > plugin > MCP > core tool。同类 3+ PR 就抽象成 ABC + orchestrator（学 hermes）。

## 改代码前必读（按任务）

| 要做的事 | 先读 |
|---|---|
| 写编排层（Issue/状态机/Squad） | [references/deep/multica.md](references/deep/multica.md) |
| 接执行层（Backend adapter） | [references/deep/pi.md](references/deep/pi.md) + [references/deep/multica.md](references/deep/multica.md) §5 |
| 写记忆层（MemoryProvider） | [references/deep/hermes-memory-delegate.md](references/deep/hermes-memory-delegate.md) §1 |
| 写 Tool Registry | [references/deep/hermes-execution.md](references/deep/hermes-execution.md) §2 |
| 写前端组件 | [chanpin/prototype/](chanpin/prototype/)（UI 规格真源）+ [chanpin/ANALYSIS.md](chanpin/ANALYSIS.md) |
| 设计 DB schema | [chanpin/prototype/data/seed.js](chanpin/prototype/data/seed.js)（数据模型真源） |
| 写 Wiki ingest | [concepts/llm-wiki-pattern.md](concepts/llm-wiki-pattern.md) + [references/wiki.md](references/wiki.md) |

## 当前完成状态

- ✅ 12 个参考项目调研 + 源码深读
- ✅ 技术选型锁定（TS 全栈 + 纯本地 + 多 Backend）
- ✅ 产品原型已验收（`chanpin/`，88 Must REQ 可交互）
- ✅ **S01–S12** 编排 / 执行 / Wiki / 记忆 / 产品硬化
- ✅ **补1–4** 可靠性+Inbox · Agent/Squad 运营 · Quick-create · Settings 诊断（PR #12–#15）
- ✅ **补5** 最小自动化（PR #16 合 main）— schedule + run-now + `/automation`
- ⏸ **后续能力主线** — 补充阶段退出前不前推

**补充阶段进度表：** [phase4b](docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md)  
**领域词汇：** [CONTEXT.md](CONTEXT.md)

## 不可破坏的约束

- ❌ 不做云端托管 / 多节点 / Redis
- ❌ 不自造 Agent loop（用 Backend adapter 驱动已有 CLI）
- ❌ 不改 `references/repos/` 下的上游代码
- ❌ 不在 `chanpin/prototype/` 引入构建步骤或框架（它是零依赖纯原生 HTML 原型，双击 index.html 即可运行——这是刻意的）
- ✅ 答辩 demo 路径 FRI-11 必须始终可演示（见 [chanpin/prototype/data/seed.js](chanpin/prototype/data/seed.js)）

## Agent skills

### Issue tracker

工单与 spec 落在 **本地 markdown** `.scratch/<feature>/`；GitHub 仅用于 PR。见 [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md)。

### Triage labels

本地 `Status:` 使用标准五角色（`ready-for-agent` 等）。见 [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md)。

### Domain docs

Single-context：`CONTEXT.md` + `docs/adr/`。见 [`docs/agents/domain.md`](docs/agents/domain.md)。

### 工作流路由

idea→ship 与本仓适配说明：[`docs/agents/workflow.md`](docs/agents/workflow.md)。不确定用哪个 skill → **`/ask-matt`**。

## 工程模式（最高优先级，所有 `app/` 会话必读）

> **双层融合，不是二选一：**  
> 1. **编排层（本仓保留）**——**计划者主代理 + 执行者子代理**（人派会话、串行验收）  
> 2. **工具层（Matt skills）**——`/grill-with-docs`、`/to-spec`、`/to-tickets`、`/implement`、`/code-review`、`/handoff`… 作为各角色会话里**调用的技能**  
>
> 已弃用的是 **superpowers 默认路径名与长 checkbox plan**，**不是**计划者/执行者分工。  
> 技能不会自动猜——需要时显式 `/skill` 或问 `/ask-matt`。

### 核心方法：垂直切片 × 计划者-执行者 × Matt skills

| 维度 | 决定什么 | 落地 |
|---|---|---|
| **垂直切片 / tracer bullet** | 做什么、多厚 | `/to-tickets` 的一票 = 端到端可演示一刀 |
| **计划者主代理** | 切片内怎么拆、何时验收 | **只** grill / to-spec / to-tickets / 写 kickoff / **验收**；**不写** `app/**` 业务实现 |
| **执行者子代理** | 把票做绿 | 新会话读 ticket → `/implement`（+ tdd）→ 自测 → handoff/进度 → push 分支 |
| **人** | 编排与合码 | 派会话、合 PR、拍板产品 |

**为什么保留计划者-执行者：** 长会话质量下降 → 切片内拆短会话；子代理丢上下文 → ticket + handoff 传真源；计划者无实现偏见 → 验收更干净。

### 一个 feature 的生命周期（融合后）

```
人 → 开【计划者主代理】会话
     ├─ 读 AGENTS.md + CONTEXT.md + design/ + 相关 ticket/旧 progress
     ├─ /grill-with-docs（或小改跳过）→ 需要时 /handoff+/prototype
     ├─ /to-spec → 落到 .scratch/<feature>/spec.md（可链 docs/superpowers 旧文）
     ├─ /to-tickets → .scratch/<feature>/issues/0N-*.md（Blocked by + ready-for-agent）
     ├─ 写 kickoff（可写在 ticket 评论或 app/.progress/<feature>-planner-0.md）
     ├─ 人派【执行者 1】：只做 frontier 上无阻塞的票（通常 schema/API 先）
     │     执行者：/implement → 自测 → 更新 ticket / 可选 progress handoff → push feat/*
     ├─ 计划者验收执行者 1（读 handoff + typecheck/抽查）→ 勾票或写注意点给下一棒
     ├─ 人派【执行者 2】…（串行；仅无接口依赖且不同文件才可并行）
     └─ 全部票绿 → 计划者整刀结论 → 人开 PR
           → 新会话 /code-review → 人合 main
```

**小改动**（一票一会话能装下）：计划者可省略，人直接派执行者 `/implement`；仍建议 PR + code-review。

### 角色铁律

| 角色 | 必须 | 禁止 |
|---|---|---|
| **计划者** | 拆票、kickoff、验收、给下一棒注意点、进度表/CONTEXT 文档更新 | 在计划者会话写 `app/**` 业务实现（修冲突文档除外） |
| **执行者** | 按票实现、typecheck/smoke 证据、偏离写清、push **feature 分支** | push main；扩大 scope 到未派的票 |
| **人** | 派谁做哪票、合 PR、产品拍板 | — |

### 票与进度写在哪

| 产物 | 路径 |
|---|---|
| Spec | `.scratch/<feature>/spec.md`（首选）；可链接 `docs/superpowers/specs/*` |
| Tickets | `.scratch/<feature>/issues/0N-*.md`（`Blocked by` / `Status`） |
| 计划者 kickoff / 验收 | 优先写在 ticket `## Comments`；或 `app/.progress/<feature>-planner-k.md`（习惯保留） |
| 执行者交付 | ticket 勾选 + 可选 `app/.progress/<feature>-impl-k.md` |
| 跨会话浓缩 | `/handoff`（OS 临时目录） |

模板：[`app/.progress/_TEMPLATE.md`](app/.progress/_TEMPLATE.md) 仍可用。

### 垂直切片原则（不变）

1. 每票端到端可跑 / 可 API 验收  
2. **切片内执行者串行**（有接口依赖时）；无依赖才并行  
3. **契约先行**：shared 类型票先合再开 UI 票  
4. 依赖用 **Blocked by**，不靠口头「impl-2 接着干」却无票  

### 大而雾 / 外来单 / 难 bug

| 情况 | 用 |
|---|---|
| 目标可见但一会话装不下决策 | 计划者开 `/wayfinder` → 清晰后 `/to-spec` → tickets → 再派执行者 |
| 外来 bug/请求 | `/triage` → ready-for-agent → 派执行者 `/implement` |
| 难复现 | `/diagnosing-bugs`（常由执行者或专项会话） |
| 架构加深 | `/improve-codebase-architecture` + `/codebase-design`（计划者导向） |

### 跨会话

- **`/handoff`**：换会话；不写密钥。  
- **`/compact`**：同会话阶段间隙；勿在 grill 中途 compact。  
- 执行者之间：**只通过 ticket + 计划者验收注意点** 传上下文，不假设共享聊天记忆。

### Git 规则（不变）

**铁律：`app/**` 工程代码不直接进 main。**

| 场景 | 做法 |
|---|---|
| 文档/调研（design/、chanpin/、docs/、CONTEXT…） | 可直接 `docs:` 提交 main（计划者也可做） |
| **任何 app/ 下的工程代码** | `feat/<slug>` → PR → **新会话 `/code-review`** → 人合并 |

- Conventional Commits：`feat:` / `fix:` / `docs:` / `chore:` / `refactor:` / `test:`  
- main 始终 typecheck + `pnpm dev` 可起  
- 单人也开 PR：无上下文偏见审 diff  

### 与 superpowers 文档的关系

- 弃用的是 **默认 superpowers 流程名**，不是历史文档。  
- `docs/superpowers/specs/*`、`plans/*`：**仍可读**；新 feature 优先 `.scratch/<feature>/spec.md`（链回旧文即可）。  
- 补充阶段 phase4b：**产品 backlog 仍有效**；执行 = 计划者拆票 + 执行者 implement。  

## 工作语言

中文为主（用户、文档、seed 数据都是中文）。代码标识符用英文。
