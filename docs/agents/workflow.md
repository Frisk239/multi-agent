# 工作流 — Slice Owner × 子代理调研 × Push 审查 × Matt skills

> 技能总路由：`/ask-matt`。  
> **默认编排：** 人 → **Slice Owner 一会话一切片** → 做绿 → **push feat/** → **自动 CI + review** → **人远程合并**。  
> **不再默认** 计划者/执行者；**不以开 PR 为流程中心**（[ADR 0001](../adr/0001-slice-owner-and-research-subagents.md) · [ADR 0002](../adr/0002-push-triggered-review-remote-merge.md)）。  
> **产品立场：** 真实产品；优先级 = 日常使用价值。

## 模型

```
人点主题
   │
   ▼
┌─────────────────────────────┐     「去调研」
│  Slice Owner 会话           │ ──────► 调研子代理
│  短对齐 · implement · 自测  │ ◄── 摘要 ──┘
│  push origin feat/<slug>    │
└─────────────┬───────────────┘
              │ push
              ▼
     ┌────────────────────┐
     │ 自动 CI typecheck  │
     │ 自动/会话 code-review（main...feat） │
     └─────────┬──────────┘
               │ 通过
               ▼
          人：远程合并进 main
```

| 会话 / 系统 | 干什么 |
|---|---|
| **Slice Owner** | 对齐 + 实现 + 自测 + **push 分支** |
| **调研子代理** | 读 deep/repos；Owner 只收摘要 |
| **CI** | push `feat/**` / `main` → typecheck（`branch-ci`） |
| **Review** | 分支 diff 上 `/code-review`；结论可落 `app/.progress/*-review.md` |
| **人** | 点题；**远程合并**（看 CI + review） |

## Grill 与调研

- 满血 grill **非默认**；产品刀短对齐。  
- 「去调研」→ **子代理**；Owner 禁止通读大段 upstream。

## 主链路（一刀）

```
【Owner】
  读 AGENTS + CONTEXT + spec/ticket
  需上游 → 调研子代理
  /implement → 证据
  git push -u origin HEAD     # 不要停在「请开 PR」

【自动】
  GitHub Actions typecheck
  code-review（origin/main...HEAD）

【人】
  远程合并 feat → main
```

**窗不够：** 按票 `/handoff` 续作同一 `feat/*`，仍不按计划者/执行者拆。

## 合码细节

见 [`merge.md`](./merge.md)。

## 铁律

- Owner **可写** `app/**`（仅 `feat/*`）。  
- **禁止** agent push `main`。  
- **禁止**把「人开 PR」写成必做步骤。  
- 审查固定点 = **分支 vs main**，不是 PR 号。

## 产物路径

| 产物 | 路径 |
|---|---|
| Spec / 票 | `.scratch/<feature>/` |
| 进度 / review | `app/.progress/` |
| ADR | `docs/adr/` |
| CI | `.github/workflows/feat-branch-ci.yml` |

## Git 一句话

`feat/<slug>` push → CI + review → **人远程合并**；`docs:` 可直接 main。
