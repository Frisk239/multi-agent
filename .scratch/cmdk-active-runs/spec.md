# cmdk-active-runs

## 用户路径

Ctrl+K → 搜「活跃/在途/running」或见导航「运行：活跃」→ 进入 `/runs?status=active`；hint 显示当前在途数（若有）。

## Must

1. CmdK 导航项「运行：活跃」→ `/runs?status=active`（hint 可含 count）
2. 关键词 活跃/在途/queued/running/active 时优先置顶
3. 复用 `useRunsActiveCount`（与侧栏同源）
4. Playwright：打开 palette，可见命令 / 跳转 active

## Out of scope

- 列出单条 active run 作为 CmdK 行
