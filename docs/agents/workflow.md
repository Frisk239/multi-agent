# 工作流 — Slice Owner × 子代理调研 × Matt skills

> 技能总路由：`/ask-matt`。  
> **默认编排（2026-07-17）：** 人 → **Slice Owner 一会话一切片** → 做绿 → handoff；合码前 **新会话 code-review**。  
> **不再默认** 计划者主代理 / 执行者子代理双角色（见 [ADR 0001](../adr/0001-slice-owner-and-research-subagents.md)）。  
> **产品立场：** 真实产品；优先级 = 日常使用价值（见 `AGENTS.md`、`design/roadmap.md` Phase 5+）。

## 模型

```
人点主题
   │
   ▼
┌─────────────────────────────┐     「去调研 / 对齐 multica」
│  Slice Owner 会话           │ ──────────────────────────► 调研子代理 /research
│  短对齐 · implement · 自测  │ ◄──── 只要摘要+出处 ────────┘
│  可写 app/** · push feat/*  │
└─────────────┬───────────────┘
              │ 窗满 / 一刀未完
              ▼
         /handoff → 下一 Owner 会话（同切片续作或下一票）
              │
              ▼ 自测够
         人开 PR → 新会话 /code-review → 人合 main
```

| 会话 | 干什么 | 典型 skills |
|---|---|---|
| **Slice Owner** | 对齐 + 实现 + 自测 + 文档进度 | `/implement`、`/tdd`、短对齐；需要时 `/to-spec` `/to-tickets` |
| **调研子代理** | 读 deep/repos/网上，**不占 Owner 窗** | Agent explore、`/research`、`agent-reach`（若适用） |
| **Code-review** | Standards + Spec 审 diff | `/code-review` |
| **人** | 点题、派续作、合 PR | — |

## Grill 与调研

- **满血 grill-with-docs：** 仅领域词/难逆决策/真雾；默认产品刀用**短对齐**。  
- **「去调研」：** Owner **必须**倾向派子代理；回收「结论 / 选项 / file:line / 与本仓差异」，禁止在 Owner 窗通读上游。  
- 宪法「先查参考项目」= 决策质量要求；**阅读动作**默认外包给子代理。

## 主链路（一刀）

```
【Owner 会话】
  读 AGENTS + CONTEXT + 既有 .scratch/ticket/handoff
  若需上游细节 → 派调研子代理
  短对齐（或沿用已有 spec）
  /implement → 证据 → push feat/*
  未完 → /handoff

【人】开 PR

【新会话】/code-review → 【人】合 main
```

**窗不够装一整刀：** 按 **ticket 厚度** 拆下一会话（01 完 → handoff → 02），**不要**拆成「计划者会话 + 执行者会话」。

## 铁律

- Owner **可以**写 `app/**`（在 feature 分支）。  
- **禁止** push main；`app/**` 必 PR + 新会话 review。  
- 调研子代理默认 **只读** 上游与仓库；实现仍回 Owner（除非人明确同一任务授权）。  
- 不假设跨会话聊天记忆；只信 ticket / handoff / 调研笔记。

## 产物路径

| 产物 | 路径 |
|---|---|
| Spec / 票 | `.scratch/<feature>/` |
| 进度 / handoff 档案 | `app/.progress/` 或 `/handoff` |
| ADR | `docs/adr/` |
| 调研摘要 | ticket 评论、短 docs 笔记、子代理终报 |

## 与旧 superpowers / 双角色对照

| 旧 | 现 |
|---|---|
| 计划者 grill + 验收，不写代码 | Owner 一体；审查靠 **code-review 会话** |
| 执行者新会话只 implement | Owner 直接 implement；续作靠 handoff |
| brainstorm 轻 | grill 深 → **少用满血 grill**；调研外包 |
| 双角色串行会话 | **一切片一会话**（默认） |

## Git

- `feat/<slug>` 提交；`docs:` 可进 main  
- 合码：人 + PR + 新会话 `/code-review`
