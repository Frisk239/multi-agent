# Slice 46 · 看板卡 live 态（U9）· impl-1

## 路径
看板一眼看到 running（呼吸 live）/ 最近 failed；失败可点进 `?issue=` Sheet。无 run 不噪声。

## 改动
- `packages/web/lib/issue-card-live.ts` — `deriveIssueCardLive` / `issueIdsFromRuns` / `collectActiveIssueIds`
- `packages/web/lib/issue-card-live.test.ts` — 纯函数单测
- `packages/web/components/IssueCard.tsx` — 用 helper；`data-live` + `data-testid="issue-card-live"`；失败/进度链走 sheet `?issue=`
- `packages/web/components/KanbanBoard.tsx` — active/failed 聚合改用 helper
- `packages/server/scripts/e2e-slice46-board-live.mts` — Playwright：WEB SKIP；对照 API runs 断言 live/fail 标记

## 规则
| 输入 | 卡态 |
|------|------|
| active (running/queued) | live=true，脉冲 + badge |
| failed 且非 active | showFailed=true，红条/失败 badge → `?issue=` |
| 无 run | 安静 |

## 验收
```bash
cd D:/code/multi-agent/app/packages/web && pnpm exec vitest run lib/issue-card-live.test.ts --reporter=dot
pnpm typecheck
cd ../server && pnpm exec tsx scripts/e2e-slice46-board-live.mts
```

## 结果（impl-1）
- unit: `lib/issue-card-live.test.ts` 6 passed
- typecheck @ma/web: pass
- e2e: PASS（WEB 可达；liveMarkers + fail badge → `?issue=` Sheet）

## Out
全站实体脉冲 redesign；agent 仪表盘重做
