# Spec: Issue 查找（CmdK + 服务端筛选 + 标签软归档）

**Status:** resolved  
**Feature slug:** `issue-find`  
**Branch:** `feat/issue-find`  
**Role:** Slice Owner（短对齐已拍板；默认不满血 grill）

**Product north star:** [AGENTS.md](../../AGENTS.md) · [CONTEXT.md](../../CONTEXT.md) · roadmap Phase 5+「少摩擦找工作」  
**上一刀 intake：** `app/.progress/issue-labels-intake.md`（**有条件通过**，PR #19 已合 main）

## Problem Statement

1. 看板标签筛选与 CmdK 搜 Issue **只在客户端**过滤全量 list，薄且与「服务端契约」债不一致。  
2. 删除 label **硬 cascade**，误删成本高。  
3. CmdK 已有导航 + 本地 issue 串匹配，但无服务端 q、无 Agents 跳转、无键盘上下选择。

## Solution（一刀可演示）

操作者用 **Ctrl+K + 看板** 快速找到 Issue；标签可 **软归档**（清挂载）；筛选/搜索在 **服务端** 生效。

### Must

1. **`GET /api/issues?q=&labelId=&status=`** — `q` 匹配 identifier / title（可选 description 子串）；`labelId` 只返回挂了该标签的 issue。  
2. **标签软归档** — `issue_label.archived_at`；`DELETE /api/labels/:id` = 软归档 + **清 junction**；目录默认仅活跃；挂载只认活跃标签。  
3. **看板** — label pill + 搜索框走同一 query；URL mirror `?label=&q=`。  
4. **CmdK** — 有查询时服务端搜 Issue；分组：导航 / Issues / Agents（名匹配跳转）；↑↓ + Enter。  
5. **CONTEXT** — prev=`issue-labels` intake；本刀=`issue-find`。  
6. typecheck + API smoke（+ 浏览器点一次若环境允许）。

### Out of Scope

- 全文引擎 / 拼音 / 跨 workspace  
- 父子 Issue、附件、Agent/Skill 标签  
- Wiki/Memory 语义搜进 CmdK（仅固定导航）  
- 标签物理删除 / 回收站大页 / 取消归档 UI（API 层 archived_at 即可；本刀不强制 unarchive UI）  
- usage 成本面板  

### 拍板记录

| # | 决策 |
|---|---|
| slug | `issue-find` |
| 归档 junction | **清掉挂载** |
| CmdK Agents | **要**（客户端 agents 列表名匹配） |

## Acceptance

1. migrate 后 `archived_at` 存在；seed 标签默认活跃  
2. `GET /api/issues?labelId=lbl-product` 子集正确；`?q=FRI-11` 命中  
3. DELETE label → 204；目录默认不再出现；相关 issue.labels 无该标签  
4. 看板 pill / 搜索与 API 一致  
5. CmdK 可键入进 Issue 与 Agent 详情  
6. `pnpm typecheck`（app）绿；回归 issues/labels/settings/wiki/memory/runs/inbox 200  

## Comments

- 补偿上一刀 intake 债，与 B 加厚同刀，不另开薄债刀。  
