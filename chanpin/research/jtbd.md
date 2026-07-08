# Jobs to be Done Canvas — 本地 Agent 编排控制台

> 2026-07-08 · 对齐 PRODUCT-BRIEF Must · 不含真实 CLI 执行

---

## Job Overview

| 字段 | 内容 |
|------|------|
| **Job 名称** | 在一屏内编排、委派并追踪本地 AI 编码 Agent 的任务 |
| **Job Performer** | 独立开发者 / 毕设作者（林远） |
| **Job 类型** | 主 Job（Functional 为主，Emotional/Social 支撑答辩） |
| **竞品 Job 归属** | Multica 覆盖编排 Job；Cursor/Devin 覆盖执行 Job；Wiki 工具覆盖知识 Job — 本毕设要**合并编排 Job** 并为知识/记忆 Job 预留入口 |

---

## Job Performer

**林远** — 熟悉 TS 全栈与 Agent CLI，一人维护毕设代码库与论文。不是工程经理，不需要多租户权限；需要的是**个人指挥中心**，而非团队协作 SaaS。

**Confidence：High**（`PRODUCT-BRIEF`、`problem-statement`）

---

## The Circumstance

**When** 我同时在本地跑多个 AI 编码 CLI（Claude Code、Pi、opencode），且毕设进入 PRD/原型/答辩准备阶段，  
**And** 每个 CLI 的对话窗口互不连通、任务进度无法一屏汇总，  
**And** 我需要向导师证明「编排 + 项目 Wiki + 记忆」的一体化设计，  
**Then** 这个 Job 被触发。

**频率：** 每日多次（编码、调研、文档、答辩排练）  
**Confidence：Medium**（频率为推断；情境为项目文档明示）

---

## Job Statement

> **When** 我在本地推进软件工程任务并依赖多个 AI Agent CLI，  
> **I want to** 用 Issue 看板分配、追踪任务，并通过 Squad 队长自动委派专精 Agent，  
> **So I can** 在一屏内看清进度、减少上下文复制，并在答辩时演示完整的 Agent 编排闭环。

---

## Functional Job

### 主 Functional Job

**把「Agent 任务」当作可分配、可追踪的 Issue，并完成状态流转与上下文聚合。**

| 子任务 | Done 的定义 | MVP Must 映射 |
|--------|------------|---------------|
| 创建并编排任务 | Issue 出现在看板，可拖拽/切换 backlog→running→done | Issue 看板 |
| 委派执行者 | 指派 Agent / Squad；Squad 时队长收到 briefing | Squad + @mention |
| 配置 Agent 能力 | 名称、系统指令、runtime、skills、MCP 入口 | Agent CRUD |
| 导入并分配 Skill | URL 导入 skill，绑定到特定 Agent | Skill URL 导入 |
| 查看任务全史 | Issue 详情页时间线聚合 comment/状态变更 | Issue 详情时间线 |
| 浏览项目知识 | Wiki 树形导航 + 页面阅读（mock） | Wiki 浏览器占位 |
| 导航工作区 | 侧栏切换 Issue/Agent/Wiki；右侧上下文面板 | Multica 三栏布局 |

### 成功标准（来自 problem-statement）

- PRD Must REQ 100% 有 AC
- 原型 4 条主路径可点通：看板 / Issue / Agent / Skill
- 导师 10 分钟可复述差异化

**Confidence：High**

---

## Emotional Job

| 想要的感觉 | 想要避免的感觉 |
|-----------|---------------|
| **掌控感** — 像项目经理一样知道每个 Agent 在干什么 | 焦虑 — 不知道 Agent 是否卡住、是否重复劳动 |
| **专业感** — 答辩时有 polished 的可交互 demo | 尴尬 — 只能展示终端截图或架构 PPT |
| **简洁感** — 一个控制台替代五个窗口 |  overwhelmed — scope 膨胀导致做不完 |

**Confidence：Medium** — 基于毕设作者常见情绪推断，无访谈 verbatim

---

## Social Job

| 维度 | 期望 |
|------|------|
| **对导师** | 被视作「有系统思维、懂 Related Work、能工程落地」 |
| **对同行/开源社区** | 展示对 Multica 等前沿编排模式的深度理解（非简单 fork） |
| **身份** | 「编排 + 知识 + 记忆」四层架构的设计者，而非「又一个 ChatGPT wrapper」 |

**Confidence：Medium**

---

## Competing Solutions（当前「雇佣」的方案）

