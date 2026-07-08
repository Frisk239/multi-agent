# Sources — 调研引用与 Confidence

> 2026-07-08 · Step 1 调研交付物

---

## 本地真源（High Confidence）

| 路径 | 用途 |
|------|------|
| `chanpin/PRODUCT-BRIEF.md` | MoSCoW Must/Should/Won't 边界 |
| `chanpin/docs/problem-statement.md` | 问题陈述、成功标准 |
| `design/architecture.md` | 四层架构、体验优先级、差异化 |
| `design/synthesis.md` | TS 架构、Multica 移植要点、Pi 定位 |
| `design/roadmap.md` | Phase 规划（未展开到 MVP） |
| `references/deep/multica.md` | Multica 源码级：状态机/Squad/Autopilot/Daemon |
| `references/catalog.md` | 12 参考项目矩阵 |
| `references/orchestration.md` | 编排层摘要 |
| `references/wiki.md` | 知识层摘要 |
| `references/memory-and-skills.md` | 记忆与 Skill 摘要 |
| `concepts/llm-wiki-pattern.md` | Wiki 理论模式 |

---

## 外部公开来源

| 来源 | URL | 引用内容 | Confidence |
|------|-----|----------|------------|
| Multica 官网 | https://www.multica.ai/ | 定位、任务生命周期、12 CLI 检测 | High |
| Multica GitHub | https://github.com/multica-ai/multica | tagline、开源托管 | High |
| Multica Docs — How it works | https://multica.ai/docs/how-multica-works | Server/Daemon/CLI 三层架构 | High |
| Multica Docs — Agents | https://multica.ai/docs/agents | Agent 一等公民、@mention、Skill | High |
| Multica Docs — Create agent | https://multica.ai/docs/agents-create | 创建流程、Skill 导入渠道 | High |
| OpenHands Task Tool Set | https://docs.openhands.dev/sdk/guides/task-tool-set | 子 Agent 同步执行模型 | Medium |
| Devin vs Cursor 对比 | https://awesomeagents.ai/tools/devin-vs-cursor-2026/ | 自主 vs 交互定位 | Medium |
| AI Agent 编排对比 2026 | https://amux.io/guides/background-agents-compared/ | 背景 Agent 分类 | Medium |

---

## 推断与假设（Low–Medium Confidence）

| 结论 | 类型 | 说明 |
|------|------|------|
| 林远每日多次 Agent 任务 | 推断 | 无用户访谈 |
| 导师 10 分钟理解度权重 | 推断 | 来自 problem-statement 目标 |
| Cursor/OpenHands 看板能力 Partial | 推断 | 基于产品公开能力，非完整 UX 审计 |
| 2026 Agent 市场三层分化 | 推断 | 综合多篇第三方文章 |

---

## 未验证 / Open

- [ ] Multica 当前 UI 默认主题（暗/亮）
- [ ] Cursor headless API Phase 1 纳入与否
- [ ] 竞品定价精确数字（本次 MVP 不依赖）

---

## 交付物索引

| 文件 | 内容 |
|------|------|
| `personas.md` | 林远（主）+ 答辩导师（次） |
| `jtbd.md` | 主 Job + Must Hiring Criteria |
| `competitive-analysis.md` | 5 竞品矩阵 + 2×2 定位 |
| `multica-feature-matrix.md` | Must 级 Multica 对标 + PRD REQ 建议 |
| `sources.md` | 本文件 |
