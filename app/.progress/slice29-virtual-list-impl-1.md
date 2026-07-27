# Slice 29 · 列表虚拟滚动 · closeout

> 2026-07-27 · 计划 D1

## 交付

| 路径 | 内容 |
|---|---|
| `@tanstack/react-virtual` | web 依赖 |
| `IssueListView.tsx` | 列表 virtualizer |
| `issue-list-virtual.ts` + test | helper |
| `KanbanBoard` | list 分支接入 |
| CSS | 固定高度 + sticky thead |

## Must

1. ✅ 列表 virtual  
2. ✅ ≥200 DOM 下降（overscan 量级）  
3. ✅ 筛选/排序/URL 不坏  
4. ✅ 列表无 dnd 先稳  

## Out

- Kanban 列 virtual（记债）
- MyIssues virtual

## 证据

```text
typecheck @ma/web OK
issue-list-virtual.test 5 passed
```

## 下一刀

Slice 30 Agent 模板库收官
