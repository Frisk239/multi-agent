# Persona — 毕设 Multi-Agent 平台

> 模式：Product Persona · v2.5 · 2026-07-08  
> 对齐：[PRODUCT-BRIEF.md](../PRODUCT-BRIEF.md) Must 范围 · 本地单用户

---

## 核心现实（One-liner）

**林远** 是一人毕设作者，每天在多个 AI 编码 CLI 窗口间切换，需要一屏看清 Issue 进度、委派专精 Agent，并在答辩前用可点原型证明「编排 + Wiki + 记忆」的差异化。

---

## 元数据

| 字段 | 值 |
|------|-----|
| 角色名 | 林远（Lin Yuan） |
| 模式 | Product |
| 主要用户 | ✅ 是 |
| 次要受众 | 答辩导师 / 评审（只读理解，非操作者） |
| 部署场景 | 纯本地 · 单 Workspace · 无多租户 |
| 技术栈熟悉度 | TypeScript 全栈 · 已深读 Multica/Hermes/Pi 源码 |
| 不包括 | SaaS 买家、企业 IT 采购、20+ 消息 gateway 用户 |

---

## Persona Card

| | |
|---|---|
| **姓名** | 林远，24 岁，计算机专业研二 |
| **身份** | 独立开发者 / 毕设作者 |
| **目标** | 12 个月内交付可答辩的 Agent 编排 + 项目 Wiki + 记忆平台 |
| **当前工具** | Cursor、Claude Code CLI、Multica（参考）、本地 Markdown Wiki |
| **一句话** | 「我想像管队友一样管 Agent，而不是在五个终端里复制粘贴上下文。」 |

---

## 1. 背景与情境

林远已在 `D:\code\multi-agent` 完成 12 个参考项目调研与 Multica/Hermes/Pi 源码深读（见 `design/synthesis.md`）。技术路线已锁定 TS 全栈 + 多 Backend adapter，但缺**产品化 PRD** 与**可演示原型**支撑开题/中期/答辩。

**触发场景（高频）：**
- 接到一个新功能需求（如「给 Issue 加 Squad 委派 UI」）→ 需先对齐 Must 边界再写代码
- 导师追问「你和 Multica / Cursor 的差异是什么」→ 需 10 分钟内讲清四层架构创新点
- 日常编码任务（修 bug、写调研、生成 Wiki 草稿）→ 希望 Issue 时间线一屏聚合

**证据来源：** `PRODUCT-BRIEF.md` 7 问诊断、`docs/problem-statement.md` 用户影响、`design/architecture.md` 问题定义。  
**Confidence：High** — 来自项目自述与队长签核 brief，非外部访谈。

---

## 2. 目标与动机

| 类型 | 描述 |
|------|------|
| **功能目标** | 用 Issue 看板追踪 Agent 任务；Squad 队长自动路由；Skill 按 Agent 分配 |
| **学习/答辩目标** | 论文 Related Work 有竞品矩阵；demo 可点通 Must 路径 |
| **效率目标** | 减少跨 CLI 窗口复制上下文；Issue 时间线 = 任务全部推进记录 |
| **长期目标（10 星）** | 纯本地 Multica 级编排 + Wiki ingest + 可插拔 Memory + ablation 实验 |

---

## 3. 行为模式

1. **Issue 驱动工作流**：每个任务建 Issue → 指派 Agent 或 Squad → 在 comment 时间线看进度（对齐 Multica 使用反馈，`design/architecture.md` ★★★★★）
2. **队长委派模式**：对 Squad 队长下 brief，期望队长通过 @mention 分给专精成员，而非自己全包（Multica squad briefing 模式）
3. **Skill 复利**：从 URL/GitHub 导入 skill，绑定到不同 Agent（调研 Agent vs 编码 Agent）
4. **文档先行**：先 PRD/原型对齐，再写 `app/` 生产代码（`PRODUCT-BRIEF` 反目标明确）
5. **答辩准备**：定期需要「可截图/可点击」的 UI 证明设计，而非纯架构图

---

## 4. 痛点与摩擦

