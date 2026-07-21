# UX Trust C1 — 同 localPath 简易串行

Date: 2026-07-21  
Branch: main

## 本刀范围

| 项 | 内容 |
|---|---|
| Must | `project_local` 同 path 任意时刻 ≤1 running；后到保持 queued；UI 可见占用/等待 |
| Out | Multica 文件锁 / `waiting_local_directory` 状态枚举 / leader 免锁 |

## Multica 对照

- 学 `local_directory` path mutex **语义**：真仓串行。  
- 本仓：DB 查 `running` + `cwd_mode=project_local` + 规范化 path key；claim 前 defer。

## 决策

| 项 | 选择 |
|---|---|
| 锁范围 | 仅 `project_local` |
| 后到 | 保持 `queued`，不 fail |
| 同 tick | `claimedPathKeys` 防双 claim |
| API | 计算字段 `pathWaitReason` / `pathBlockedByRunId` / `pathHolding` |

## 改动文件

- `app/packages/server/src/orchestration/path-lock.ts`（新）
- `run-worker.ts` · `routes/runs.ts` · `db/reshape.ts`
- `shared/schema.ts` AgentRun 字段
- `RunsPage.tsx` · `RunDetailPage.tsx` · `globals.css`
- `scripts/test-path-serial-c1.mts`

## 验收证据

| 项 | 结果 |
|---|---|
| `pnpm exec tsx scripts/test-path-serial-c1.mts` | **ALL PASS** |
| `pnpm typecheck`（app workspace） | **PASS** |
| 同 path | B defer + API path_busy；A 完成后 B free |
| 隔离 | 不 defer |

## 下一刀

**C2** Tool-aware idle / ToolWatchdog（`phase-multica-ux-trust` · plan wave-c）
