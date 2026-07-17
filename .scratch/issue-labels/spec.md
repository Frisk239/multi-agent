# Spec: Issue 标签（工作项厚度 · 轻量）

**Status:** resolved  
**Feature slug:** `issue-labels`  
**Branch:** `feat/issue-labels`  
**Role:** Slice Owner（候选 A 已拍板；短对齐；默认不满血 grill）

**Product north star:** [AGENTS.md](../../AGENTS.md) · [CONTEXT.md](../../CONTEXT.md) · [design/roadmap.md](../../design/roadmap.md) Phase 5+「工作项厚度」  
**来源：** phase4b 能力包 **H** 产品演进版（只做 labels + 筛选；**不做** attach / parent）。

**上一刀 intake：** `app/.progress/wiki-memory-ops-intake.md`（有条件通过，PR #18 已合 main）

## Problem Statement

看板只有 status 列与 priority 点；日常无法用「bug / 文档 / 产品」等维度过滤与标注。  
原型有 board filter 概念，但 app 侧 **无 label 模型**。multica 有 `issue_label` + `issue_to_label`（issue 专用，后续才扩展 resource），本仓可对齐其**简化版**。

## Solution

一刀可演示：

1. DB：`issue_label`（工作区目录）+ `issue_to_label`（多对多）。  
2. API：标签 CRUD；Issue 挂载/替换标签集合；`Issue.labels[]` 出现在 list/detail。  
3. UI：卡片 chip；详情增删标签；看板按 label 筛选。  
4. Seed：3 个预置标签 + 挂到样例 Issue。

## User Stories

1. As an operator, I want a workspace label catalog, so that I can reuse names/colors.  
2. As an operator, I want to attach labels to an Issue, so that work is classifiable.  
3. As an operator, I want chips on the kanban card, so that labels are visible without opening detail.  
4. As an operator, I want to filter the board by label, so that I can focus one stream.  
5. As a developer agent, I want typecheck + API smoke for labels/issues.

## Implementation Decisions

| Seam | 角色 |
|---|---|
| **S1** Schema + migration `0012` | `issue_label` / `issue_to_label` |
| **S2** Shared types | `IssueLabel`；`Issue.labels`；create/update/set inputs |
| **S3** API | `/api/labels` CRUD；`PUT /api/issues/:id/labels` 全量替换 |
| **S4** reshape | list/detail 批量装载 labels（避免 N+1 裸循环写库） |
| **S5** Web | hooks；Kanban 筛选；IssueHeader 编辑；IssueCard chips |
| **S6** Seed | 3 labels + 若干 junction |

### 参考

- multica `issue_label` / `issue_to_label`（`001_init.up.sql:75-86`）— **本刀仅 issue**，不做 agent/skill resource_type。  
- 单工作区 `ws-local`；名称在 workspace 内唯一（大小写敏感即可，SQLite 简单 unique）。

### Out of Scope

- 父子 Issue / dependency  
- 附件路径 / 上传  
- Agent/Skill 标签  
- 独立「标签设置」大页（详情内创建+挂载即可；可选看板旁管理）  
- 多 workspace 管理 UI  

## Acceptance 画像

1. migrate 后有表；seed 有 ≥3 label  
2. CRUD labels + set issue labels API 绿  
3. Issue list/detail 带 `labels`  
4. 看板可按 label 过滤；卡片可见 chip  
5. 详情可挂载/移除  
6. `pnpm -r typecheck` 绿；issues/labels 回归  

## Comments

- 人选定候选 A（2026-07-17）。  
- 补偿债：`wiki-memory-ops-intake` + CONTEXT 方位同分支更新。  
