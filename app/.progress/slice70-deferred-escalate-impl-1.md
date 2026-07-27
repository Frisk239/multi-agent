# Slice 70 · Deferred 可选升级（opt-in）· impl-1

## 钉死决策

| 项 | 值 |
|---|---|
| 默认 | **关**：`getDeferredUnclaimedMs()===0` 且无 auto escalate → sweeper **no-op**（与 Slice 42 一致） |
| Opt-in 任一 | `MA_DEFERRED_UNCLAIMED_MS>0` · `MA_DEFERRED_AUTO_ESCALATE=1\|true` · prefs `deferredAutoEscalate: true` |
| 建议阈值 | **30min**（`SUGGESTED_DEFERRED_UNCLAIMED_MS`）；显式 MS 优先 |
| 开启后路径 | 超时未 claim（queued + startedAt null）→ inbox `deferred:<runId>` + activity `run_deferred` |
| 草稿 reassign | **只写 note**（`reassignDraft: { note: '建议改派', applied: false }`）进 activity/inbox body；**不**改 assignee |
| Settings | 收件箱偏好卡一行开关 + 文案；env 强制时 disable 勾选 |
| Out | 默认开；静默真改派；完整调度器 |

## 改动文件

| 路径 | 作用 |
|---|---|
| `packages/server/src/orchestration/stale-runs.ts` | `isDeferredAutoEscalateOptIn` · 阈值解析 · escalate 写 reassignDraft |
| `packages/server/src/orchestration/inbox-prefs.ts` | `deferredAutoEscalate: false` 默认 |
| `packages/server/src/orchestration/inbox-writer.ts` | `notifyDeferredUnclaimed` 附建议改派草稿文案 |
| `packages/server/src/routes/settings.ts` | GET/PUT inbox-prefs 暴露 deferred 有效值 |
| `packages/web/lib/api.ts` | `InboxPrefs` 类型扩展 |
| `packages/web/components/SettingsPage.tsx` | 开关 UI + env snippet |
| `packages/web/components/ActivityTimeline.tsx` | 展示 reassignDraft note |
| `packages/server/src/orchestration/stale-runs.test.ts` | 默认关 / env / prefs / draft |
| `packages/server/scripts/e2e-slice70-deferred-escalate.mts` | unit + 可选 live GET prefs |

## 自测

```text
cd app/packages/server && pnpm exec tsc --noEmit   # clean
cd app/packages/web && pnpm exec tsc --noEmit      # clean

cd app/packages/server && pnpm exec vitest run src/orchestration/stale-runs.test.ts
# 22 tests PASS

cd app/packages/server && pnpm exec tsx scripts/e2e-slice70-deferred-escalate.mts
# unit PASS；live SKIP 若无服
```

## 默认关如何保证

- `getDeferredUnclaimedMs()`：无 env MS、无 AUTO env、prefs false → **0**
- `escalateDeferredUnclaimedRuns` 首行 `if (thresholdMs <= 0) return 0`（不扫库）

## 偏离

- 草稿 reassign **不**真改派（任务允许的最小可演示路径）
- 顺带修正 settings PUT 对 `notifyTypes` object 的接收（原仅 array 导致 UI 写类型无效）

## 未做 / 债

- 真 reassign assignee / 队列重派
- Playwright UI 勾选 e2e（有 unit + API e2e 脚本）

## 分支

- 未 commit / 未 push（按任务禁区）
