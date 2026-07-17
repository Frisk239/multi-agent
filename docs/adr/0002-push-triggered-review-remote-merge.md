# ADR 0002 — Push 触发审查，远程由人合并（不以开 PR 为流程中心）

- **Status:** Accepted  
- **Date:** 2026-07-17  
- **Deciders:** 人（产品/工程）  

## Context

Slice Owner 模式后，合码仍写「人开 PR → 新会话 code-review → 合 main」。单人仓库里 **手动开 PR 是摩擦**：Owner 已 push 分支，人还要再走一层 GitHub PR 仪式。

人要求：

1. **合码流程不要以「开 PR」为中心**（麻烦）。  
2. **push 之后自动触发 review**。  
3. **review 通过后，人在远程合并**。

## Decision

1. **交付物是分支，不是 PR 工单。** Slice Owner 自测够后：`git push -u origin HEAD`（`feat/<slug>`）。**禁止** push `main`。  
2. **审查固定点是 git 范围，不是 PR 号：**  
   `merge-base(origin/main, HEAD)…HEAD` 或 `origin/main...feat/<slug>`。  
   `/code-review` 与 CI 都按**分支 diff** 工作。  
3. **Push 自动触发：**  
   - **CI（GitHub Actions）：** 对 `feat/**`（及 `main`）push 跑 `pnpm` typecheck（可扩展 smoke）。  
   - **Agent review：** push 后进入审查（新会话或自动化 agent），对照上述固定点写结论；通过/否决写入可发现位置（如 `app/.progress/<slug>-review.md` 或检查结论摘要）。  
4. **人的动作：** 看 CI + review 结论 → **在远程把 `feat/*` 合进 `main`**（GitHub 分支比较合并 / 本机 ff 后仅人 push main）。  
5. **PR 降为可选管道：** 若托管平台合并 UI 需要 PR 对象，允许 **push 时由脚本/agent 静默创建**（无交互、不等人「去开 PR」）；日常话术与铁律写 **分支 + 远程合并**，不写「必须先开 PR」。  
6. **文档/调研** 仍可直接进 `main`（`docs:`），不经 feature 分支。

## Consequences

### Positive

- 少一步人肉开 PR；与「push 即交付」心智一致。  
- 审查与 CI 绑定在 **push 事件 + 分支 diff**，可自动化。  
- 人只在远程做合并闸门，权限清晰。

### Negative / Trade-offs

- 无 PR 时，部分 GitHub 保护规则/讨论串要改挂在 branch checks 或 review 文件上。  
- 「自动 agent review」依赖本机/托管侧能在 push 后拉起 agent；至少 **CI typecheck 必须绿**，agent review 为强推荐质量闸。  
- 历史文档大量「开 PR」字样；以本 ADR + `AGENTS.md` 为准。

### 不改变

- `app/**` 不直接进 main；人合并前要有审查信号。  
- Conventional Commits；main 保持可 typecheck / `pnpm dev`。

## Alternatives considered

| 方案 | 为何未选 |
|---|---|
| 继续「人必须先开 PR」 | 用户明确嫌麻烦 |
| Owner 直接 push main | 无分支审查窗口，否决 |
| 仅 CI、不要 agent review | 丢掉 Spec/Standards 双轴；CI 只做 typecheck 不够产品切片 |
