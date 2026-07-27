# Slice 36 · Issue Sheet 轻量模式（U5）· closeout

> 2026-07-27 · impl-1

## 交付

| 路径 | 内容 |
|---|---|
| `packages/web/components/IssueDetail.tsx` | `variant="sheet" \| "page"`（默认 page）；sheet 裁剪为标题/状态/指派/评论/最近 run + 错误条 |
| `packages/web/components/IssueSideSheet.tsx` | 内嵌 `<IssueDetail variant="sheet" />` |
| `packages/web/app/globals.css` | Sheet 单列 + sheet meta / more 样式 |
| `IssueDetail.test.tsx` / `IssueSideSheet.test.tsx` | variant 行为 |
| `packages/server/scripts/e2e-slice36-sheet-light.mts` | Playwright selector 骨架（不启服） |

## Must

1. ✅ `IssueSideSheet` / `IssueDetail` 分 `variant="sheet" | "page"`（默认 page）
2. ✅ Sheet 默认强调：标题 / 状态 / 指派 / 评论 / 最近 run（失败自动展开 RunStatusBar 错误条）
3. ✅ 属性栏、知识沉淀、完整执行日志/历史/活动事件流 → 全页；Sheet 内更多放 `<details>`
4. ✅ `?issue=` / Esc / 全页深链不回归（SideSheet 头仍链 `/issues/:id`）
5. ✅ 单测：IssueDetail + IssueSideSheet variant
6. ✅ e2e 骨架 `e2e-slice36-sheet-light.mts`
7. ✅ closeout 本文件

## 证据

```text
pnpm --filter @ma/web typecheck → Done
vitest: IssueSideSheet 4 + IssueDetail 2 → 6 passed
```

## 决策 / 偏差

- Sheet 用 `IssueHeader variant="main"` + 独立 `IssueSheetMeta`（状态/指派），避免把完整 props rail 塞进窄栏。
- Sheet 不拉 `useIssueRunUsage`（传空 id → enabled=false）。
- 活动事件流 tab、Token 卡、PR 卡、RunHistory、Inline 时间线仅 page。
- 失败/超时/有 error 的最近 run 在 sheet 自动展开 exec 区，作为「必要错误条」。

## Out（未做）

- 全站实体侧滑化
- 重做 Issue IA / 属性编辑 IA
- 真启服 Playwright 全链路（仅 selector 脚本）
