# Slice 71 · Activity RQ + WS · closeout

> 2026-07-27 · Phase F · main 直推

## 交付
- `activity:created` DomainEvent + logger publish
- `useActivities` RQ `['activities', id]` + WS append/invalidate
- ActivityTimeline 改用 hook
- unit 绿；live e2e SKIP 无服

## 证据
- `app/.progress/slice71-activity-ws-impl-1.md`
- Owner 复验：activity-logger 2 PASS

## 下一刀
Slice 72 · Issue 合并故事线
