# UX Trust C2 — Tool-aware idle / ToolWatchdog

Date: 2026-07-21  
Branch: main

## 本刀范围

| 项 | 内容 |
|---|---|
| Must | tool in-flight 用 `MA_ISSUE_TOOL_IDLE_MS`（默认 2h）；无 tool 仍 `MA_ISSUE_IDLE_MS`（30m）；失败人话 |
| Out | Codex semantic idle、OpenCode 专用 10m、DB 持久化 toolDepth |

## Multica 对照

- `DefaultAgentIdleWatchdog=30m` / `DefaultAgentToolWatchdog=2h`（`daemon/config.go`）
- 本仓：进程内 depth + sweeper 窗口切换

## 决策

| 项 | 选择 |
|---|---|
| 状态 | 内存 Map（`tool-watchdog-state.ts`） |
| chat | 仍 2min 进程 heartbeat，不接 tool 窗口 |
| 文案 | `stale: tool watchdog (tool X in flight…)` |

## 改动

- `tool-watchdog-state.ts` · `stale-runs.ts` · `run-worker.ts` onEvent/finally
- `shared/schema.ts` `classifyRunFailure`
- `scripts/test-tool-watchdog-c2.mts`

## 验收

| 项 | 结果 |
|---|---|
| test-tool-watchdog-c2 | **ALL PASS** |
| typecheck | **PASS** |

## 下一刀

**C3** Skills 按 project 运营

## 推送债

C1 commit `89194d4` 与本刀若网络仍失败 → 本地 ahead；`git push origin main` 需代理/网络恢复后补推。
