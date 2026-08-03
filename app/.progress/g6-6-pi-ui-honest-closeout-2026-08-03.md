# G6-6 pi extension_ui_request 诚实提示 —— closeout（2026-08-03）

**刀名：** G6-6 pi extension_ui_request 诚实提示（CLI 等确认不再静默）
**Goal：** G6（后端执行与运营精细度）/ 第八波第四刀（G6-1→G6-2→G6-3 既定三刀后按 §3 价值取用）

## 现状基线（开工前核对）

- `runtime/pi.ts:380-383` 收到 `extension_ui_request` 仅 log 一句「无 UI 会话，忽略」后继续——CLI 在等宿主应答（confirm/select/input…）期间 run 无任何可操作文案，静默挂着直到 idle sweeper 收尸（用户看到的只有「运行中」）。
- 上游参考：pi `rpc-types.ts:230-265` `RpcExtensionUIRequest` 判别联合——`{ type: 'extension_ui_request', id, method: 'confirm'|'select'|'input'|'editor'|'notify'|'setStatus'|'setWidget'|'setTitle'|'set_editor_text', title?, ... }`，**method 字段**标识请求类型（顶层 type 是通道名）。

## 落地改动

`runtime/pi.ts` handleLine 的 extension_ui_request 分支改造：
- 收到请求 → `onEvent({ type: 'log', text: '[pi] CLI 正在等待确认（<method>）：无人应答时按 idle 超时收尸，不会无限挂起' })`——run 详情/流式面板即时可见「CLI 在等确认」。
- **per-run 只提示一次**（`uiRequestNotified` 标志）：同一 run 多个请求（confirm→select…）不刷屏；文案带首个请求的 method 供诊断。
- 超时语义不变（宪法/现状）：CLI 等待期间无事件 → 无心跳 → idle sweeper 收尸（G5-4 进程生命周期已钉）。提示让「为什么卡住」诚实可见。

## 测试与实证

- `runtime/pi.test.ts` +1（假子进程 feedJson 协议帧级）：
  - confirm 请求 → run 收到「等待确认（confirm）」log，含「idle 超时收尸」「不会无限挂起」；
  - 连续两个不同请求（confirm + select）→ **只提示一次**（防刷屏）；run 正常完成不受影响。
- 门禁全量：`pnpm typecheck` 全绿；`pnpm test` **shared 121 + server 931 + web 465 = 1517 全绿**（1516 + 1）。
- 真机说明：触发真实 pi CLI 的确认请求需特定会话状态（不可控），协议帧级假子进程测试已精确覆盖行为（纯新增 log，不触碰主路径；既有 pi 16 用例全部回归绿）。

## 决策记录

1. **提示而非自动应答**：不替用户拒绝/确认（可能破坏意图）；诚实告知 + idle 收尸语义（roadmap 原文口径）。
2. **log 通道而非 run:progress 独立事件**：与 `[claude] session=…` 等既有运行时提示同通道，流式面板/详情统一渲染，零新 UI 面。
3. **method 进文案**：confirm/select/input 区分，用户可判断 CLI 要什么；per-run 去重防刷屏（长会话多请求场景）。

## 下一刀建议

§3 池剩余：**G6-4 sweeper 收尸路径原子化 + 假批量注释修正**（学 multica `agent.sql:569`；deferred 查重去 N+1；「批量更新」注释诚实性污点）或 **G6-7 Automation 连续 skipped 运营警示**（最近 N 次全 skipped → Settings 标黄 + 文案）。
