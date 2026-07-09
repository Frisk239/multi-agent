# Handoff: S03-planner-1（计划者开片）

> 切片：`S03` · 角色：`planner` · 序号：`1`
> 日期：2026-07-09
> 作者：S03 计划者主会话

## 上下文

S01/S02 已合 main（PR #1 / #2）。本会话启动 **S03 — 真实 agent 执行层**。

- **前置交接：** [`s02-planner-2.md`](s02-planner-2.md)
- **切片占位：** [`design/slices.md`](../../design/slices.md) S03
- **技术真源：** [`design/synthesis.md`](../../design/synthesis.md) §2.6 RuntimeBackend · [`references/deep/pi.md`](../../references/deep/pi.md) · [`references/deep/multica.md`](../../references/deep/multica.md) §5

**S03 一句话（占位，brainstorm 后收紧）：**  
Issue 指派 agent → 真实 Backend 执行 → 时间线出现工具调用/产出；本机 CLI 可探测。

## 本会话完成了什么

- [x] 进度文档同步（S02 ✅ · S03 计划中）
- [x] Brainstorm 决策 N1–N10（三 CLI、指派即跑、multica 混合流、agent_run、cwd env、双栏 runtimes、方案1+终止、confirm）
- [x] Design spec + 自审 R1–R6 → `docs/superpowers/specs/2026-07-09-s03-runtime-backend-design.md`
- [x] writing-plans → `docs/superpowers/plans/2026-07-09-s03-runtime-backend.md`
- [x] 执行者 kickoff：`s03-impl-1/2/3-kickoff.md`

## 给自己 / 后续执行者的已知约束

1. 不自造 Agent loop；**Pi 参考不实装**；Backend = Claude / opencode / Cursor
2. 进程方案 1：主进程 + CLI 子进程；终止必做
3. 流式对齐 multica：progress 仅 WS；`run_message` 回放；摘要 comment
4. 放开 assignee；指派 agent 即跑 + confirm
5. `/runtimes` 抄原型双栏
6. 分支：`feat/s03-runtime-backend`
7. Borrow：`design/borrow-from-references.md` + spec §10

## 验收结论

- [x] brainstorm 完成
- [x] spec 用户通过
- [x] plan 就绪
- 结论：可派 impl-1（kickoff：`s03-impl-1-kickoff.md`）
