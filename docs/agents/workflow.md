# 工作流 — 计划者/执行者 × Matt skills（本仓）

> 技能总路由：`/ask-matt`。  
> **编排不变：** 人 → **计划者主代理** → **执行者子代理**（可多棒串行）。  
> **工具换成 Matt skills：** 各角色会话内显式调用，不替代分工。

## 两层模型

```
                    ┌──────────── 人（编排 / 合 PR / 拍板）────────────┐
                    │                                                    │
                    ▼                                                    │
           ┌─────────────────┐     派票 / 收验收结论                      │
           │ 计划者主代理     │◄────────────────────────────────────────┤
           │ grill / to-spec │                                         │
           │ to-tickets      │     kickoff + 验收注意点                   │
           │ 验收 / 进度文档  │──────────────────┐                       │
           └─────────────────┘                  │                       │
                    ▲                           ▼                       │
                    │ 验收                  ┌──────────────┐            │
                    └───────────────────────│ 执行者子代理  │×N 串行     │
                                            │ /implement   │            │
                                            │ 自测 / push  │────────────┘
                                            └──────────────┘
```

| 层 | 谁 | 干什么 | 典型 skills |
|---|---|---|---|
| **编排** | 计划者主代理 | 想清楚、拆票、kickoff、验收、不写业务代码 | `/grill-with-docs`、`/to-spec`、`/to-tickets`、`/wayfinder`、`/handoff` |
| **执行** | 执行者子代理 | 按票实现、测绿、交证据 | `/implement`、`/tdd`、结束前可 `/code-review` 自检 |
| **审查** | 新人会话 | PR diff | `/code-review` |
| **人** | 你 | 开哪个会话、合 main | — |

## 主链路（多会话 feature）

```
【计划者会话】
  /grill-with-docs  →  CONTEXT.md / ADR
  （可选）/handoff → 新会话 /prototype → /handoff 回计划者
  /to-spec          →  .scratch/<feature>/spec.md
  /to-tickets       →  .scratch/<feature>/issues/0N-*.md
  写 planner kickoff（ticket 评论或 app/.progress/*-planner-0.md）

【人】派执行者 1（frontier 票，常是契约/API）

【执行者 1 会话】（清上下文）
  读 ticket + CONTEXT + AGENTS
  /implement → 自测 → 更新 ticket / 可选 impl handoff → push feat/*

【计划者会话】（可同会话续或新开）
  验收 → 通过则勾票 + 给执行者 2 的注意点

【人】派执行者 2 …

【计划者】整刀可 PR
【人】开 PR → 【新会话】/code-review → 【人】合 main
```

**单票小改：** 人可直接派执行者 `/implement`，计划者可省略；仍 PR + code-review。

## 角色铁律（与 AGENTS.md 一致）

- 计划者 **禁止** 写 `app/**` 业务实现（文档、进度、冲突标记清理除外）。  
- 执行者 **禁止** push main、禁止做未派发的票。  
- 票之间有接口依赖 → **串行**；`Blocked by` 写清。

## 产物放哪

| 产物 | 路径 |
|---|---|
| Spec | `.scratch/<feature>/spec.md` |
| Tickets | `.scratch/<feature>/issues/0N-*.md` |
| 计划者 kickoff/验收 | ticket `## Comments` 或 `app/.progress/<feature>-planner-k.md` |
| 执行者交付证据 | ticket 勾选 + 可选 `app/.progress/<feature>-impl-k.md` |
| 跨窗浓缩 | `/handoff` |

## 入口匝道

| 情况 | 谁开 | Skill |
|---|---|---|
| 想法模糊 | 计划者 | `/grill-with-docs` |
| 特大/特雾 | 计划者 | `/wayfinder` → 再 to-spec |
| 外来 bug 堆 | 计划者或人 | `/triage` → 派执行者 |
| 难 debug | 执行者或专项 | `/diagnosing-bugs` |
| 不会选 skill | 谁卡谁问 | `/ask-matt` |

## 与旧 superpowers 对照

| 旧动作 | 融合后 |
|---|---|
| brainstorming | 计划者 `/grill-with-docs` |
| writing-plans 长 checkbox | 计划者 `/to-spec` + `/to-tickets` |
| 计划者只验收 | **保留** |
| 另派执行者实现 | **保留**；执行者用 `/implement` |
| `app/.progress` handoff | **可保留** 作验收条；票为真源 |
| docs/superpowers/plans | 历史参考；新票写 acceptance |

## Git

- 执行者：`feat/<slug>` 上提交；不 push main  
- 计划者：文档可 `docs:` 进 main  
- 合码：人 + PR + 新会话 code-review  

## 示例目录

```
.scratch/bu05-automation/
  spec.md                          # 链到历史 superpowers spec
  issues/
    01-schema-dispatch.md          # Blocked by: None
    02-automation-ui.md            # Blocked by: 01
app/.progress/
  bu05-planner-0.md                # 可选 kickoff
  bu05-impl-1.md                   # 可选执行证据
```
