# Slice 71 · Activity RQ + WS invalidate · impl-1

## 钉死决策

| 项 | 值 |
|---|---|
| Event | **`activity:created`**，payload：`issueId` + 完整 `activity`（`ActivityLog`） |
| 广播点 | `recordActivityLog` 成功 insert 后 `eventBus.publish`（同 comment/run 通道 → wsBroadcaster） |
| RQ key | **`['activities', issueId]`** |
| Hook | `useActivities(issueId)` in `web/lib/api.ts`（对齐 `useComments`） |
| WS handler | `setQueryData` 幂等 append + `invalidateQueries` 兜底 |
| 重连 | `invalidateForPath('/issues/:id')` 含 `['activities', id]` |
| Topic | `activity:created` 匹配 `issue:` / `issue:{id}` |
| UI | `ActivityTimeline` 改用 hook；loading=Skeleton；error=ErrorState+retry |
| Out | 合并故事线（72）；全量 activity 语义改写 |

## 改动文件

| 路径 | 作用 |
|---|---|
| `packages/shared/src/schema.ts` | `ActivityCreatedEvent` + `DomainEvent` 联合 |
| `packages/server/src/orchestration/activity-logger.ts` | insert 后 publish |
| `packages/server/src/orchestration/ws-broadcaster.ts` | topic 匹配 activity:created |
| `packages/server/src/orchestration/ws-broadcaster.test.ts` | topic 单测 |
| `packages/server/src/orchestration/activity-logger.test.ts` | 广播 mock + schema parse |
| `packages/web/lib/api.ts` | `useActivities` |
| `packages/web/lib/ws.ts` | handler + invalidateForPath + issue:deleted 清 cache |
| `packages/web/lib/ws.test.ts` | issue detail keys 含 activities |
| `packages/web/components/ActivityTimeline.tsx` | 改用 hook |
| `packages/server/scripts/e2e-slice71-activity-ws.mts` | unit schema + live API/WS；WEB SKIP |

## 自测（已跑）

```text
shared/server/web tsc --noEmit          # clean
activity-logger.test + ws-broadcaster   # 13 PASS
web lib/ws.test.ts                      # 18 PASS
e2e-slice71-activity-ws.mts             # unit 3 PASS；live SKIP（无服）
```

## 事件契约

```ts
{
  type: 'activity:created',
  issueId: string,
  activity: ActivityLog, // 完整对象，可 optimistic append
}
```

## 偏离 / 债

- WS handler 同时 setQueryData + invalidate（无 cache 时仍能刷；有 cache 时 append 即时）
- e2e UI 不做 Playwright 全交互；WEB 不可达 SKIP；WS 未收到标 WARN 不强制 FAIL（API 仍验收）
- 未 commit / 未 push
