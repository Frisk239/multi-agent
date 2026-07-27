# Closeout · Slice 46 · 看板卡 live 态（U9）· 2026-07-27

## 交付

| Must | 结果 |
|---|---|
| running live 标记 + testid | ✅ `issue-card-live` / `data-live` |
| failed 可区分并可进 Sheet | ✅ fail badge → `?issue=` |
| 无 run 不噪声 | ✅ helper 纯函数 |
| virtual/拖拽不回归 | ✅ 未改阈值 |
| unit | ✅ 6 passed |
| e2e Playwright | ✅ PASS（live+fail+Sheet） |
| typecheck web | ✅ |

## Owner 复跑

```text
vitest lib/issue-card-live.test.ts → 6 passed
typecheck @ma/web → ok
e2e-slice46-board-live.mts → all PASS
```

## 下一刀

**Slice 47 · Wiki running lease**

## 裁决

**关刀。**
