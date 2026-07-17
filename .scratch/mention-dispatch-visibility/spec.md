# Spec: @提及派发可见性

**Status:** resolved  
**Slug:** `mention-dispatch-visibility`  
**Branch:** `main`（直推）  

## Problem

comment-trigger 已会 enqueue，但时间线看不出「@ 了谁、有没有派上」——Multica 体验的核心感知缺口。

## Must（已交付）

1. `triggerFromComment` 返回 `MentionDispatch[]`  
2. 有 mention 时写系统 comment「📣 @提及派发」+ 每目标一行  
3. POST comment 响应带 `dispatches`；前端 toast + invalidate comments/runs  
4. Timeline：`@提及` / `派发` badge  
5. Playwright + typecheck  

## Multica 对照（短）

| | Multica | 本仓 |
|---|---|---|
| mention → 排任务 | computeCommentAgentTriggers | comment-trigger ✅ |
| 操作者可见派发 | 任务/时间线强 | **本刀补系统总结 comment** |
| leader briefing | claim 注入 | prompt.ts 已有（非本刀） |
