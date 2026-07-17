# board-failed-filter

> 自动迭代 · Multica 对齐 · 厚切片

## 用户价值

看板上一键只看「最近有失败 run」的 Issue，URL `?failed=1` 可分享；与卡片失败标记同一数据源。

## 范围

- 工具栏「仅失败」toggle → `?failed=1` / 清除
- 客户端按 `failedIssueIds` 过滤（复用 workspace failed runs limit=80）
- `data-failed-only` / `data-testid=kanban-failed-only` 便于 E2E
- 不新增 server list API 字段

## 验收

1. 打开 `/?failed=1` 仅显示有失败标记的卡片（若有）
2. 点「仅失败」写/清 URL，与其他筛选可组合
3. typecheck 绿 + Playwright

## 非目标

- 服务端 issue 级 failed 聚合字段
- 历史全量失败（超出 limit）
