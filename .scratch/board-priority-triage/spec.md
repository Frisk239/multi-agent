# Spec: 看板优先级分诊

**Status:** resolved  
**Feature slug:** `board-priority-triage`  
**Branch:** `feat/board-priority-triage`  
**Role:** Slice Owner（候选 B；短对齐；无需调研/grill）

**上一刀 intake：** `app/.progress/issue-assignee-desk-intake.md`（有条件通过，PR #21 已合 main）

## Problem Statement

Issue 有 priority 字段、卡片可见、新建可选，但看板**不能按优先级筛**，详情**不能改**优先级，分诊路径断。

## Solution（一刀可演示）

操作者看板按 priority 筛选（URL 可分享）→ 打开详情改 priority → 列表/卡片同步。

### Must

1. `ListIssuesQuery.priority`（单值 `urgent|high|medium|low|none`）
2. `GET /api/issues?priority=` 服务端过滤；可与 q/label/assignee 组合
3. 看板 `?priority=` + select
4. 详情 `IssueHeader` priority select（复用 `UpdateIssueInput.priority`）
5. typecheck + API smoke；CONTEXT / progress

### Out of Scope

- 多选 priority、排序引擎、SLA/due、saved views

## Acceptance

1. seed 中 `?priority=high` 命中 FRI-11/09/05 等  
2. 非法 priority → 400  
3. 详情 PUT priority 后 GET 反映  
4. 看板 URL `?priority=high` 驱动 query  
5. typecheck 绿；回归 200  

## 拍板

| # | 决策 |
|---|---|
| slug | `board-priority-triage` |
| 过滤 | 单值 |
