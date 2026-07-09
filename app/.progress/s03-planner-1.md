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
- [ ] Brainstorm 决策
- [ ] Design spec
- [ ] writing-plans
- [ ] 执行者 kickoff

## 给自己 / 后续执行者的已知约束（开片时）

1. **不自造 Agent loop**——`RuntimeBackend` 驱动本机 CLI / Pi SDK（AGENTS.md）
2. S02 时间线已通；执行事件可扩 `CommentType` 或并行表（s02-planner-2）
3. S02 **assignee 只读**——S03 若要「指派后执行」，必须放开指派或提供「运行」触发
4. mention **不入队**（S04）
5. 建议分支：`feat/s03-runtime-backend`
6. slices 写「不做 Mock」；synthesis 表里仍有 MockBackend——brainstorm 拍板

## 验收结论

- [ ] brainstorm 完成
- [ ] spec 用户通过
- [ ] plan 就绪
- 结论：开片中
