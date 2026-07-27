# Slice 64 · 失败 chip 与中文动作映射 · closeout

> 2026-07-27 · Phase E · main 直推

## 交付
- web `failure-action-map` + `FailureActionChip`
- Run 详情 / Runs 列表主路径 chip（label · action · variant）
- unit 11 + tsc 绿；e2e mock chip 文案 PASS

## 证据
- `app/.progress/slice64-failure-chips-impl-1.md`
- Owner 复验：vitest 11 PASS

## 决策
- UI map 留 web/lib，不进 shared
- 与 `classifyRunFailure` 诊断 box 并存
- StatusBar/Timeline 未同步（可选债）

## 下一刀
Slice 65 · Inbox / Run 默认可行动 CTA
