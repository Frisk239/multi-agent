# Handoff: run-observability-planner-0

> 切片：产品演进 · 运行可观测 B2 · 角色：`planner` · kickoff  
> 日期：2026-07-17

## 结论

补充阶段已收官。下一刀 **不是 bu06**，是 **产品演进** 第一刀：

**运行可观测 + 人工再执行（Multica R3 收口 + 本仓 `/runs` 壳）**

## 真源

| 产物 | 路径 |
|---|---|
| Spec | `.scratch/run-observability/spec.md` |
| 票 01 | `.scratch/run-observability/issues/01-runs-api-rerun.md`（**frontier**） |
| 票 02 | `…/02-runs-ui-actions.md`（Blocked by 01） |
| 票 03 | `…/03-regression-handoff.md`（Blocked by 02） |
| 分支 | `feat/run-observability` |

## 已锁定决策

- B2 厚切片；R3 = Issue rerun + Run retry，皆**新行**  
- 学 Multica `RerunIssue` + `task_id`；**无** auto-retry  
- 选项 2：`/runs` 产品壳；QC `issueId==null` → retry 400（Q2）  
- 产品立场已写入 AGENTS/CONTEXT/roadmap（commits `11cd8e8`, `860491a`）

## 派工（工作流已改为 Slice Owner）

**人开【Slice Owner】会话**（不要再开计划者验收会话）：

- 默认可做 **整刀** 或从 **01 → 02 → 03** 同会话能做多少做多少；窗满 `/handoff` 续作。  
- 已有 spec/票与 Multica 对齐结论，**不必**再满血 grill。  
- 若还要对齐上游细节 → **派调研子代理**，Owner 只吃摘要。

```
读 AGENTS.md + CONTEXT.md + ADR 0001
+ .scratch/run-observability/spec.md
+ issues/01…（frontier）
→ /implement
→ typecheck + smoke 证据
→ push feat/run-observability
→ 人开 PR → 新会话 /code-review
```

## 注意点

1. `GET /api/runs` 无 issueId 今日 400 — 合法放宽。  
2. 单一编排核心（Issue rerun + Run retry）。  
3. Multica 结论已在 spec；勿在 Owner 窗重灌上游源码。  
4. 勿做 usage / labels / wiki DLQ / auto-retry。  
5. 勿 commit `wiki/`、`*.db`、`.playwright-cli/`。
