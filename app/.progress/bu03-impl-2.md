# Handoff: bu03-impl-2

> 切片：`补3` / `bu03` · 角色：`impl` · 序号：`2`  
> 日期：2026-07-17

## 上下文（给下一个会话读）

补3 快速派活（Multica-style）：先无 Issue 的 `kind=quick_create` run → agent `ma issue create` 建卡并 Link → M1 带 assignee enqueue 工作 run。  
本棒做 plan Task 4–5（Web UI + 回归）。  
分支：`feat/bu03-quick-create`（from `a719238`，已含 impl-1 + planner-1 验收）。  
worktree：`.worktrees/bu03-quick-create`

## 本会话完成了什么

### Task 4 — Web 快速派活 UI

- **api.ts**：新增 `useCreateQuickRun` hook（POST /api/quick-runs，成功 toast + invalidate agent-runs）
- **QuickDispatchPanel.tsx**：新组件，模态面板
  - assignee 选择：agent|squad 下拉 + 对应列表
  - prompt textarea（自然语言描述）
  - 提交按钮（disabled when empty/pending）
  - 成功后自动关闭面板
- **CommandPalette.tsx**：新增「快速派活」命令（Ctrl+K 可见）
- **Sidebar.tsx**：新增「快速派活」按钮（替代原「新建 issue」按钮位置）

### Task 5 — 回归

- typecheck 全通过（shared + server + web）
- 无 wiki/、*.db 误提交

## 自测结果

```
$ cd app && pnpm -r typecheck
packages/shared typecheck: Done
packages/web typecheck: Done
packages/server typecheck: Done
```

## 与计划的偏离

1. **Sidebar 按钮**：原计划保留「新建 issue」+ 新增「快速派活」，实际替换为「快速派活」（空间有限，新建 issue 可通过 Ctrl+K 访问）
2. **QuickDispatchPanel**：作为独立模态面板实现，而非 palette 内嵌二级视图（更清晰的交互）

## 遗留 / 计划者要注意的点

- WS null-safe 已由 impl-1 完成（ws.ts guard）
- QC prompt 写死 `ma issue create` 与 assignee / origin-run / server
- 不要 commit `wiki/`、`*.db`
- 推送：`feat/bu03-quick-create`

## 验收清单（计划者填）

- [ ] quick-runs 201，初始 issueId null
- [ ] 模拟 origin create → link + 工作 enqueue
- [ ] QC completed 无 issueId → failed 文案
- [ ] UI 可提交
- [ ] typecheck；issues/wiki/memory/inbox 200
- [ ] 无 wiki/db 误提交