| 痛点 | 严重度 | 现有替代 | 缺口 |
|------|--------|----------|------|
| 任务分散在多个 CLI 聊天窗口 | 高 | 手动记笔记 / Notion | 无 Issue 生命周期视图 |
| 小队协作需手动复制上下文 | 高 | 单 Agent 全干 | 无队长路由 + briefing |
| 项目知识随会话消失 | 中 | 本地 Markdown / mem0 单独用 | 无 Issue 事件驱动 Wiki |
| 工具碎片化（编排/执行/Wiki/记忆各一套） | 高 | 分别用 Multica + CLI + Wiki repo | 缺一体化本地控制台 |
| 毕设 scope 易膨胀 | 高 | 无 | 需 MoSCoW 硬边界 |

---

## 5. 决策模式与质量门槛

- **Scope 敏感**：任何新功能先问「是否在 Must？」— 原型阶段拒绝真实 CLI 执行与 PostgreSQL
- **参考优先**：UI/交互默认对齐 Multica 三栏布局 + Trello 看板，不重新发明导航
- **可演示优先**：功能必须能在答辩现场 10 分钟内点通，mock 数据可接受
- **源码可信**：深读过的 Multica 模式（DB 行即锁、多态指派、Squad leader briefing）是设计真源
- **反模式**：不做云端托管、14 CLI 全量、企业 RBAC

---

## 6. 工具与环境

| 类别 | 当前 | 目标（毕设 MVP 原型） |
|------|------|----------------------|
| 编排 | Multica（参考） | 自研 UI mock：看板 + Issue 时间线 + Squad |
| 执行 | Claude Code / Pi / opencode | Agent 绑定 runtime（UI 配置，不真 spawn） |
| 知识 | llm-wiki 模式 + 本地 MD | Wiki 浏览器占位 + mock 页面树 |
| 记忆 | mem0/graphiti（调研） | Phase 2+；本次仅 Should 级 mock 面板 |
| IDE | Cursor | 不变 |

---

## 7. 与 Must 功能的关系

| Must 功能 | 林远怎么用 | 成功信号 |
|-----------|-----------|----------|
| Issue 看板 | 拖拽 backlog→running→done；点开详情看时间线 | 一屏看清今日 Agent 任务 |
| Squad 委派 | 创建「产品小队」，Issue 指派 Squad，队长 comment @ 调研 Agent | 模拟 multica leader briefing 路径 |
| Agent CRUD | 为「编码 Agent」「调研 Agent」配不同 system prompt + runtime + skills | 答辩时可展示差异化配置 |
| Skill URL 导入 | 从 GitHub URL 导入 gstack/ECC skill，分配给 Agent | 展示 skill 复利概念 |
| 三栏布局 | 左导航 / 中看板 / 右 Issue 或 Agent 上下文 | 导师一眼识别 Multica 风格 |
| Wiki 浏览器占位 | 浏览 mock 项目 Wiki 树（architecture、synthesis 摘要页） | 支撑「知识层」叙事 |

---

## 8. 次要 Persona：答辩导师（只读）

| 字段 | 描述 |
|------|------|
| **姓名** | 王教授（合成） |
| **目标** | 10 分钟内理解架构差异化与创新点 |
| **行为** | 读 PRD 摘要 + 点原型 Must 路径 + 看竞品矩阵 |
| **评判标准** | 问题定义清晰、Related Work 有对比、demo 可交互 |
| **Confidence** | Medium — 基于毕设通用评审模式推断，非真实访谈 |

---

## Evidence & Confidence

### Validated（有项目内证据）

- 单人开发者 / 毕设作者定位（`PRODUCT-BRIEF` Q1）
- 工具碎片化痛点（`problem-statement.md`）
- Squad / Issue 优先级最高（`architecture.md` 体验目标表）
- 纯本地、无 SaaS（`PRODUCT-BRIEF` 反目标）

### Assumed（合理推断，待用户验证）

- 每日多次 Agent 任务频率
- 导师 10 分钟理解度作为成功指标的具体权重
- 默认暗色 vs 亮色主题偏好（`problem-statement` Open Question）

### Open Questions

- [ ] Cursor headless 是否纳入 Phase 1 runtime 选项？
- [ ] Wiki mock 需要几页、是否对齐 `llm-wiki-pattern` 目录结构？
- [ ] 答辩 demo 是否需要英文界面选项？

### Governance

- PRD 队员应以本 persona 的 Must 表为验收视角
- 原型队员 3 必须保证林远的 4 条主路径可点通（`problem-statement` 成功标准）
