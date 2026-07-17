# AGENTS.md — 项目宪法

> 这是本地多智能体编排平台的毕设工作区。改任何东西前，先读这份。

## 这是什么

纯本地（非云端）、面向软件工程的多智能体编排平台。人在本地 Web 控制台上分配任务给 Agent，Agent 绑定并驱动本机已有的编码 CLI（Claude Code / opencode / Cursor / Pi…），产出写入项目 Wiki，经验写入记忆层。

**论文一句话：** 四层架构（编排-执行-知识-记忆），用「编译式项目 Wiki」+「可插拔记忆」解决 RAG 不累积、执行不可追踪、跨会话上下文丢失。

**工程实现已启动。** S01–S12 已合 main（编排/执行/Wiki/记忆 + 产品硬化）。  
**当前主线：补充阶段（补1、补2…，刀数不固定）——先补可运营缺口，不再前推后续能力切片；补到差不多再开后续。** 真源见 [docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md](docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md)。

## 目录地图

| 目录 | 作用 | 改动规则 |
|---|---|---|
| `design/` | 目标系统的设计文档（架构、路线图、技术选型综合分析） | 改代码前必读 `synthesis.md` |
| `chanpin/` | **产品规格 + 可交互原型**（PM 小队产出，已验收） | 数据模型真源在 `chanpin/prototype/data/seed.js` |
| `references/deep/` | multica/hermes/pi 的源码级深读（带 file:line 索引） | 动手实现某层前读对应深读 |
| `references/`（高层摘要） | catalog/orchestration/runtime/wiki/memory 各层摘要 | 快速了解用 |
| `references/repos/` | 12 个上游开源 clone（**只读，gitignore，独立 git**） | **绝不在此改上游代码** |
| `concepts/` | 跨项目理论（Wiki 模式等） | 论文 Related Work 用 |
| `app/` | 应用代码（pnpm monorepo：shared / server / web） | 一切片一 feature 分支；handoff 在 `app/.progress/` |

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
- ✅ **S01–S05** 看板 / 详情 / 真实执行 / Squad / Skill·MCP
- ✅ **S06–S08** Wiki + ingest 队列 + AGENTS bridge
- ✅ **S09–S11** MemoryProvider + pgvector + brain-first UI
- ✅ **S12** 产品硬化（Chrome + progress + Squad 只读 + 合成 Inbox）
- ⬅ **补充阶段（当前）** — 补1…补N：可靠性、真 Inbox、Agent/Squad 运营、quick-create、Settings、最小 Autopilot…按需加刀
- ⏸ **后续能力切片** — 补充阶段退出前不前推

**补充阶段真源：** [`docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md`](docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md)  
**切片/handoff 约定：** 分支 `feat/bu0N-…`，进度写 `app/.progress/bu0N-*.md`

## 不可破坏的约束

- ❌ 不做云端托管 / 多节点 / Redis
- ❌ 不自造 Agent loop（用 Backend adapter 驱动已有 CLI）
- ❌ 不改 `references/repos/` 下的上游代码
- ❌ 不在 `chanpin/prototype/` 引入构建步骤或框架（它是零依赖纯原生 HTML 原型，双击 index.html 即可运行——这是刻意的）
- ✅ 答辩 demo 路径 FRI-11 必须始终可演示（见 [chanpin/prototype/data/seed.js](chanpin/prototype/data/seed.js)）

## 工程模式（最高优先级，所有 `app/` 会话必读）

### 核心方法：垂直切片 × 计划者-执行者

**两个维度，不是二选一：**
- **垂直切片**决定「做什么」——每次端到端打通一条最薄路径，再加深。不做水平分层（先全 schema、再全 API、最后集成）。切片清单见 [`design/slices.md`](design/slices.md)。
- **计划者-执行者**决定「每个切片内部怎么执行」——你（人）是编排者，每个垂直切片派一个**计划者主代理** + 多个**顺序执行的执行者子代理**。

**为什么这样组合：** 一个会话执行时间太长质量会下降，所以切片内部要拆成短会话；但拆出来的子代理之间会丢上下文，所以用 handoff 文档传递。

### 一个垂直切片的生命周期

```
人 → 开一个计划者会话
     ├─ 读 AGENTS.md + design/ + 上一切片的 handoff
     ├─ 用 EnterPlanMode 设计这个切片的执行者拆分 + 验收标准
     ├─ 派执行者 1（写 handoff → 计划者验收 → 写给执行者 2 的注意点）
     ├─ 派执行者 2（读上一切片注意点 → 实现 → 写 handoff）
     ├─ ... 顺序执行 ...
     └─ 最后一个执行者跑通验收 → 计划者写切片总结 → 人在 main 合并
```

### Handoff 文档规则（跨会话记忆的关键）

- 路径：`app/.progress/<slice-id>-<role>-<seq>.md`（如 `s01-impl-1.md`）
- 执行者**必须**写：完成了什么、自测结果、与计划的偏离及原因
- 计划者**必须**写：验收结论 + 给下一个执行者的注意点（不是新计划）
- 模板见 [`app/.progress/_TEMPLATE.md`](app/.progress/_TEMPLATE.md)
- **每个会话开始前先读这个目录最新的 handoff**

### 垂直切片划分原则

1. **每个切片端到端可跑**——切完能 `pnpm dev` 看到进展
2. **切片之间串行，切片内部执行者串行**——除非两个子任务改不同文件且无接口依赖，才可并行
3. **契约先行**——任何并行前，shared 类型/Zod schema 必须先定死
4. **切片对应 RTM 需求**——[`chanpin/docs/prd/multi-agent-platform-rtm-v2.md`](chanpin/docs/prd/multi-agent-platform-rtm-v2.md) 的 88 Must 是验收字典

### Git 规则

**铁律：开发代码永远不直接进 main。** main 是稳定的文档基线 + 已验收合并的切片。

| 场景 | 做法 |
|---|---|
| 文档/调研（design/、chanpin/、references/ 等） | 可直接提交 main（`docs:` 前缀） |
| **任何 app/ 下的工程代码** | **必须**走 feature 分支 → PR → 审查 → 合并，**绝不直接 push main** |

**分支与提交规范：**

- 一个垂直切片一个 feature 分支：`feat/<slice-id>-<描述>`（如 `feat/s01-monorepo-scaffold`）
- 切片内部执行者都在这个分支上提交，不开新分支（除非试验性探索）
- Conventional Commits：`feat:` / `fix:` / `docs:` / `chore:` / `refactor:` / `test:`
- main 必须始终能 typecheck 通过、能 `pnpm dev` 起来

**合并流程（每个切片结束）：**

1. 计划者确认切片验收达标（handoff 里勾选了验收清单）
2. 开 PR，让**新会话**（无上下文偏见）审 diff
3. 审查通过 → 人在 main 合并（普通 merge，保留分支历史）
4. 合并后该 feature 分支可删

**单人为何也开 PR：** 新会话审查能发现接口不一致、遗漏的边界 case、与 AGENTS.md 约定的冲突——这些原会话因上下文惯性看不见。

详细的切片→分支映射见 [`design/roadmap.md`](design/roadmap.md)。

## 工作语言

中文为主（用户、文档、seed 数据都是中文）。代码标识符用英文。
