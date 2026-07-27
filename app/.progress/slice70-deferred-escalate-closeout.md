# Slice 70 · Deferred 可选升级 · closeout

> 2026-07-27 · Phase E · main 直推 · 可选刀

## 交付
- 默认关：threshold=0 → escalate no-op
- Opt-in：env MS / AUTO_ESCALATE / prefs `deferredAutoEscalate`
- 开启后：inbox + activity + reassignDraft 建议（不真改派）
- Settings 开关文案；unit 22 PASS

## 证据
- `app/.progress/slice70-deferred-escalate-impl-1.md`
- Owner 复验：stale-runs 22 PASS

## 决策
- 草稿 reassign 只 note，不改 assignee
- 建议阈值 30min

## 下一
Phase E 整队关刀
