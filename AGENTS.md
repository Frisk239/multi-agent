# AGENTS.md — 项目宪法

> 这是**本地多智能体编排产品**的工程工作区。改任何东西前，先读这份。  
> 出身可追溯毕设/调研，但**主航道按真实产品做**：日常可用、可演进、可运营——**不**把「答辩演示」「论文章节」当作产品排期真源。

## 这是什么

纯本地（非云端）、面向软件工程的多智能体编排平台。人在本地 Web 控制台上分配任务给 Agent，Agent 绑定并驱动本机已有的编码 CLI（Claude Code / opencode / Cursor / Pi…），产出写入项目 Wiki，经验写入记忆层。

**产品一句话：** 本机编码 CLI 的编排控制台——派活、小队、追踪、Wiki、记忆，全部本地、可天天用。

**架构一句话（可写论文，但不驱动路线）：** 四层（编排-执行-知识-记忆），「编译式项目 Wiki」+「可插拔记忆」。

**工程状态。** S01–S12 + 补1–5 已合 main（含最小自动化 PR #16）。  
**补充阶段已收官**（[phase4b](docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md)，**不开补6**）。**当前主线：产品演进切片**——按用户价值与痛点开刀，须人显式指定主题；**工作流 = Slice Owner 一会话一切片 × 调研子代理 × Matt skills**（见 §工程模式 · [ADR 0001](docs/adr/0001-slice-owner-and-research-subagents.md)）。

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

**怎么查（省 Slice Owner 上下文）：** 用户说「去调研 / 对齐 X」或需要通读 upstream 时，**默认派调研子代理**（或 `/research`）完成 1–3；Owner 会话**只合并**「结论 + 选项 + file:line + 与本仓差异」。禁止为调研在实现窗灌入大段上游源码。见 §工程模式 · ADR 0001。

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
- ✅ **补充阶段收官**（2026-07-17）— 不开补6；H/I/J 不自动开工
- ▶ **产品演进主线** — 当真实产品继续切片；主题由人指定（非答辩清单、非自动 S 编号）
- ▶ **工程编排** — Slice Owner（非计划者/执行者）；调研默认子代理（[ADR 0001](docs/adr/0001-slice-owner-and-research-subagents.md)）

**产品/阶段真源：** [phase4b](docs/superpowers/specs/2026-07-17-phase4b-product-supplement-design.md)（补充已收官）· [roadmap](design/roadmap.md) · [CONTEXT.md](CONTEXT.md)

## 不可破坏的约束

- ❌ 不做云端托管 / 多节点 / Redis
- ❌ 不自造 Agent loop（用 Backend adapter 驱动已有 CLI）
- ❌ 不改 `references/repos/` 下的上游代码
- ❌ 不在 `chanpin/prototype/` 引入构建步骤或框架（它是零依赖纯原生 HTML 原型，双击 index.html 即可运行——这是刻意的）
- ✅ 核心 seed 工作流（含历史 FRI-11 样例）不无故砸掉；**排期优先级 = 产品日常可用**，不是答辩彩排

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

> **2026-07-17 起默认：Slice Owner（一切片一会话），不再默认计划者/执行者双角色。**  
> 工具层仍是 Matt skills（`/implement`、`/tdd`、`/code-review`、`/handoff`、`/research`…）；技能需显式调用或 `/ask-matt`。  
> 决策记录：[docs/adr/0001-slice-owner-and-research-subagents.md](docs/adr/0001-slice-owner-and-research-subagents.md)

### 核心方法：垂直切片 × Slice Owner × 子代理调研 × Matt skills

| 维度 | 决定什么 | 落地 |
|---|---|---|
| **垂直切片** | 做什么、多厚 | 一刀端到端可演示；可拆 `.scratch` 票，但**默认同一会话做完一刀**（窗不够再按票拆会话） |
| **Slice Owner 会话** | 从对齐到做绿 | 短对齐 →（需要时）spec/票 → `/implement` → 自测 → handoff；**允许写 `app/**`** |
| **调研子代理** | 读参考项目 / 全网 / 深仓 | 用户说「去调研 / 对齐 multica / 查 references」→ **派子代理或 `/research`**，**不要**在 Owner 窗里通读 upstream |
| **审查会话** | 合码偏见隔离 | **新会话** `/code-review` 看 PR/分支；不靠「另一人格计划者」验收 |
| **人** | 主题、合 PR、产品拍板 | 开哪个会话、是否合并 |

**为何改掉计划者/执行者：** Matt 的 grill 很深，计划者会话常先烧半窗；双角色 = 双倍固定成本。偏见隔离改由 **PR + 新会话 code-review** 承担。长上下文问题用 **按切片/票拆会话 + handoff** 解决，不靠角色名。

### Grill 深度（省 Owner 上下文）

