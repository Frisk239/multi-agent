# Closeout: cmdk-active-runs

> 自动迭代 · main · 2026-07-17

## 交付

1. CmdK 导航「运行：活跃」→ `/runs?status=active`（hint 可带 count）
2. 关键词 活跃/在途/active/queued/running… 时置顶「运行：活跃」
3. 复用 `useRunsActiveCount` 与侧栏同源

## 证据

- typecheck 绿
- Playwright：Ctrl+K → 项含「运行：活跃」；输入「活跃」→ 置顶；点击 → `/runs?status=active` data-status=active

## 债

- 无
