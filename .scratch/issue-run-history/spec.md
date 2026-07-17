# issue-run-history

## 用户路径

打开 Issue 详情 → 见 **运行历史** 表（多 run）→ 点一行切换下方 **运行轨迹** → 对齐 Multica issue 下多 task 回放。

## Must

1. `IssueRunHistory`：该 issue 的 runs 列表（状态/runtime/队长/时间）
2. 选中行驱动 `RunTrace` 消息；默认活跃或最新
3. `data-testid`：history 表、行、选中态
4. Playwright：有 ≥1 run 时可见表；点击切换 data-run-id

## Out of scope

- 改 RunStatusBar 主条语义（仍优先活跃）
- 服务端新 API（复用 GET issue runs）
