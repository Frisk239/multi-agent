# Closeout: slice35-run-recovery-impl-1

> 切片：`slice35-run-recovery` · 角色：`owner/impl` · 日期：2026-07-27  
> 分支：`main` @ `091c639`（工作树未提交）

## 上下文

Run 恢复两洞（R4）：
1. `timed_out` 未纳入可 retry（前后端）
2. `waiting_local_directory` 仅续租、无墙钟上限，可能永久挂起

## 本会话完成了什么

- `RETRYABLE` 增加 `timed_out`（`run-service.ts`）；错误文案同步
- 前端可重试一致：`run-recovery.ts`、`RunStatusBar`、`AgentDetailPage`、`ChatPage` 失败态
- shared：`AgentRunFailureReason` 增加 `waiting_local_directory_timeout`
- `stale-runs.ts`：
  - `DEFAULT_WAITING_LOCAL_MAX_MS = 2h`
  - `getWaitingLocalMaxMs()` / `MA_WAITING_LOCAL_MAX_MS`（`0` 关闭）
  - `failStaleWaitingLocalDirectoryRuns`：`createdAt` 超墙钟 → `timed_out` + `failureReason=waiting_local_directory_timeout` + `notifyRunTerminal`
  - 接入 `recoverStuckRuns` / 周期 sweeper（续租仍在前，短 path-lock 等待不误杀）
- 单测：`stale-runs.test.ts`、`run-control.test.ts`（retry 接受 timed_out）
- recover toast 可选展示 `staleWaitingLocal`

## 自测结果（必须有证据）

```
$ pnpm exec vitest run packages/server/src/orchestration/stale-runs.test.ts \
    packages/server/src/orchestration/run-control.test.ts \
    packages/web/lib/run-recovery.test.ts packages/shared/src/schema.test.ts
 Test Files  4 passed (4)
      Tests  56 passed (56)

$ pnpm exec tsc --noEmit  # packages/server
（无输出，通过）
```

## 配置默认值

| 配置 | 默认 | 说明 |
|------|------|------|
| `MA_WAITING_LOCAL_MAX_MS` | `7200000`（2h） | waiting_local_directory 墙钟；`0`/`false` 关闭 |
| `DEFAULT_WAITING_LOCAL_MAX_MS` | `2 * 60 * 60_000` | 常量 |

## 偏离

无。用 `createdAt` 作 waiting 起点（无 enteredWaiting 字段）。

## 未做 / 债 / 合并注意

- settings runHealth thresholds 未暴露 waiting 墙钟（非 must）
- 工作区另有 slice32–34 / feel 等无关改动，本刀仅关注 run recovery 相关路径

## 给下一 Owner

- 验收优先：vitest 上述文件 + server typecheck；手工可把 `MA_WAITING_LOCAL_MAX_MS=1000` 造 waiting run 验证 fail + inbox
- 建议下一主题：若需要更准的 waiting 起点，可加 `enteredWaitingAt` 字段
