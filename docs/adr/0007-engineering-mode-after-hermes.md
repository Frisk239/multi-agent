# ADR 0007 — 对照 Hermes pipeline 后的工程模式

- **Status:** Accepted
- **Date:** 2026-08-19
- **Deciders:** 人授权「彻底更新工程模式」+ Slice Owner 对照 `hermes-software-pipeline` ADR-0031

## Context

Hermes software-pipeline 仓在 ADR-0031 后默认也是 **Slice Owner**（规划+实现同会话），并**扔掉** path jail、content_hash、强制双角色、Evidence Bundle。其纸面合码仍是 `feat/*` + 人审 PR、**禁止默推 main**。

本仓 2026-07-17 已授权 **main 直推**。合码文档却三套并存（`merge.md` 直推 vs ADR 0001「不写 main」vs `slice-handoff.md`「人不负责 push main」）。CI 跑 typecheck+test，但名字/注释与 `merge.md` 的 `pnpm check` 不对齐；无文档自检。

## Decision

1. **默认轨不变：** Slice Owner + 子代理优先 + Playwright 关刀 + **main 直推**（[merge.md](../agents/merge.md)）。不把 Hermes 产品 Pipeline（PRD Stage / Candidate SHA / 隔离合入权）当本仓开发流程。
2. **合码真源只有 [merge.md](../agents/merge.md)。** ADR 0001 Decision 5 /「不改变·不写 main」、ADR 0002 正文「禁止 push main」、handoff/issue-tracker/_TEMPLATE 凡与 merge 冲突的，以 merge 为准并回写。
3. **Roadmap / Goal 不是工单。** `design/roadmap.md` 是路线契约；一刀单位 = Must / Out / 可演示用户路径。工单仍在 `.scratch/`（可选）。
4. **关刀证据 = git SHA + 跑过的命令 + 残留债。** 不写 hash 链 / Evidence Bundle / Context Manifest。本机：`pnpm check` + Playwright（或无服 e2e SKIP）。CI：`pnpm check` + 文档自检。e2e/Playwright **不进 CI**。
5. **CONTEXT 分两套词：** 产品词（Issue / Run / Squad）≠ 工程词（Slice / Owner / Closeout / Goal 队列）。禁止把产品 Issue 说成「切片」。
6. **偏见隔离不挡落地：** `/code-review` 与 CI 是信号；**不**恢复「必须人远程合并才能进 main」。`feat/*` 仅高风险/并行刀。
7. **不引入** husky / 覆盖率门槛 / 全量 e2e CI / 再发明第三套角色名。

## Consequences

- Agent 读任何旧 ADR/handoff 都以本 ADR + merge.md 裁决合码。
- CI 与关刀同名，改 workflow 漏 `pnpm check` 会在文档自检的冻结清单里红。
- 难逆架构/安全/收回 main 直推授权 → 仍停问人。

## Alternatives considered

| 方案 | 为何未选 |
|---|---|
| 照搬 Hermes「禁推 main + PR 合入」 | 推翻 7-17 人授权 |
| 只改文档不动 CI | 关刀命令与 Actions 仍会漂移 |
| 上独立 reviewer 硬闸 / husky | 挡直推吞吐；review 保持可选 |
