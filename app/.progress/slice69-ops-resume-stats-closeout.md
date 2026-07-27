# Slice 69 · Ops resume/poison/deferred 计数 · closeout

> 2026-07-27 · Phase E · main 直推

## 交付
- ops-snapshot `resumeStats`（7d）
- Settings Ops 只读 `ops-resume-stats`
- unit 8 PASS；live e2e SKIP

## 证据
- `app/.progress/slice69-ops-resume-stats-impl-1.md`
- Owner 复验：ops-snapshot + routes/ops 8 PASS

## 决策
- 窗口钉死 7d
- deferred 未认领 = inbox deferred:* 未读未归档

## 下一刀
Slice 70 · Deferred 可选升级（默认关，可选刀）
