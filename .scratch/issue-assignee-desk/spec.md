# Spec: Issue 指派工作台（看板筛选 + 我的 issue）

**Status:** resolved  
**Feature slug:** `issue-assignee-desk`  
**Branch:** `feat/issue-assignee-desk`  
**Role:** Slice Owner（A1 已拍板；默认不满血 grill / 无需调研）

**Product north star:** [AGENTS.md](../../AGENTS.md) · [CONTEXT.md](../../CONTEXT.md)  
**上一刀 intake：** `app/.progress/issue-find-intake.md`（**有条件通过**，PR #20 已合 main）

## Problem Statement

看板能按字/标签找 Issue，但**不能按执行主体（Agent/Squad/未指派）筛**；侧栏原型有「我的 issue」，产品侧栏尚未落地。日常「只看某 agent 的活 / 只看未指派」仍靠肉眼扫全板。

## Solution（一刀可演示 · A1 厚路径）

操作者用 **看板指派筛选** 或侧栏 **我的 issue** 只看目标子集；详情改指派后列表刷新；筛选可 URL 分享。

### Must

1. **`ListIssuesQuery` 扩展**  
   - `assigneeType=agent|squad` + `assigneeId`（**成对**）  
   - `unassigned=1|true`（与具体 assignee **互斥**）  
   - `assigned=1|true`（任一 agent/squad 指派；与 unassigned / 具体 assignee **互斥**）  
   - 可与既有 `q` / `labelId` / `status` 组合  
2. **`GET /api/issues`** 服务端过滤（进程内 filter 即可，对齐 issue-find）  
3. **看板** — 指派 `<select>`（全部 / 已指派 / 未指派 / 各 agent / 各 squad）；URL 紧凑镜像 `?assignee=agent:<id>|squad:<id>|none|any`  
4. **侧栏「我的 issue」** — 进 `/?assignee=any`（已指派任一）；高亮与 Issues 区分  
5. **写路径** — 详情 `AssigneeSelect` 已有；改指派后 `issues` 前缀 invalidate（已有）即刷新筛选结果  
6. typecheck + API smoke；CONTEXT / progress 关刀材料  

### Out of Scope

- 真登录身份 / ACL / 「当前人」  
- 「我创建的」creator 筛选  
- saved views / FTS / priority 分诊  
- 改指派后的 run 语义重做  

### 拍板记录

| # | 决策 |
|---|---|
| 厚度 | **A1**：看板筛选 + 侧栏「我的 issue」 |
| URL | 紧凑 `assignee=` |
| slug | `issue-assignee-desk` |

## Acceptance

1. `GET /api/issues?assigneeType=agent&assigneeId=agt-prd` 子集正确  
2. `?unassigned=1` 仅未指派；`?assigned=1` 仅已指派  
3. 成对缺失 / unassigned 与 assignee 同传 → 400  
4. 看板切换指派后 URL 可刷新复现；可与 `q`/`label` 组合  
5. 侧栏「我的 issue」→ 已指派看板  
6. `pnpm typecheck` 绿；回归 issues/labels/settings/wiki/memory/runs/inbox 200  

## Comments

- 叠在 main（含 issue-find list query）上开刀。
