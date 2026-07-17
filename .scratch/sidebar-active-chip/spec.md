# sidebar-active-chip

## 用户路径

侧栏状态行除「工作中 N」外，有 **在途 run** 计数芯片 → 点击进 `/runs?status=active`。

## Must

1. 状态行 `data-testid="sidebar-active-runs"`，显示 active count（0 也可显示）
2. count>0 时为 link/可点；0 时 dim 文本
3. 复用 useRunsActiveCount
4. Playwright 可见芯片文案

## Out of scope

- 改 workingCount 语义