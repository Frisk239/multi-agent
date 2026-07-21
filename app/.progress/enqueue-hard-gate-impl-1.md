# enqueue-hard-gate-impl-1（Slice 2 · UX gap F4）

Date: 2026-07-21  
Branch: main

## 本刀范围
派发**硬闸 + 可解释**：`cwd_missing` / `runtime_missing` / `readiness_error` 默认禁止 enqueue；返回 `IssueEnqueueMeta`；Inbox `action_required`；UI toast + EnvBanner 恢复分流文案。

## Multica 对照（短）
- `agent_ready.go`：archived / runtime bound / online 统一闸；assign / autopilot / squad-leader 共用。
- 本仓：`computeAgentReadiness` 已有 status；**本刀**把 hard statuses 接入 `checkAndEnqueue`（学「单源闸」）。
- busy **仍可排队**（与 Multica 排队语义一致，不因并发满硬拦）。

## 决策
| 项 | 选择 |
|---|---|
| 返回值 | `EnqueueResult` + 响应字段 `enqueue: IssueEnqueueMeta`（指派仍成功，不 409 回滚 assignee） |
| 硬闸 | `cwd_missing` / `runtime_missing` / `error`→`readiness_error` |
| 旁路 | `MA_ENQUEUE_ALLOW_NOT_READY=1` 仅本地排障 |
| 通知 | system comment + inbox（`already_active` 不写） |
| UI | toast 带恢复链（settings / runtimes）；EnvBanner 标明「指派不会开工」 |

## 改动文件
- `shared/schema.ts` — `EnqueueSkipReason` / `IssueEnqueueMeta`
- `server/.../run-service.ts` — async enqueue + 硬闸 + meta
- `server/.../inbox-writer.ts` — `notifyEnqueueSkipped`
- `server/.../issue-create.ts` / routes issues·comments·runs·automation
- `server/.../comment-trigger.ts` / run-worker / automation-*
- `web/lib/api.ts` — toast on skip
- `web` EnvBanner / AssigneeSelect / NewIssueForm / QuickDispatch
- `server/scripts/test-enqueue-gate-slice2.mts` / `test-enqueue-cwd-gate.mts`

## 验收证据
| 项 | 结果 |
|---|---|
| typecheck | `pnpm typecheck` 0 |
| already_active | `test-enqueue-gate-slice2.mts` PASS |
| cwd_missing 硬闸 | `test-enqueue-cwd-gate.mts` PASS（无效 MA_WORKSPACE_CWD + USE_WORKSPACE=1 → skipped, 0 runs） |
| API 指派 meta | PUT issue → `enqueue.status=queued` + runId |
| Playwright | 看板可进 Issue（assignee 控件在）；`/runtimes` 探测面；`/settings` cwd 文案；健康环境无 EnvBanner（预期） |

## 下一刀建议
**Slice 3 / F5** — Runs Mission Control CTA：chat 失败「打开会话」；retry 文案分支；进行中 chat 可 cancel。  
或 **F1** Project `localPath` per-project cwd（P0 结构债）。

## 不做（本刀）
- UI 硬拦截指派（仍可指派，服务端不开工）
- busy 硬拦
- PriorWorkDir / session 复用
- F3 idle/tool timeout
