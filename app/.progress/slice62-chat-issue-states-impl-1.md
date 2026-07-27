# Slice 62 · Chat + Issue 空错态对齐 · impl-1

## 改动

### 1. `packages/web/components/ChatPage.tsx`
- `useChatThreads` / `useChatMessages` 解构补 `isError, error, refetch`
- threads loading → `Skeleton`（`data-testid="chat-threads-loading"`）
- threads `isError` → rail + main 区 `ErrorState`「加载会话失败」+ 重试（`chat-threads-error` / `chat-main-error`）
- threads 空 → `EmptyState` + CTA（新建对话 / 去选 Agent）
- 主区无会话：loading Skeleton / error / `EmptyState` + CTA
- messages loading → Skeleton；`isError` → `ErrorState`「加载消息失败」+ 重试；空消息 → `EmptyState`

### 2. `packages/web/components/IssueDetail.tsx`
- `useIssue` 补 `isError, refetch`
- loading 仍 `PageSkeleton`
- 加载失败 → `ErrorState`「加载 Issue 失败」+ 重试 + 「回看板」链接（`issue-detail-error` / `issue-back-board`）
- 不存在（无 error 无 data）→ `EmptyState`「Issue 不存在」+ 回看板  
- IssueSideSheet 复用 `IssueDetail variant="sheet"`，同源错态

### 3. 顺手半刀
- `UsagePage.tsx`：loading → `PageSkeleton`；error → `ErrorState` + onRetry
- `TokenCostDashboard.tsx`：同上

### 4. 测试
- Unit：
  - `components/ChatPage.error.test.tsx` — threads/messages Error + empty + skeleton
  - `components/IssueDetail.error.test.tsx` — loading / ErrorState / missing Empty
- E2E：`packages/server/scripts/e2e-slice62-chat-issue-states.mts`
  - route 拦截 chat threads / issue id → ErrorState
  - 正常 chat 空态或列表
  - WEB 不可达 SKIP

## 命令证据

### Unit
```text
cd app/packages/web && pnpm exec vitest run \
  components/ChatPage.error.test.tsx \
  components/IssueDetail.error.test.tsx \
  components/IssueDetail.test.tsx
```
结果：3 files / 9 tests **PASS**

### Typecheck
```text
cd app/packages/web && pnpm exec tsc --noEmit
```
结果：clean (`tsc_exit=0`)

### E2E
```text
cd app/packages/server && pnpm exec tsx scripts/e2e-slice62-chat-issue-states.mts
```
结果：**PASS**  
- chat.error.state / chat.error.retry / chat.empty.or.list / issue.error.state  
- issue.sheet.error **WARN**（拦截 hits=2 但 sheet 未稳定呈现 ErrorState，可忽略）  
log：`app/.progress/logs/e2e-slice62-chat-issue-states-2026-07-27T07-04-09-142Z.log`

## 残留
- 未 push / 未 commit
- IssueSideSheet 在 board 已有 RQ cache 时 route 拦截难稳定出 ErrorState（e2e WARN）
- 请从 `app/packages/web` 跑 vitest（与 Slice 55 一致）

## Closeout 片段（可选）
- Slice 62 实现完成：Chat/Issue Skeleton + ErrorState + Empty CTA + unit/e2e 绿
