# Slice 42 · Deferred 升级（D5）关刀

**日期:** 2026-07-27  
**状态:** 实现完成 · 未 commit  
**范围:** 本地简化版 deferred（pre-claim 可观测升级）；非 Multica fire_at

---

## 决策

| 项 | 选择 |
|---|---|
| 阈值 env | `MA_DEFERRED_UNCLAIMED_MS` |
| **默认** | **`0` = 关闭**（防噪声） |
| 开启示例 | `export MA_DEFERRED_UNCLAIMED_MS=1800000`（30min） |
| 状态谓词 | 仅 `status === 'queued'` 且 `createdAt` age ≥ 阈值且 `startedAt == null` |
| 跳过 | `running` / `completed` / `failed` / `timed_out`；**`waiting_local_directory`**（path-lock 排队 ≠ 无人 claim） |
| 与 Squad Escalated | **分流**：不写 `[Squad Escalated]`、不调 `notifySquadEscalated` / `escalateFailedSquadRuns` |
| 行为 | **不** fail run；仅 activity + inbox |
| 去重 | activity payload `runId`；inbox `dedupeKey: deferred:<runId>` |

---

## 改动

| 文件 | 内容 |
|---|---|
| `app/packages/server/src/orchestration/stale-runs.ts` | `getDeferredUnclaimedMs` · `escalateDeferredUnclaimedRuns(now?)` · sweeper 在 hard-fail 前调用 |
| `app/packages/server/src/orchestration/inbox-writer.ts` | `notifyDeferredUnclaimed`（title `Deferred · 排队过久未 claim`，severity `attention`） |
| `app/packages/shared/src/schema.ts` | `ActivityEventType` + `run_deferred` |
| `app/packages/web/components/ActivityTimeline.tsx` | `run_deferred` / `squad_escalated` 展示 |
| `app/packages/web/components/SettingsPage.tsx` | env snippet 注释开启方式 |
| `app/packages/server/src/orchestration/stale-runs.test.ts` | 阈值 0 no-op · 注入 now · 谓词/去重 · 不走 Squad 路径 |

---

## 状态谓词（写清）

```
deferred_candidate =
  status == 'queued'
  AND startedAt IS NULL          -- 从未 claim
  AND now - createdAt >= threshold
  AND threshold > 0
```

- `waiting_local_directory`：已进入 path claim 闸门，**不**算 deferred unclaimed。  
- hard fail 仍由 `failStaleQueuedRuns`（`STALE_QUEUED_MS` 30m）负责；本刀只做更早/可关的**可观测**升级。

---

## 验收

| 项 | 结果 |
|---|---|
| `pnpm typecheck` | **PASS** |
| `vitest run packages/server/src/orchestration/stale-runs.test.ts` | **15/15 PASS** |
| commit/push | **未做**（按约定） |

---

## Out

- Multica `fire_at` 1:1  
- 云调度 / 改 run 状态为 deferred 字段  
- 默认开启阈值  
