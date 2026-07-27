# Slice 24 · Memory 写可靠 + 断路器 · closeout

> 2026-07-27 · 计划 R2 · H1/H2

## 交付

| 路径 | 内容 |
|---|---|
| `packages/server/src/memory/manager.ts` | `enqueueWrite` 串行；breaker threshold/cooldown；open 跳过写+prefetch |
| `packages/server/src/memory/manager.test.ts` | 6 tests |
| `packages/shared/src/schema.ts` | `SettingsMemoryHealth` breaker 字段 |
| `packages/server/src/routes/settings.ts` | health 透传 + warn |
| `packages/web/components/SettingsPage.tsx` | 健康卡一行 |

## Must

1. ✅ 写 concurrency=1（sync/ambient/curated）
2. ✅ breaker 冷却跳过写+prefetch
3. ✅ Settings 健康可见
4. ✅ 单测 6/6
5. ✅ typecheck 绿；不换引擎

## 证据

```text
vitest manager.test.ts → 6 passed
pnpm typecheck → Done
```

## 债

- breaker 进程内，重启重置
- open 时 curated 写抛错 → HTTP 500（可接受）

## 下一刀

Slice 25 委派边界 hardening
