# ADR 0006 — 前端/数据面三项豁免：agent visibility · 顶栏 Tab · squad creatorId

- **Status:** Accepted
- **Date:** 2026-08-01
- **Deciders:** Slice Owner（自动迭代）· 审计子代理对照 multica / chanpin prototype 后拍板

## Context

2026-08-01 前端+后端对照审计（子代理报告，Owner 复核）在 `chanpin/prototype/data/seed.js`、multica schema（`server/migrations/001_init.up.sql` agent `visibility`、`084_squad.up.sql`）与原型 UI（UI-NAV-009 顶栏 Tab）中发现三项规格面差异。逐一评估后决定**正式豁免**，避免为 mock 而 mock、为字段而迁移。

| 项 | 规格/参考来源 | 评估 |
|---|---|---|
| agent `visibility`（workspace/private） | seed.js 全 agt-* 为 workspace；multica 001_init 有列 | 纯本地单用户产品无第二可见域；「私有 agent 不被 squad 委派」语义无消费方 |
| 顶栏 Tab 栏（UI-NAV-009） | 原型 tab-bar + btn-tab-add | 浏览器原生多 Tab 已承担并行查看；Tab 附带的「N 工作中」计数已有 `AgentsWorkingBanner` 替代 |
| squad `creatorId` / `creatorName` | seed.js:144-181 | 单用户溯源低频；列表所需排序已由 B5 的 `updatedAt` 列覆盖（0056 迁移已合） |

## Decision

1. **不做** agent `visibility` 列。若未来出现多可见域需求，再按 multica `001_init.up.sql` 的 `CHECK IN ('workspace','private')` 形状补迁移。
2. **不做** 顶栏 Tab 栏。浏览器 Tab + 侧栏高亮承担页面标识；不造单 Tab mock。
3. **不做** squad `creatorId`。squad 列表排序改用 `updatedAt` desc（2026-08-01 合入）。
4. 差距表口径更新：以上三项由「规格缺口」改标「已豁免（ADR 0006）」。

## Consequences

- 免三处无谓迁移/组件；单用户体验无损。
- 后续若上多用户或远程小队，需先回看本 ADR 重估 visibility 与 creatorId。
