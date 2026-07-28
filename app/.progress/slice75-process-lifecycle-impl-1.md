# Slice 75 · 进程生命周期硬化 · closeout

> 2026-07-28 · Phase G P0 · 计划 [slice-plan-2026-07-27-phase-g.md](./slice-plan-2026-07-27-phase-g.md)

## 交付

| 路径 | 内容 |
|---|---|
| `packages/server/src/runtime/process-tree.ts` | 跨平台 `killProcessTree` + tracked child pid 表 + `killAllTrackedTrees` |
| `packages/server/src/runtime/process-tree.test.ts` | win32 taskkill / posix group / track 单测 |
| `packages/server/src/runtime/spawn-line.ts` | spawn 登记 pid；abort/timeout → tree kill；close 注销 |
| `packages/server/src/orchestration/graceful-shutdown.ts` | grace 后 residual tree kill；`getLastShutdownSnapshot` |
| `packages/server/src/orchestration/graceful-shutdown.test.ts` | residual / timeout / lastShutdown 单测 |
| `packages/server/src/process-health.ts` | `treeKilled?` 透传 |
| `packages/server/src/routes/healthz.ts` | 注入 lastShutdown.treeKilled |
| `packages/server/src/routes/ops.ts` + `ops-snapshot.ts` | snapshot.process.treeKilled |
| `packages/server/scripts/e2e-slice75-shutdown.mts` | unit 必绿 + live 可选 |

## Must 对照

1. ✅ Windows `taskkill /T /F` + POSIX 进程组 SIGTERM（`killProcessTree`）
2. ✅ spawn-line 登记 / 注销 pid；AbortSignal 走 tree kill
3. ✅ `shutdownServer` grace 后 residual `killAllTrackedTrees`
4. ✅ healthz / ops 可观测 `treeKilled`（上次关停快照）
5. ✅ unit（process-tree + graceful-shutdown + process-health）+ e2e unit 路径
6. ✅ 无云 / 无密钥入库 / 非 Multica daemon 1:1

## 证据

```text
# 跑测时写入（见同批 git commit message / 本地 log）
cd app/packages/server
pnpm exec vitest run src/runtime/process-tree.test.ts src/orchestration/graceful-shutdown.test.ts src/process-health.test.ts
pnpm exec tsx scripts/e2e-slice75-shutdown.mts
```

## 偏差 / 债

- 真 SIGTERM 杀活 CLI 的 live 段依赖 SERVER；无服时 live SKIP（不粉饰 PASS）
- 进程组 kill 仅在 detached/setsid 场景有效；Windows 主路径靠 taskkill `/T`
- Settings UI 未单独加「treeKilled」卡片行（API/ops 已暴露；UI 可后续薄补）

## 下一刀

**Slice 76** Memory 断路器 + 手感包（若 24 已有底座则加深观测/手感；否则补齐 breaker 日用路径）
