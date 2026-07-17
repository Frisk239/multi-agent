# ADR 0001 — Slice Owner 会话 + 调研子代理

- **Status:** Accepted  
- **Date:** 2026-07-17  
- **Deciders:** 人（产品/工程）+ 工作流修订  

## Context

本仓曾采用 **计划者主代理 + 执行者子代理**（来自 superpowers 时代的质量/上下文策略）：计划者只 grill/拆票/验收且不写 `app/**`，执行者清上下文实现。

迁到 Matt skills 后出现两件事：

1. **`/grill-with-docs` 很深**，计划者会话常在进 implement 前已占用大量 smart zone；再开执行者 = 双倍固定成本。  
2. 人对 **参考项目**（multica 等）不必与 agent 同深；若在 Owner 窗内联调研，会进一步挤爆实现上下文。

单人项目里，「无实现偏见的验收」可用 **PR + 新会话 `/code-review`** 替代「计划者人格」。

## Decision

1. **默认编排改为 Slice Owner：** 一个会话负责一个垂直切片（或该切片的一张 frontier 票）——对齐、实现、自测、handoff；**允许写 `app/**`**（feature 分支）。  
2. **取消默认的计划者/执行者双角色**与「计划者禁止写业务代码」铁律。  
3. **满血 grill 非默认：** 产品刀优先短对齐；grill-with-docs 留给领域/难逆决策。  
4. **调研默认子代理：** 用户要求调研/对齐参考实现时，派子代理或 `/research` 读 `references/deep` 与 `references/repos`，Owner 只合并**短摘要 + 出处**；禁止为调研在 Owner 窗灌入大段上游源码。  
5. **偏见隔离**改为：一切 `app/**` 经 PR + **新会话 code-review** 再合 main。  
6. 多会话拆分仅因 **切片厚度 / 窗口**，不因角色名。

## Consequences

### Positive

- 省去「计划者半窗 + 执行者重读」税，implement 更早发生。  
- 调研深度与实现上下文解耦；人对上游理解不必陪跑全文。  
- 审查会话仍然无实现记忆。

### Negative / Trade-offs

- Owner 会话若既深 grill 又实现，仍可能糊；需纪律：**调研外包、grill 宜短**。  
- 失去「计划者从不看自己写的代码」的弱保证——用 code-review 会话补。  
- 历史 handoff / 文档仍出现计划者/执行者字样；以本 ADR + `AGENTS.md` 为准。

### 不改变

- 垂直切片、feature 分支、不写 main、先查参考再决策（阅读可外包）。  
- 本地 `.scratch` 工单与 Matt skills 工具层。

## Alternatives considered

| 方案 | 为何未选 |
|---|---|
| 保留双角色但缩短 grill | grill 深度由 skill 结构决定，难稳定压到「轻 brainstorm」 |
| 一切片多会话但保留计划者验收 | 仍付角色切换税；与单人 PR review 重复 |
| Owner 窗内联通读 upstream | 与「省上下文」目标相反 |
