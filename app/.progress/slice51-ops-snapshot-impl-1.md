# Handoff: slice51-ops-snapshot-impl-1

> 切片：`Slice 51 · Ops snapshot + live-probes 去 stub（O1）` · 角色：实现子代理 · 2026-07-27  
> 未 commit / 未 push

## 交付

### API
- `GET /api/ops/snapshot`（`packages/server/src/routes/ops.ts` + `ops-snapshot.ts`）
  - active/queued runs + 队列龄 p50/p95/max/avg
  - wiki dead/pending/running/failed/completed
  - memory breaker 状态
  - workers 上次 tick（复用 process-health）
  - automation last error（有则）
- `GET /api/settings/live-probes` 去掉 `_stub: true`
  - 真实 `allBackends().detect()` + `executionImplemented` readiness
  - 在途 agent_run 心跳 + `listActiveRunIds` 本进程标记

### Settings UI
- 健康摘要新增 **运维快照** 卡（`settings-ops-snapshot`）读 `/api/ops/snapshot`
- Live Probes 区接真实 API：runtime ready 条 + 在途 run 列表（无密钥 UI）

### 类型
- shared：`OpsSnapshot` / `SettingsLiveProbesResponse`

### 测试
- unit：`ops-snapshot.test.ts`、`settings-live-probes.test.ts`、`routes/ops.test.ts`
- e2e：`scripts/e2e-slice51-ops-snapshot.mts`

## 证据（本地）

- `pnpm --filter @ma/shared typecheck` 绿
- `pnpm --filter @ma/server typecheck` 绿
- `pnpm --filter @ma/web typecheck` 绿
- `pnpm exec vitest run packages/server/src -t "ops|snapshot|live-probe|process-health"` → 7 passed
- `pnpm exec tsx scripts/e2e-slice51-ops-snapshot.mts` → pass=6 fail=0
  - live `/healthz` 200
  - live `/api/ops/snapshot` 200 + 字段
  - live `/api/settings/live-probes` no_stub + runtimes=5

## 偏离

- 无 Prometheus/Grafana
- live-probes 不追踪 OS 子进程 PID（无 registry）；以 DB 在途 + AbortController 在途为准
