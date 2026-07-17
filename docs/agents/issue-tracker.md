# Issue tracker: Local Markdown（本仓）

Issues 与 specs（PRD）以 markdown 落在仓库 `.scratch/` 下。  
**GitHub** 用于 **分支托管 · CI · 远程合并**（`feat/*` push → 检查 → 人合 `main`），**不是**日常工单真源，也**不以开 PR 为必做步骤**——见 [merge.md](./merge.md)。

## 约定

- 一个 feature 一个目录：`.scratch/<feature-slug>/`
- Spec：`.scratch/<feature-slug>/spec.md`
- 实现票：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 编号；**一票一文件**，禁止合成一个 tickets.md
- 状态：文件顶部 `Status:` 行（见 `triage-labels.md`）
- 评论：文末 `## Comments`

## 当 skill 说「publish to the issue tracker」

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在则创建）。

## 当 skill 说「fetch the relevant ticket」

读用户给出的路径或 issue 编号对应文件。

## Wayfinding operations

供 `/wayfinder` 使用。

- **Map**：`.scratch/<effort>/map.md`
- **Child ticket**：`.scratch/<effort>/issues/NN-<slug>.md`，`Type:`（research/prototype/grilling/task），`Status:`（claimed/resolved）
- **Blocking**：顶部 `Blocked by: NN, NN`；所列文件均为 resolved 则 unblocked
- **Frontier**：open + unblocked + unclaimed，按编号优先
- **Claim**：先写 `Status: claimed` 再开工
- **Resolve**：写 `## Answer`，`Status: resolved`，并在 map 的 Decisions so far 加一行 gist+链接

## 与历史路径的关系

| 历史（superpowers 时代） | 现约定 |
|---|---|
| `docs/superpowers/specs/*.md` | **归档可读**；新工作优先 `.scratch/<feature>/spec.md`（可用软链或文内链接指回旧 spec） |
| `docs/superpowers/plans/*.md` | 由 **tickets + implement** 替代；旧 plan 仅参考 |
| `app/.progress/*-impl-*.md` | 可选会话笔记；**不**再作为工单真源。跨会话优先 ticket 正文 + `/handoff` |

## 远程合并 vs 工单

- 工单真源：始终 `.scratch/`。  
- 合码：见 [merge.md](./merge.md)（push 触发审查，人远程合并）。  
- 跨刀交接 / 下一 Owner 验收上一刀：见 [slice-handoff.md](./slice-handoff.md)。  
- 外部/陌生人 PR 请求面：**关闭**（默认 off），不进 triage 队列。
