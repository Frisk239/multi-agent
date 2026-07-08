---
artifact: problem-statement
version: "1.0"
created: 2026-07-08
status: draft
---

# Problem Statement: 面向软件工程的本地 Agent 编排与项目知识平台

## Problem Summary

软件工程者在本地使用多个 AI 编码 CLI（Claude Code、Pi、opencode 等）时，缺乏统一控制台来编排任务、委派小队、追踪 Issue 时间线，并将执行产出沉淀为可版本化的项目 Wiki 与跨会话记忆。现有工具各自解决编排、执行、RAG 或记忆之一，无法形成「任务 → 执行 → 知识累积」闭环。

## User Impact

### Who is affected?

- **主要用户**：独立开发者 / 毕设作者（本地单用户）
- **次要受众**：答辩导师与评审（需快速理解系统价值与差异化）

### How are they affected?

- 任务分散在多个 CLI 窗口与聊天记录中，无法一屏看清进度
- 小队协作需手动复制上下文，队长无法自动路由给专精 Agent
- 项目知识随会话消失，重复踩坑；RAG 检索缺乏 Issue 生命周期驱动

### Scale of impact

- 频率：每日多次 Agent 任务（编码、调研、修复）
- 严重度：毕设答辩需可演示端到端闭环；无原型则难以传达设计价值

## Business Context

### Strategic Alignment

毕设目标：**面向软件工程的 Agent 编排 + 项目 Wiki + 跨会话记忆** 四层架构，论文创新点在 Wiki/Memory 与编排事件联动。

### Business Impact

- 交付物：PRD、RTM、可交互原型 → 支撑开题/中期/答辩
- 降低 Phase 0–1 返工：先对齐 Must 边界再写 `app/`

### Why Now?

- `D:\code\multi-agent` 已完成 12 项目调研与 Multica/Hermes/Pi 源码深读
- 技术栈已锁定 TS 全栈；缺产品化规格与视觉原型

## Success Criteria

| Metric | Current Baseline | Target | Timeline |
|--------|-----------------|--------|----------|
| PRD Must REQ 覆盖率 | 0 | 100% Must 有 AC | Issue 关闭前 |
| 原型 Must 路径可点通 | 0 | 看板+Issue+Agent+Skill 4 条主路径 | Issue 关闭前 |
| 导师 10 分钟理解度 | 未测 | 读 PRD 摘要 + 点原型即可复述差异化 | 答辩前 |

## Constraints & Considerations

- **输出路径固定**：所有产物写入 `D:\code\multi-agent\chanpin\`
- **输入真源**：`D:\code\multi-agent\design/`、`references/`、`concepts/`（只读引用，不修改）
- **视觉参考**：Multica 控制台布局、Trello 式看板、Skill 导入、Agent 定义
- **纯本地**：无云端、单用户；原型用 mock 数据
- **一人开发**：PRD Phase 分优先级，避免 Phase 4 细节绑架 MVP

## Open Questions

- [ ] Cursor headless/CLI 能力是否纳入 Phase 1 runtime？（PRD 标为 TBD）
- [ ] 原型默认暗色还是跟随 Multica 当前主题？
- [ ] Wiki 浏览器 MVP 用 mock 几页即可，还是需与 `llm-wiki-pattern` 目录结构一致？
