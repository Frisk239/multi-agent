# Slice 66 · waitingLocalEnteredAt · closeout

> 2026-07-27 · Phase E · main 直推

## 交付
- 列 `waiting_local_entered_at` + migrate 0037
- 进入 waiting set / 离开 clear；API + UI「已等待 Xs」
- unit server+web；path-lock script PASS；live e2e SKIP（无服）

## 证据
- `app/.progress/slice66-waiting-entered-at-impl-1.md`
- Owner 复验：stale-runs+reshape 19 + waiting-elapsed 3 PASS

## 决策
- 离开 waiting 清 null
- 墙钟/Ops 龄：enteredAt ?? createdAt

## 下一刀
Slice 67 · forceFresh session
