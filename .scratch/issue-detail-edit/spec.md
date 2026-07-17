# Spec: Issue 详情标题与描述可编辑

**Status:** resolved  
**Feature slug:** `issue-detail-edit`  
**Branch:** `feat/issue-detail-edit`  
**Role:** Slice Owner（逐步迭代 → Multica 级本地体验；本刀填「详情写路径」）

**上一刀 intake：** `app/.progress/board-priority-triage-intake.md`（通过，PR #22）

## Problem Statement

看板能筛字/标签/指派/优先级，详情可改 status/assignee/priority/labels，但 **title 与 description 只读**。日常改卡文案断掉，体验远于 Multica / 原型「点开就能改」。

## Solution

详情页 **内联编辑标题与描述** → `PUT /api/issues/:id`（已有）→ 详情与看板卡片同步。

### Must

1. 标题：展示态点击进入编辑；Enter 保存、Esc 取消；空标题不可提交  
2. 描述：展示态（Markdown 渲染）/ 编辑态 textarea；保存 / 取消；允许清空 → `null` 或 `""` 与 API 一致  
3. 复用 `useUpdateIssue`；invalidate/乐观已有  
4. typecheck + API smoke（PUT title/description）+ 可选浏览器点一次  

### Out of Scope

- 富文本 WYSIWYG、附件、标题历史  
- 评论编辑、bulk 编辑  

### 对标

- Multica / 原型：详情标题与描述是主写面（本仓 API 已具备，只欠 UI）  
- 无需满血 grill；无需通读 upstream（契约已存在）

## Acceptance

1. 详情改 title → GET issue + 看板卡标题更新  
2. 改 description → 详情展示更新；可清空  
3. 空 title 保存失败有提示、不落脏数据  
4. typecheck 绿  
