# Slice 44 · 假成功 Backend 归零（H1）· impl-1

## 改了啥

| 文件 | 变更 |
|------|------|
| `app/packages/server/src/runtime/types.ts` | `RuntimeBackend.executionImplemented?: boolean`（缺省=true） |
| `app/packages/server/src/runtime/pi.ts` | `executionImplemented=false`；installed / not-installed 两路径均 `exitReason:'failed'` + 中文 error；禁止 `completed` / 假 finalText |
| `app/packages/server/src/orchestration/readiness.ts` | detect 后若 `executionImplemented===false` 且已安装 → `status:'error'`，detail 说明未实现/不可派活；`runtimeInstalled` 仍反映 detect |
| `app/packages/server/src/runtime/pi.test.ts` | 新建：mock detect-path，覆盖两 execute 路径 + 契约 |
| `app/packages/server/src/runtime/registry.test.ts` | Pi `executionImplemented===false`；其它 backend 非 false |
| `app/packages/server/src/orchestration/readiness-execution-implemented.test.ts` | mock db/getBackend：stub installed → error；未装 → runtime_missing；真 backend → ready |
| `app/packages/server/scripts/e2e-slice44-pi-honest-fail.mts` | API live：healthz → 建 pi agent → readiness 非 ready；无服 SKIP |
| `app/.progress/slice44-pi-honest-fail-impl-1.md` | 本草稿 |

## 怎么验

```bash
cd D:/code/multi-agent/app
pnpm exec vitest run packages/server/src/runtime/pi.test.ts packages/server/src/runtime/registry.test.ts packages/server/src/orchestration/readiness-execution-implemented.test.ts --reporter=dot
pnpm --filter @ma/server typecheck
cd packages/server && pnpm exec tsx scripts/e2e-slice44-pi-honest-fail.mts
```

## 命令输出摘要

- vitest：3 files / **12 passed**
- typecheck `@ma/server`：**ok**
- e2e（本机 server@3001 在线）：**PASS=4 FAIL=0 SKIP=1**
  - readiness `status=runtime_missing`（PATH 无 `pi`；仍非 ready，满足不可派活）
  - issue create optional SKIP（HTTP 400，未强求旁路）
  - log: `app/.progress/logs/slice44-pi-honest-fail-*.log`

## 残留 / 风险

1. 本机无 `pi` 时 e2e 只覆盖「未安装 → runtime_missing」路径；「已安装但未实现 → error」靠单测 + 契约。
2. `probeSuccessTTL` 仍按 agentId 缓存 detect 成功，单测须用独立 agentId（已处理）。
3. 未实现真 Pi SDK loop（Out of scope / Slice 45+）。
4. Owner 复跑后关刀见 [slice44-pi-honest-fail-closeout.md](./slice44-pi-honest-fail-closeout.md)。
