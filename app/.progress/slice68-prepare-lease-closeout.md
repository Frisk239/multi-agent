# Slice 68 · prepare_lease 轻量 · closeout

> 2026-07-27 · Phase E · main 直推

## 交付
- `prepareLeaseExpiresAt` + migrate 0038
- claim 写 lease；稳定 running 清；过期半 claim → fail(exec_error)
- unit 25+ PASS；tsc 绿

## 证据
- `app/.progress/slice68-prepare-lease-impl-1.md`
- Owner 复验：prepare-lease + stale-runs 25 PASS

## 决策
- 半 claim = running + lease 未清且过期
- 过期 **fail 不 requeue**
- MA_PREPARE_LEASE_MS 默认 120s

## 下一刀
Slice 69 · Ops poison/resume/deferred 计数
