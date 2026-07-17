# 合码 — Push 触发审查，远程由人合并

> 真源：[ADR 0002](../adr/0002-push-triggered-review-remote-merge.md) · [AGENTS.md §工程模式](../../AGENTS.md)

## 默认路径（app 工程）

```
Slice Owner 做绿
  → git push -u origin HEAD          # feat/<slug>，禁止 main
  → 自动：GitHub Actions typecheck（.github/workflows/feat-branch-ci.yml）
  → 自动/新会话：/code-review 对照 origin/main...feat/<slug>
  → 人：远程合并进 main（CI + review 通过后）
```

**不以「请人先开 PR」为步骤。** 交付物是 **远程 feature 分支**。

## 审查固定点

```text
origin/main...feat/<slug>
# 或
$(git merge-base origin/main HEAD)..HEAD
```

`/code-review` 参数用分支/commit，**不要**要求 PR URL 才能审。

## 通过标准（人合并前）

| 信号 | 要求 |
|---|---|
| CI `branch-ci` / typecheck | 绿 |
| Agent `/code-review`（Standards + Spec） | 无 blocker；结论写在 `app/.progress/<slug>-review.md` 或会话交付物 |
| Owner 自测证据 | ticket / progress 里可核对 |

## 人在远程怎么合并

任选其一（平台习惯即可）：

1. GitHub：该分支 Compare → Merge（若 UI 生成 PR 对象，视为**管道**，不是流程中心）  
2. 本机（仅人）：`main` ← merge/ff `feat/*` → `git push origin main`  
3. Agent **禁止** `git push origin main`

## Agent 行为

| 该做 | 不该做 |
|---|---|
| push `feat/*` 后视为进入审查队列 | 堵在「请先开 PR」 |
| push 后触发/提醒 code-review（分支 diff） | 把审查结论只留在聊天不落库 |
| 可选：无 PR 时静默 `gh pr create` 仅方便远程合并按钮 | 要人手工填 PR 标题当必做功课 |
| 文档 `docs:` 可直接 main | app 工程直接 main |

## 与工单

日常票仍在 `.scratch/`。GitHub **不是**工单真源；远程只承担 **分支托管 + CI + 合并**。
