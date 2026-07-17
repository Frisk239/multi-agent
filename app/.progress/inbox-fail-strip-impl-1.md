# Handoff: inbox-fail-strip-impl-1

> 自动迭代 · main · 2026-07-17

## 交付

Inbox 未读 `run_failed` 聚合条（`inbox-fail-strip`）：计数/Issue 覆盖/最近摘要；动作：筛未读失败、看板 `/?failed=1`、`/runs?status=failed`。

## 证据

- typecheck 绿
- Playwright：strip count=2 issues=2；筛 → `?kind=run_failed&read=unread`；看板仅失败 → FRI-11

## 再下一刀建议

- 看板列计数随仅失败更新（若尚未明显）
- 侧栏 Inbox 角标旁失败色点
