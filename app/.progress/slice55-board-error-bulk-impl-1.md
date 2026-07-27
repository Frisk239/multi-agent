# Slice 55 · 看板诚实 ErrorState + bulk toast/pending · impl-1

## 改动

### 1. `packages/web/components/KanbanBoard.tsx`
- `useIssues` 解构补 `isError, error, refetch`
- loading 之后、主 UI 前：`isError` → `page-container` + `ErrorState`（title「加载看板失败」、description=error.message、`onRetry={() => void refetch()}`），`data-testid="kanban-error"`
- bulk bar：`bulkPending` 合并三个 mutation 的 `isPending`
  - status / assignee Select + delete 按钮 `disabled={bulkPending}`
  - toolbar `aria-busy`；count 文案 pending 时「处理中…」；delete pending「删除中…」
- call-site 仍 `onSuccess: handleClearSelection`

### 2. `packages/web/lib/api.ts` 三 bulk hooks
- `useBulkUpdateIssueStatus` / `useBulkUpdateIssueAssignee` / `useBulkDeleteIssues`
- `onSuccess`：invalidate `issues` + `toastSuccess`（含数量）
- `onError`：`toastError(errMessage(...))`
- fail 路径改 `apiError(res, fallback)`（与 inbox bulk 一致）

### 3. 测试
- Unit：
  - `components/KanbanBoard.error.test.tsx` — Error 分支 + 重试
  - `lib/bulk-issue-mutations.test.ts` — 三 hooks toast success/error
- E2E：`packages/server/scripts/e2e-slice55-board-error-bulk.mts`
  - bulk bar testids / idle enabled
  - 新 page + route 拦截 GET `/api/issues` → ErrorState + 重试恢复

## 命令证据

### Unit
```text
cd app/packages/web && pnpm exec vitest run \
  components/KanbanBoard.error.test.tsx \
  lib/bulk-issue-mutations.test.ts \
  components/ErrorState.test.tsx
```
结果：3 files / 8 tests **PASS**

### Typecheck
```text
cd app/packages/web && pnpm exec tsc --noEmit
```
结果：clean

### E2E
```text
cd app/packages/server && pnpm exec tsx scripts/e2e-slice55-board-error-bulk.mts
```
结果：**PASS**（含 error.state + error.retry）  
log：`app/.progress/logs/e2e-slice55-board-error-bulk-2026-07-27T06-35-31-716Z.log`

## 残留
- 未 push（Owner 推）
- 未 commit
- bulk pending 的 e2e 难稳定捕捉 disabled 瞬时态；已断言 idle enabled + 控件存在 + ErrorState 路径
- monorepo 根 `pnpm exec vitest run packages/web/...` 对 jsx 组件测解析不稳；**请从 `app/packages/web` 跑 vitest**（与本切片一致）

## Closeout 片段（可选）
- Slice 55 实现完成：ErrorState 诚实失败 + bulk toast/pending + unit/e2e 绿
- 不涉及 Slice 56 confirm 扫荡
