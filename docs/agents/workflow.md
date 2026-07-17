# 工作流 — idea → ship（本仓适配）

> 技能路由总览见本机 `/ask-matt`。本文是 **multi-agent 仓库专用**落地约定。

## 主链路（有代码库）

```
/grill-with-docs          把想法拷问清楚 → 维护 CONTEXT.md + 需要时 ADR
    ↓
（可选）/handoff → /prototype → /handoff   必须跑起来才能决的题
    ↓
  单会话能做完？
    ├─ 是 → /implement（内含 tdd 精神 + 结束 /code-review）
    └─ 否 → /to-spec → /to-tickets → 每个 ticket 新会话 /implement
```

**上下文卫生：** grill → spec → tickets 尽量同一窗口；每个 `/implement` **清上下文**，只读 ticket + CONTEXT。

## 大而雾

- `/wayfinder` — 决策票地图，产出 **决定** 不是功能；地图清晰后 **回到 `/to-spec`**，不要从 map 直接 implement。

## 入口匝道

| 情况 | Skill |
|---|---|
| 外来 bug/请求堆着 | `/triage` → `ready-for-agent` → `/implement` |
| 难 debug | `/diagnosing-bugs` |
| 不知道用哪个 skill | `/ask-matt` |
| 首次配本仓 skills | `/setup-matt-pocock-skills`（本仓已手配 `docs/agents/*`） |

## 与本仓旧习惯对照

| 旧（superpowers / 计划者-执行者） | 新 |
|---|---|
| brainstorming 会话 | `/grill-with-docs` 或 `/grilling` |
| writing-plans 长 plan.md | `/to-spec` + `/to-tickets`（tracer bullet 票） |
| 计划者验收 + 另派执行者 | 人编排；**一票一会话** `/implement` |
| `app/.progress/bu0N-impl-k.md` | ticket 内自测记录 + 可选 progress 笔记；跨会话用 `/handoff` |
| 厚切片 2 棒 impl | tickets 的 **Blocked by** 表达依赖；frontier 可并行（真无依赖时） |
| docs/superpowers/plans 逐步 checkbox | 票的 Acceptance criteria + implement |

## Git（不变）

- `app/**` 代码：`feat/<slug>` → PR → 新会话 `/code-review` → 合 main  
- 文档可 `docs:` 直接 main  
- Conventional Commits  

## 本地工单示例

```
.scratch/bu05-automation/
  spec.md
  issues/
    01-schema-dispatch.md    # Blocked by: None
    02-automation-ui.md      # Blocked by: 01
```

历史 `docs/superpowers/specs/2026-07-17-bu05-autopilot-design.md` 可在 `spec.md` 顶部链接为真源，避免复制两份。
