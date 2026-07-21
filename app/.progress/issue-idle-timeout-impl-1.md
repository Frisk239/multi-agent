# issue-idle-timeout-impl-1（F3 · UX gap）

Date: 2026-07-21  
Branch: main

## 本刀范围
Issue/QC **活动 idle 超时**（默认 30min，学 Multica IdleWatchdog）+ 可选 **wall**（`MA_ISSUE_TIMEOUT_MS`，默认 0=不硬杀）；人话分类；Settings 展示阈值。

## Multica 对照
| Multica | 本仓 |
|---|---|
| `DefaultAgentIdleWatchdog=30m` | `MA_ISSUE_IDLE_MS` 默认 30m |
| `DefaultAgentTimeout=0` | `MA_ISSUE_TIMEOUT_MS` 默认 0 |
| 事件续命 | onEvent 任意事件 `touchRunHeartbeat` |
| Tool watchdog 2h | 本刀不做 tool 解析 |

## 决策
| 项 | 选择 |
|---|---|
| issue 心跳 | **仅事件 touch**（去掉 5s 无脑 pulse，否则 idle 永不到） |
| chat | 保留 5s 进程 pulse + 2min stale + 15min wall |
| idle 文案 | `stale: idle timeout (no agent events for 30m)` |
| wall | 复用 spawn-line `timeoutMs` |
| 0 关闭 | `MA_ISSUE_IDLE_MS=0` 关 idle 收尸 |

## 改动
- `stale-runs.ts` — kind 分流 + env helpers + abort 杀 CLI
- `run-worker.ts` — issue 事件 heartbeat；wall 传入 execute
- `classifyRunFailure` — idle 优先于通用 timeout
- Settings runHealth thresholds + UI
- `scripts/test-issue-idle-timeout.mts`

## 验收
| 项 | 结果 |
|---|---|
| typecheck | 0 |
| unit | issue idle fail + chat heartbeat fail PASS |
| API | `issueIdleMs=1800000` `issueWallTimeoutMs=0` |
| Playwright | 环境诊断 → issue idle **30min** · wall **不限** |

## 下一刀
F6 按 project cwd 注 AGENTS/skills；或 F7 Settings 可行动 CTA。

## 不做
- tool_use 级 watchdog  
- 按 runtime 分 idle（opencode 10m 等）  
