# G1-1 Pi runtime 真机验收 + RPC 命令面扩展 closeout（2026-08-02）

> Goal G1 执行层诚实性 · roadmap §4 队列第 2 刀（closeout 钦定「最值得下一刀」）。状态：**已关 ✅**

## 目标

Pi backend 从「mock 全绿」到「真机验收」：本机真跑通一次 issue 端到端（派活→执行→产出）；RPC 命令面从 prompt/abort/get_state 扩展 steer/compact/set_model（上游 rpc-types.ts:20-72 蓝图）。

## 改动

| 文件 | 改动 |
|---|---|
| `app/packages/shared/src/schema.ts` | `RunCommandInput`（discriminated union：steer{message} / compact{customInstructions?} / set_model{provider,modelId}）+ `RunCommandResult` |
| `app/packages/server/src/runtime/types.ts` | `RuntimeBackend.sendRunCommand?(runId, command)` 可选接口（未实现 = 路由 501） |
| `app/packages/server/src/runtime/pi.ts` | `PiCommand` union 扩展；`activeCommands` Map（execute 注册 / finish 注销）+ `sendRunCommand`：复用既有 pending-response 机制，success 判定 + error passthrough |
| `app/packages/server/src/routes/runs.ts` | `POST /api/runs/:runId/command`：zod 校验 → 404 → 409（非 running）→ 501（runtime 不支持）→ 502（backend 拒绝） |
| `app/packages/server/src/index.ts` | **顺带修复**：uncaughtException EPIPE 兜底（2026-08-02 实测：客户端断连会崩掉整个编排进程；EPIPE 忽略，其它异常照常退出） |
| `app/packages/web/lib/api.ts` | `useSendRunCommand(runId)` mutation（toast 反馈 + query 失效） |
| `app/packages/web/components/RunDetailPage.tsx` | run running + runtime=pi 时显示 steer 输入框 + 「推进」+「压缩上下文」按钮（Enter 提交；成功后清空输入） |
| `app/packages/server/src/runtime/pi.test.ts` | +5 用例：steer JSON 形状与 success / compact customInstructions 可选 / set_model + 失败 passthrough / 未活动 run / 结束后命令 |
| `app/packages/server/src/routes/run-command.test.ts` | 新建 7 用例：400 / 404 / 409 / 501 / 200 steer / 200 set_model / 502 |

## 真机验收证据（本机 pi 0.83.0 官方 npm 包）

1. **RPC 协议手工验证**：`get_state`（sessionId/model/steeringMode）→ `prompt`（success preflight）→ `agent_start` → `message_start/end` → assistant text+thinking 块 → `turn_end`（usage 含 cost）→ `agent_end willRetry=false` → `agent_settled`。**协议细节核对：stdin EOF 会令 pi 提前退出（exit 0 无 agent_end）——适配器持有 stdin 不受影响；message content 为块数组已处理。**
2. **端到端派活→执行→产出**（FRI-191，web API 派给 pi agent `pi-slice44-ms2qt5b7`）：run completed，messages 完整——user(prompt) → tool_start(`bash ls -1`) → tool_end(`(no output)` 真机 bash 结果) → assistant「我看到 0 个文件。」→ memory 沉淀；tokens 1527/112 落库。`/api/runtimes` 显示 `pi installed:true version:0.83.0`。
3. **steer 运行中真机发送**：`POST /api/runs/:id/command {"command":"steer"}` → `{"ok":true,"command":"steer"}`（spawn 未就绪时诚实报「没有活动中的 pi 进程」，重试一次即成功）。
4. **compact 真机到达**：pi 诚实拒绝 `Nothing to compact (session too small)` → 502 passthrough 正确。
5. **UI 闭环**（Playwright）：run 详情页 steer 输入 + 「推进」点击 → `POST .../command 200 OK` + 输入清空；截图 `.playwright-cli/g1-1-run-detail-steer.png`。
6. **cancel 真机**：卡住 run → cancelled（abort 命令 + killProcessTree 路径）。

## 测试与门禁

- `pnpm typecheck` 全仓绿（shared/server/web）
- server 全量 689 通过（87 文件）；web 全量 424 通过（60 文件）
- 新增：pi 命令面 5 用例 + run-command 契约 7 用例

## 决策

- **命令面三选**：steer / compact / set_model 按 roadmap 原文；set_model 仅 API + 测试（UI 需模型选择器，价值低且 pi `get_available_models` 未接入，后置）。
- **409 语义**：仅 `running` 可命令（queued/waiting 阶段子进程未 spawn，steer 无意义）。
- **501 语义**：非 pi runtime（claude-code/opencode/cursor/grok）诚实 501「不支持运行中命令」——G1-2 Grok ACP 完成后可复用同接口。
- **EPIPE 兜底**：10 行内进程级防护，归 G1-1 顺带（G5-4 生命周期收尾仍跟踪更深层修复）。

## 发现（留后续刀）

1. **pi 0.83 Windows bash 长任务异常**：`ping -n 15 127.0.0.1`（bash 工具）+ steer 排队组合下，run 卡在 tool_start 无 tool_end（>2min）；同环境无 steer 的干净任务正常完成。疑似 pi bash 工具 Windows 行为或 steer 排队语义——归 G1-4/G5-4 调查。
2. **tsx watch 在 Windows 不热重启**（改了代码后路由 404，需手动重启）——开发体验问题，归 G5-4。
3. pi 0.83 新增 `agent_settled` 事件（default 分支 log，无害）。

## 未做（后续刀）

- G1-2 Grok ACP/fail-closed（`sendRunCommand` 接口已为其铺路）
- G1-3 CLI 探测失败宽限窗 / G1-4 失败分类精度 / G1-5 降级可观测
- set_model 的 UI（模型选择器，需 get_available_models）
