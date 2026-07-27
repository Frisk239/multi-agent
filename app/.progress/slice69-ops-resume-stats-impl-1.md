# Slice 69 · Ops：poison / resume_miss / deferred 计数 · impl-1

## 钉死决策

| 项 | 值 |
|---|---|
| 字段 | `resumeStats: { sessionPoisoned, resumeMiss, deferredUnclaimed, window }` |
| 窗口 | **`7d`**（`createdAt >= now - 7d`） |
| sessionPoisoned | `agent_runs.session_poisoned = 1` 且近 7 日 |
| resumeMiss | `session_resume_status = 'resume_miss'` 且近 7 日 |
| deferredUnclaimed | inbox `dedupe_key LIKE 'deferred:%'` 且 `read=0` 且 `archived=0` 且近 7 日 |
| UI | Settings Ops 卡只读一行 `data-testid="ops-resume-stats"` |
| Out | 时序 BI / last_200 备选（未用） |

## 改动文件

| 路径 | 作用 |
|---|---|
| `packages/server/src/ops-snapshot.ts` | `buildOpsResumeStats` + `OpsSnapshot.resumeStats` |
| `packages/shared/src/schema.ts` | Zod `resumeStats`（+ 补 `sqlite` optional） |
| `packages/web/components/SettingsPage.tsx` | Ops 卡展示 resume 统计 |
| `packages/server/src/ops-snapshot.test.ts` | unit 含键 |
| `packages/server/src/routes/ops.test.ts` | GET snapshot 含键 |
| `packages/server/scripts/e2e-slice69-ops-resume-stats.mts` | unit + 可选 live GET |

## 自测

```text
cd app/packages/shared && pnpm exec tsc --noEmit   # clean
cd app/packages/server && pnpm exec tsc --noEmit   # clean
cd app/packages/web && pnpm exec tsc --noEmit      # clean

cd app/packages/server && pnpm exec vitest run \
  src/ops-snapshot.test.ts src/routes/ops.test.ts
# 2 files / 8 tests PASS

cd app/packages/server && pnpm exec tsx scripts/e2e-slice69-ops-resume-stats.mts
# unit PASS (window + keys)；live SKIP 无服
```

## 偏离

无（窗口选 7d，未用 last_200）

## 未做 / 债

- live e2e 需 SERVER 可达；本地 dev.db 若未 migrate 到 66+ 列，整包 `buildOpsSnapshot` 会 WARN（`buildOpsResumeStats` 单独 PASS）
- 未让 resumeStats 影响 ops `status=degraded`（只读展示）

## 分支

- 未 commit / 未 push（按任务禁区）
