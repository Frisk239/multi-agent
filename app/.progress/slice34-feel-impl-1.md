# Slice 34 · 交互手感债收口（U4）· closeout

> 2026-07-27 · impl-1

## 交付

| 路径 | 内容 |
|---|---|
| `ErrorState.tsx` | 默认标题「出了点问题」、按钮「重试」 |
| `IssueDetail` / `AgentDetailPage` / `SquadDetailPage` / `RunDetailPage` | 加载态 `PageSkeleton`，去掉裸「加载中…」/「加载运行…」 |
| `WsConnectionBanner.tsx` + `layout.tsx` | `closed`/`connecting` 顶栏 +「刷新本页」；恢复 toast 防抖 |
| `WikiQueryDialog` / `RunEventTimelineDrawer` / Memory 详情 / `HelperRail` | 挂 `useFocusTrap` |
| tests + e2e 骨架 | `ErrorState.test`、`WsConnectionBanner.test`、`e2e-slice34-feel.mts` |

## Must

1. ✅ 详情主路径无裸「加载中…」→ Skeleton  
2. ✅ ErrorState 中文默认  
3. ✅ WS 断线可行动条 + 恢复 toast（3s 防抖）  
4. ✅ 相关 dialog focus trap  
5. ✅ 单测覆盖 ErrorState + WS banner  
6. ✅ Playwright 路径骨架（不启服）

## 证据

```text
pnpm --filter @ma/web typecheck → Done
vitest (web): ErrorState 2 + WsConnectionBanner 5 → 7 passed
```

## 决策 / 偏差

- WS banner 放在 `main-column`（EnvBanner 下），冷启动 `connecting` 也会显示（符合 Must；首次 open 不 toast，仅 closed→open 后 toast）。
- Run 详情原「加载运行…」一并改为 Skeleton。
- HelperRail 仍是 dialog 角色；focus trap 在 `/chat` 与未 hydrated 时 inactive。

## Out（未做）

- TipTap / 整站 redesign / 快捷键自定义
- ProjectDetail 等非 Must 详情页的裸加载文案
