# Slice 32 · Issue 侧滑 Sheet · closeout

> 2026-07-27 · 计划 D4 · **23–32 队列收官**

## 交付

| 路径 | 内容 |
|---|---|
| `IssueSideSheet.tsx` | 右侧 Sheet + IssueDetail 内嵌 |
| Kanban/List/Card 接线 | `?issue=` 驱动 |
| Esc / 全页深链 | 保留 `/issues/[id]` |
| tests + e2e 骨架 | |

## Must

1. ✅ 点卡侧滑不丢看板  
2. ✅ `?issue=` 可分享  
3. ✅ Esc 关闭  
4. ✅ 主操作可用  

## 证据

```text
IssueSideSheet.test 4 passed
typecheck Done
```

## 队列完成

Slice **23–32** 已按 [slice-plan-2026-07-27-next.md](./slice-plan-2026-07-27-next.md) 选项 A 落地。  
后续：全栈 live Playwright 补跑、Kanban 列 virtual 债。
