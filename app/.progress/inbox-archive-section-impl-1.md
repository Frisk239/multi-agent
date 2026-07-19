# inbox-archive-section · impl-1（G8）

日期：2026-07-19

## 决策

- `useInbox({ includeArchived: true })` + limit 200
- 活跃列表与「已归档 N」折叠区分开（Multica 同款）
- 详情仍可从归档列表点开；筛选同时作用于活跃/归档

## 证据

- typecheck 绿
- Playwright：折叠 `已归档 3` → expand listCount 3

## 下一刀

- G13 agent-capability-tabs / G2 issue-subscribe / G18 user-profile-brief
