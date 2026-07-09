# Handoff: S02-planner-1（计划者开片）

> 切片：`S02` · 角色：`planner` · 序号：`1`
> 日期：2026-07-09
> 作者：S02 计划者主会话

## 上下文

S01（看板 + WebSocket）已合 main（PR #1）。本会话完成 S02 brainstorm → design spec → writing-plans。

- **Spec：** [`docs/superpowers/specs/2026-07-09-s02-issue-detail-design.md`](../../docs/superpowers/specs/2026-07-09-s02-issue-detail-design.md)
- **Plan：** [`docs/superpowers/plans/2026-07-09-s02-issue-detail.md`](../../docs/superpowers/plans/2026-07-09-s02-issue-detail.md)
- **前置：** [`s01-planner-2.md`](s01-planner-2.md)

**S02 一句话：** 独立详情页 + comment 时间线（含 status_change）+ 发评论/@ 补全 + 轻 MD/pill + WS 实时；指派只读；不触发执行。

## 本会话完成了什么

- 进度文档同步（S01 已合 main）
- Brainstorm 决策 N1–N9 + 方案 2
- Design spec + sequential-thinking 自审 R1–R10
- 实现计划（impl-1 契约+DB / impl-2 server / impl-3 web）

## 执行者拆分（参考边界）

| 会话 | 范围 | handoff |
|---|---|---|
| **impl-1** | 分支 `feat/s02-issue-detail` · shared D11+Comment · comment 表 migration · seed · toComment | `s02-impl-1.md` |
| **impl-2** | GET issue · comments · agents/squads · PUT 事务 status_change · 双事件 | `s02-impl-2.md` |
| **impl-3** | 详情页 · Timeline/MD/pill · @ 补全 · D12 · WS · §9 验收 | `s02-impl-3.md` |

## 给 impl-1 的注意点

1. 从**最新 main** 开 `feat/s02-issue-detail`，不要从旧的 `feat/s01-kanban-ws` 长出来。
2. **LOCAL_MEMBER = `user-linyuan` / 林远**（seed 已有），禁止 `member-local`。
3. D11：shared 全局消灭业务字段上的 `z.string().uuid()`。
4. 评论 seed **按 identifier 查 issue**，不要写死 issue UUID。
5. migration **additive** `0001_*`，本地用删 `dev.db*` + migrate + seed。
6. 计划代码若与运行时 drizzle/zod API 冲突，以 typecheck 为准并记偏离；spec 语义优先于计划字面量。
7. 完成后写 `s02-impl-1.md`，**等计划者验收**再开 impl-2（或按用户指示连续执行）。

## 验收结论（本文件仅开片，不验实现）

- [ ] impl-1 待执行
- [ ] impl-2 待执行
- [ ] impl-3 待执行
- 结论：计划已就绪，可开工