| 情况 | 做法 |
|---|---|
| 主题清晰、对标已有结论 | **短对齐**（少量决策）或直接 implement；**不要**默认满血 `/grill-with-docs` |
| 要改领域词 / 难逆决策 | 再开 grill-with-docs + ADR |
| 要对齐参考实现 / 源码细节 | **调研子代理**（见下），Owner 只吃**结构化摘要** |

### 调研：默认子代理（最高优先级之一）

**当用户说「去调研 / 对齐 X / 看看 multica 怎么做 / 查 references」时：**

1. **优先**派 **子代理**（或 `/research` / 并行 explore）去读 `references/deep/*`、`references/repos/*`、必要时上游文件。  
2. 子代理产出：**短结论 + 文件:行 + 与本仓差异 + 推荐选项**（可落 `docs/` 或 ticket Comments / research 笔记）。  
3. **Slice Owner 会话禁止**为了「调研彻底」在本窗灌入大段上游源码；只合并摘要再决策/实现。  
4. 仍遵守宪法：决策**先查参考项目**——查的动作在子代理，**拍板**在 Owner/人。

### 一个 feature 的生命周期（默认）

```
人 → 开【Slice Owner】会话（一刀一事）
     ├─ 读 AGENTS.md + CONTEXT.md + 相关 spec/ticket/handoff
     ├─ 需要对齐参考？→ 派调研子代理 → 只回收摘要
     ├─ 短对齐（或已有 spec 则跳过）→ 必要时 to-spec / to-tickets
     ├─ /implement（+ tdd）→ typecheck/smoke → 更新 ticket
     ├─ 窗将满或一刀未完？→ /handoff → 人开下一会话续同一分支/下一票
     └─ 自测够了 → 人开 PR → 【新会话】/code-review → 人合 main
```

**特大/特雾：** `/wayfinder` 或「只设计」半会话产出 map/spec 后**结束**；下一会话当 Owner 实现——这是**阶段**拆分，不是计划者人设。

### 会话铁律

| 会话 | 必须 | 禁止 |
|---|---|---|
| **Slice Owner** | 交付可验行为；证据；偏离写清；push **feat/***| push main；把调研正文塞爆本窗 |
| **调研子代理** | 可引用结论 + 出处；对照本仓 | 擅自改 `app/**` 业务（除非人明确授权同一任务） |
| **Code-review 会话** | 双轴 Standards + Spec；对照分支 | 顺便开新 feature |
| **人** | 点题、合 PR | — |

### 票与进度写在哪

| 产物 | 路径 |
|---|---|
| Spec | `.scratch/<feature>/spec.md` |
| Tickets | `.scratch/<feature>/issues/0N-*.md`（可选；小刀可一票或无票直接 implement） |
| 会话交接 | ticket `## Comments`、`/handoff`、可选 `app/.progress/<feature>-*.md` |
| 调研摘要 | 子代理报告 / `docs/` 笔记 / ticket 评论（**短**） |

### 垂直切片原则（不变）

1. 每刀（或每票）端到端可跑 / 可 API 验收  
2. 有接口依赖则串行；拆会话按**厚度**，不按角色  
3. 契约可与 UI 同会话做完；若拆票则 shared/API 票在前  
4. 依赖写 `Blocked by`，不靠口头记忆  

### 大而雾 / 外来单 / 难 bug

| 情况 | 用 |
|---|---|
| 一窗装不下决策 | wayfinder 或设计-only 会话 → 下一会话 Owner 实现 |
| 外来 bug | `/triage` → Owner `/implement` |
| 难复现 | `/diagnosing-bugs` |
| 要对齐 upstream | **调研子代理** → Owner 决策 |

### 跨会话

- **`/handoff`**：换会话携带进度；不写密钥。  
- **`/compact`**：同会话阶段间隙；勿在深调研/grill 中途乱 compact 丢出处。  
- 续作会话：**只信** ticket + handoff + 调研摘要文件，不假设聊天记忆。

### Git 规则（不变）

**铁律：`app/**` 工程代码不直接进 main。**

| 场景 | 做法 |
|---|---|
| 文档/调研笔记 | 可 `docs:` 进 main |
| **任何 app/ 工程代码** | `feat/<slug>` → PR → **新会话 `/code-review`** → 人合并 |

- Conventional Commits：`feat:` / `fix:` / `docs:` / `chore:` / `refactor:` / `test:`  
- main 始终 typecheck + `pnpm dev` 可起  

### 与历史文档的关系

- 旧 handoff 里的「计划者/执行者」：**历史角色名**；新会话按 **Slice Owner** 执行。  
- `docs/superpowers/*` 仍可读；新工作优先 `.scratch/<feature>/`。  
- phase4b 已收官；产品演进切片走本模式。  

## 工作语言

中文为主（用户、文档、seed 数据都是中文）。代码标识符用英文。
