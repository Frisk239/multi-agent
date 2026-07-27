# Slice 45 · 草稿持久化（U8）· impl-1

## 路径
写半截评论 / Chat / NewIssue → 刷新或关 Sheet 再开 / 切 thread → 文案仍在；发送/创建成功后 clear。

## 改动
- `packages/web/lib/draft-storage.ts` — keys + read/write/clear + JSON + `usePersistentDraft`（300ms debounce）
- `packages/web/lib/draft-storage.test.ts` — get/set/clear + JSON
- `packages/web/components/CommentComposer.tsx` — issueId key 恢复；onSuccess `clear`
- `packages/web/components/ChatPage.tsx` — threadId key；切换 thread 换 key；发送成功 clear，失败写回
- `packages/web/components/NewIssueForm.tsx` — `ma-draft:new-issue` JSON（不含 open）；reset clear
- `packages/server/scripts/e2e-slice45-draft-persist.mts` — Playwright：NewIssue 填→刷新仍在；可选评论

## Keys
| key | value |
|-----|--------|
| `ma-draft:comment:{issueId}` | string body |
| `ma-draft:chat:{threadId}` | string body |
| `ma-draft:new-issue` | `{ title, priority, assigneeValue, projectId, customFields }` |

## 验收
```bash
cd app/packages/web && pnpm exec vitest run lib/draft-storage.test.ts --reporter=dot
# 或 monorepo: cd app && pnpm exec vitest run --project web lib/draft-storage.test.ts
cd app && pnpm --filter @ma/web typecheck
cd app/packages/server && ./node_modules/.bin/tsx scripts/e2e-slice45-draft-persist.mts
```

## 结果（impl-1）
- unit: 7 passed
- typecheck @ma/web: pass
- e2e: PASS（WEB 可达时 NewIssue 写盘+刷新恢复+cancel clear；有 issue 时 comment 恢复亦 PASS）

## Out
服务端草稿 / 多人 / TipTap / HelperRail 非必须
