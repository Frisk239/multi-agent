# Closeout: G9-2 Skills 日用闭环

日期：2026-08-19  
Slug：`g9-2-skills-loop`

## 用户路径

`/skills?source=builtin` → chip 写「内置」→ 打开 `ma-planning` 详情来源诚实 → Agent 能力页可搜勾选。

## 交付

- 来源文案四分（内置/用户/工作区/项目）；`useSkill` 不再把 source 收成 user|project
- 详情 usedBy 深链 Agent
- Agent Skills 绑定可搜索 + 来源标记

## 证据

- web typecheck + Skills/Detail/label 24 passed
- Playwright `e2e-g9-skills-loop.mts` PASS（刷新索引后 7 个 builtin）
