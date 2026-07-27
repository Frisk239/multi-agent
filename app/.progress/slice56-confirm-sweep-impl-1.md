# Slice 56 · Confirm 扫荡 · 派活/删除主路径 · impl-1

## 改动摘要

日用危险操作从 `window.confirm` / `window.alert` 全部迁到现有 `confirmDialog`（`ConfirmDialog` + `lib/confirm-store`）。危险操作用 `variant: 'danger'`；阻塞类 alert 用 `hideCancel: true` 信息闸。

## 从哪些文件去掉了 window.confirm / alert

| 文件 | 原 API | 迁移内容 |
|------|--------|----------|
| `packages/web/components/NewIssueForm.tsx` | `window.alert` | 指派硬闸「无法开工」→ hideCancel 信息闸 |
| `packages/web/components/QuickDispatchPanel.tsx` | `alert` + dirty `confirm` | 硬闸信息闸 + git dirty danger |
| `packages/web/components/ChatPage.tsx` | dirty `confirm` + 停止 `confirm` | git dirty danger + 停止回复 danger |
| `packages/web/components/AgentsPage.tsx` | 归档/永久删除 | danger confirmDialog |
| `packages/web/components/AgentDetailPage.tsx` | 删除 | danger |
| `packages/web/components/SquadsPage.tsx` | 删除 | danger |
| `packages/web/components/SquadDetailPage.tsx` | 删除 | danger |
| `packages/web/components/ProjectsPage.tsx` | 删除 | danger |
| `packages/web/components/ProjectDetailPage.tsx` | 删除 | danger |
| `packages/web/components/MemoryPage.tsx` | 单删/批量/详情删 ×3 | danger |
| `packages/web/components/SettingsPage.tsx` | 清空 cwd / 清理 7d / 删隔离目录 / wiki retry ×2 | danger 或 default |
| `packages/web/components/InboxPage.tsx` | 批量归档筛选 | confirmDialog |
| `packages/web/components/RunsPage.tsx` | 批量取消在途 | danger |
| `packages/web/components/AutomationPage.tsx` | 删规则 | danger |
| `packages/web/components/WikiJobsPanel.tsx` | 全部重试 dead | confirmDialog |
| `packages/web/components/IssueLabelsEditor.tsx` | 归档标签 | danger |
| `packages/web/components/OnboardingWizard.tsx` | bare `alert` | hideCancel 信息闸 |

已有组件化（未改业务逻辑，仅作对照）：
- `IssueCardMenu` / `KanbanBoard` / `AssigneeSelect` / `RunDetailPage`

## 测试

### Unit
- `components/ConfirmDialog.test.tsx` — 扩展 3 条：危险删除取消、硬闸 hideCancel、git dirty danger
- `lib/confirm-store.test.ts` — 保持绿

### E2E
- `packages/server/scripts/e2e-slice56-confirm-sweep.mts`
  - Memory 删除 → ConfirmDialog danger + 取消保留
  - Agents 归档 → ConfirmDialog + 取消
  - 看板 bulk 删除对照 + 全程无 window dialog

## 命令证据

### Typecheck
```text
cd app/packages/web && pnpm exec tsc --noEmit
```
结果：clean

### Unit
```text
cd app/packages/web && pnpm exec vitest run \
  components/ConfirmDialog.test.tsx \
  lib/confirm-store.test.ts
```
结果：2 files / 11 tests **PASS**

### E2E
```text
cd app/packages/server && pnpm exec tsx scripts/e2e-slice56-confirm-sweep.mts
```
结果：**PASS**（12 checks）  
log：`app/.progress/logs/e2e-slice56-confirm-sweep-2026-07-27T06-40-54-887Z.log`

### 残留扫描
```text
rg "window\.(confirm|alert)|\b(confirm|alert)\s*\(" app/packages/web
```
结果：**ZERO residual**（`packages/web` 内无 `window.confirm` / `window.alert` / bare `confirm()`/`alert()`）

## 残留清单

- **无** `window.confirm` / `window.alert` 残留于 `app/packages/web`
- 未 push（Owner 推）
- 未 commit

## 文件列表

### 业务迁移
- `D:\code\multi-agent\app\packages\web\components\NewIssueForm.tsx`
- `D:\code\multi-agent\app\packages\web\components\QuickDispatchPanel.tsx`
- `D:\code\multi-agent\app\packages\web\components\ChatPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\AgentsPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\AgentDetailPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\SquadsPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\SquadDetailPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\ProjectsPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\ProjectDetailPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\MemoryPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\SettingsPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\InboxPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\RunsPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\AutomationPage.tsx`
- `D:\code\multi-agent\app\packages\web\components\WikiJobsPanel.tsx`
- `D:\code\multi-agent\app\packages\web\components\IssueLabelsEditor.tsx`
- `D:\code\multi-agent\app\packages\web\components\OnboardingWizard.tsx`

### 测试 / 进度
- `D:\code\multi-agent\app\packages\web\components\ConfirmDialog.test.tsx`
- `D:\code\multi-agent\app\packages\server\scripts\e2e-slice56-confirm-sweep.mts`
- `D:\code\multi-agent\app\.progress\slice56-confirm-sweep-impl-1.md`