| 方案 | 如何完成 Job | 不足 |
|------|-------------|------|
| **Multica** | Issue 看板 + Squad + 14 CLI + Skill + WS 进度 | 缺 Wiki/Memory 联动；云端+daemon 架构对毕设过重 |
| **Cursor / Claude Code（单 CLI）** | IDE/终端内对话式编码 | 无 Issue 生命周期、无 Squad 委派、无项目 Wiki |
| **OpenHands** | 自主 Agent + 子 Agent task tool | 偏执行层；看板/小队编排弱 |
| **Devin** | 云端自主 PR | 非本地；贵；Issue 编排非核心 |
| **Hermes + Kanban 插件** | SQLite 看板 + gateway | UI/产品化不足；20+ gateway 超 scope |
| **WeKnora / llm-wiki** | RAG + Wiki / AGENTS.md 工作流 | 缺 Issue 驱动编排 |
| **手动（Notion + 终端）** | 人工记任务 + 复制 prompt | 无自动化、不可答辩演示 |
| **本毕设 MVP 原型** | Multica 式 UI mock + 四层架构叙事 | 本次不含真实执行 — **有意 trade-off** |

---

## Hiring Criteria（Must vs Nice）

### Must-have（不妥协 — 来自 PRODUCT-BRIEF）

1. Issue 看板 + 详情时间线
2. Squad 队长路由 + @mention 委派语义
3. Agent CRUD（含 runtime / skill / MCP 入口）
4. Skill URL 导入 + 按 Agent 分配
5. Multica 式三栏布局
6. Wiki 浏览器占位（mock）
7. **纯本地、单用户** — 无云端依赖

### Nice-to-have（Should — 原型可选）

- Autopilot / cron 配置 UI（表单）
- Memory 检索面板（mock）
- Workspace 设置（repo 路径、AGENTS.md 预览）

### Won't hire for（明确拒绝）

- 真实 CLI 子进程执行
- PostgreSQL / WebSocket 实装
- 14 CLI 全量路由
- 企业 RBAC / 多租户

**Confidence：High**（直接来自 PRODUCT-BRIEF MoSCoW）

---

## Insights and Implications

### 洞察 1：Job 的核心是「编排可见性」，不是「Agent 智商」

Multica 文档与 `design/architecture.md` 一致：**Squad + Issue 时间线**是差异化体验，执行层可绑定现有 CLI。MVP 原型应优先做「看得见、点得通」的编排 UI，而非真实 spawn。

### 洞察 2：Wiki/Memory 是论文创新 Job，但 MVP 只需「占位证明」

用户 Impact 明确提到知识随会话消失；但 PRODUCT-BRIEF Won't 本次实装 ingest。JTBD 含义：**答辩 Job** 需要 Wiki 浏览器证明知识层存在，mock 即可。

### 洞察 3：Squad 是 multica 最亮眼的 Job 完成机制

Leader briefing + @mention 闭环（`references/deep/multica.md` §3）应成为原型 demo 的**高光路径**，而非仅展示 flat Agent 列表。

### 洞察 4：与 Multica 的 Job 差异在「一体化本地知识栈」

| 维度 | Multica | 本毕设 |
|------|---------|--------|
| 编排 Job | ✅ 完整 | ✅ MVP mock |
| 执行 Job | ✅ 14 CLI daemon | ❌ Phase 1+ |
| 知识 Job | ❌ 无 | ✅ 占位 + 论文创新 |
| 记忆 Job | ❌ 无 | ✅ Phase 2+ |

### PRD 含义

- REQ 应围绕 **Must Job 完成路径** 写 AC，每条 AC 对应林远可演示的一步
- Squad demo 路径：创建 Squad → Issue 指派 Squad → 时间线见 leader comment → @mention 成员
- 不要为 Should/Won't 写详细 AC

---

## Supporting Quotes（来源标注）

| 引用 | 来源 | 类型 |
|------|------|------|
| 「缺 Issue 驱动 + 小队委派 + 项目 Wiki + 跨会话记忆的一体化本地控制台」 | `PRODUCT-BRIEF` Q2 | 事实 |
| 「一个 issue = 一个任务的所有推进」 | `design/architecture.md` | 事实 |
| 「Squad 是 multica 最亮眼的设计」 | `design/architecture.md` ★★★★★ | 事实（作者判断） |
| 「Turn coding agents into real teammates — assign tasks, track progress, compound skills」 | [Multica GitHub](https://github.com/multica-ai/multica) | 外部事实 |

---

## Questions for Further Research

- [ ] 原型 demo 是否需要一个「预置 Squad」场景（产品小队）以降低答辩操作步骤？
- [ ] Skill 导入 mock 是否展示 GitHub URL 解析 UI，还是仅列表 + 分配？
- [ ] Issue 状态枚举用 Multica 完整集还是简化为 backlog/running/done？
