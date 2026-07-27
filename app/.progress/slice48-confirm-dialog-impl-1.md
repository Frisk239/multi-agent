# Slice 48 · ConfirmDialog 统一 + 指派减噪（U10）· impl-1

## 路径
ready 指派不再弹出浏览器 `window.confirm`；删除/不可逆仍二次确认，但是产品 ConfirmDialog（focus trap + Esc），可键盘。

## 策略
| 场景 | 行为 |
|---|---|
| **ready / busy 指派 agent·小队** | 直接执行 + `toastSuccess`（无 browser confirm / 无 ConfirmDialog） |
| **hard-block（cwd/runtime/error）** | 信息 modal（hideCancel · 知道了），不执行 |
| **soft-block / 成员阻塞** | ConfirmDialog 确认后才指派 |
| **清除指派** | ConfirmDialog danger |
| **删除 issue / 批量删除 / 停 run** | ConfirmDialog danger |
| **git dirty 硬闸**（卡片菜单派发） | ConfirmDialog danger |

## 改动
- `packages/web/lib/confirm-store.ts` — zustand pending + `confirmDialog()` / `useConfirm()`
- `packages/web/lib/confirm-store.test.ts` — request/settle/stack
- `packages/web/components/ConfirmDialog.tsx` — 标题/说明/确认取消 · Esc · useFocusTrap · danger 变体
- `packages/web/components/ConfirmDialog.test.tsx` — 渲染/确认/取消/Esc/hideCancel
- `packages/web/app/layout.tsx` — 挂载 `<ConfirmDialog />`
- `packages/web/app/globals.css` — `.confirm-dialog*` 样式
- `packages/web/components/AssigneeSelect.tsx` — ready 减噪；硬闸/清除组件化
- `packages/web/components/IssueCardMenu.tsx` — 指派减噪；清除/删除/git dirty → ConfirmDialog
- `packages/web/components/KanbanBoard.tsx` — 批量删除 → ConfirmDialog
- `packages/web/components/RunDetailPage.tsx` — 停止运行 → ConfirmDialog
- `packages/server/scripts/e2e-slice48-confirm-dialog.mts` — Playwright：ready 指派 dialog=0；删除 ConfirmDialog

## Out（刻意残留）
全仓其它 `window.confirm`（Memory/Settings/Agents/Squads/Inbox/…）未扫零；后续可按页迁。

## 验收
```bash
cd D:/code/multi-agent/app/packages/web && pnpm exec vitest run --reporter=dot components/ConfirmDialog.test.tsx lib/confirm-store.test.ts
pnpm typecheck
cd ../server && pnpm exec tsx scripts/e2e-slice48-confirm-dialog.mts
```

## 结果（impl-1）
- unit: ConfirmDialog.test.tsx + confirm-store.test.ts → **8 passed**
- typecheck `@ma/web`: **pass**
- e2e: **PASS**（ready 指派 dialog=0 + 无产品 confirm；删除 ConfirmDialog 取消保留/确认删除）

## 分支
- 本地实现 · 不 commit/push
