# G2-4 读投影残留清理 closeout（2026-08-02）

> Goal G2 编排闭环 · Goal 第二波 M3 首刀（A2 低难度）。状态：**已关 ✅**

## 目标

WS 内部 / quick-run 等入口的 run 裸 shape → 统一 `toObservedAgentRun`，一处投影处处一致（A2）。

## 勘察结论

- `toAgentRun`（reshape.ts:233）不含 5 个可观测字段（queueAgeMs/queueEligibleAt/queueBlockedReason/heartbeatAgeMs/terminalReason）；`toObservedAgentRun`（:503）= toAgentRun + deriveRunObservability。
- shared AgentRun 中这 5 字段 `nullable().optional()`——裸 shape 能过 schema 校验，是残留不被发现的根因。
- **核心一致性缺口**：web `lib/ws.ts:341-347` 把 WS `event.run` 直接写进 react-query 缓存并**覆盖** API 返回的 observed 条目 → 队列/心跳/终态原因 UI 消失直到 invalidate 重取。

## 改动

10 处 WS 发布点 裸 `toAgentRun` → `toObservedAgentRun`：

| 文件 | 事件 |
|---|---|
| run-worker.ts | run:waiting_local_directory（:154）· run:running（:200）· run:cancelled（:618）· run:completed（:753）· run:failed（:851） |
| stale-runs.ts | publishFailedRun（:24） |
| subagent-dispatch.ts | run:queued（:260） |
| auto-retry.ts | run:queued ×2（:302/:322） |
| automation-dispatch.ts | run:queued（:342） |

测试：reshape.test.ts 补 toObservedAgentRun 3 用例（queued 年龄/退避、终态原因、failed reason 投影）；automation-dispatch.run-only 断言 run:queued 事件带全部可观测字段；stale-runs/subagent-dispatch 测试 mock 补 toObservedAgentRun 导出。

## 门禁

- server 741 / shared 121 / web 425（monorepo 1287）；typecheck 全仓绿
- 注：本会话全量测试多次出现瞬态 worker fork 崩溃（系统内存压力），复跑即绿——非代码回归

## 未做（后续刀）

- run-service.ts:127/:351 已 observed ✓；routes/runs.ts 全量 ✓；无残留发布点（grep 复核）
- quick-runs/chat 路由本就 observed ✓
