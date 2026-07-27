# Slice 61 · Select 扫非看板日用页 · impl-1

> 2026-07-27 · 实现子代理 · 未 commit / 未 push

## 交付

| 路径 | 内容 |
|---|---|
| `packages/web/components/Select.tsx` | 既有共用壳（`ma-select`）；本 slice 未改 API |
| 日用页裸 `<select>` → `Select` | Chat / Runs / Inbox / Agents / Automation + 顺手 Project/Squad/Skills/HelperRail/Issue* 等 |
| `packages/web/components/Select.test.tsx` | unit：`ma-select` 默认 class、className 合并、props 透传 |
| `packages/server/scripts/e2e-slice61-select-sweep.mts` | Playwright：Chat/Runs/Automation/Agents 任一页筛选/表单 select 带 `ma-select`；WEB 不可达 SKIP |

## 改了哪些文件

### 优先日用页
- `packages/web/components/ChatPage.tsx` — agent 新建 + 项目绑定
- `packages/web/components/RunsPage.tsx` — agent / squad / status 筛选
- `packages/web/components/InboxPage.tsx` — 已读 / 类型筛选
- `packages/web/components/AgentsPage.tsx` — runtime / ready 筛选
- `packages/web/components/AutomationPage.tsx` — 创建表单调度/间隔/指派 + 列表 enabled/schedule 筛选

### 顺手（同次扫）
- `ProjectsPage.tsx` / `ProjectDetailPage.tsx`
- `SquadsPage.tsx`（残留表单 2 处，此前 leader 已用 Select）
- `SkillsPage.tsx` / `CreateSkillDialog.tsx`
- `HelperRail.tsx`
- `IssueHeader.tsx`（项目 + 状态；优先级此前已 Select）
- `IssueDetail.tsx` / `IssueListView.tsx`
- `QuickDispatchPanel.tsx`
- `AgentDetailPage.tsx` / `AgentBuilderWizard.tsx`
- `WikiPage.tsx` / `WikiJobsPanel.tsx`

### 测试 / e2e / progress
- `packages/web/components/Select.test.tsx`（新增）
- `packages/server/scripts/e2e-slice61-select-sweep.mts`（新增）
- `app/.progress/slice61-select-sweep-impl-1.md`（本文件）

## Must

1. ✅ 读 Select + Kanban 已用法
2. ✅ 日用页裸 select 改共用 Select（`ma-select`）
3. ✅ Out：radix combobox / 视觉大改版
4. ✅ Unit：Select className 透传
5. ✅ E2E：`e2e-slice61-select-sweep.mts`；WEB 不可达 SKIP
6. ✅ tsc web（见证据）
7. ✅ progress 列文件 + 残留

## Out

- radix combobox
- 视觉大改版 / 全站强制零裸 select

## 残留仍裸 `<select>` 清单

允许低频 / 特殊 mock 残留：

| 位置 | 说明 |
|---|---|
| `packages/web/components/Select.tsx` | 组件自身实现（`<select className="ma-select …">`） |
| `packages/web/components/KanbanBoard.error.test.tsx` | 测试 mock：`Select` → 裸 select 壳 |

> 业务 components 目录内日用页裸 select 已扫完；若后续新增页面再补。

## 验收命令

```bash
cd D:/code/multi-agent/app/packages/web && pnpm typecheck
cd D:/code/multi-agent/app && pnpm exec vitest run packages/web/components/Select.test.tsx
cd D:/code/multi-agent/app/packages/server && pnpm exec tsx scripts/e2e-slice61-select-sweep.mts
```

## 证据（本地）

- `cd app/packages/web && pnpm typecheck` → 绿
- `cd app/packages/web && pnpm exec vitest run components/Select.test.tsx` → 3 passed
- `cd app/packages/server && pnpm exec tsx scripts/e2e-slice61-select-sweep.mts` → pass=6 fail=0
  - chat/runs/automation/agents 均见 `ma-select`
  - WEB 可达时 PASS；不可达路径为 SKIP
