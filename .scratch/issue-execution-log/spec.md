# Issue/Squad execution log controls

Status: done

## User path

在 Issue 或 Squad 详情里，操作员可以看到“在途/历史”分组；在途 run 显示实时等待/执行时长并可停止，失败/取消/超时 run 可定向重试原 run，所有行都能直接进入时间线/运行页查看 transcript。

## Must

1. Issue history active/past 分组，保留已有 run 选择和时间线行为。
2. active `queued`/`waiting_local_directory`/`running` 显示 live elapsed；有 active 时每 2.5 秒刷新 runs，空闲后停止轮询。
3. active 行提供 cancel；terminal failed/cancelled/timed_out 行提供 retry，必须传原 run id，不能退化为当前 assignee。
4. Issue/Squad 行提供 transcript/运行页深链；Squad 详情同样提供 active/past、elapsed、cancel、retry。
5. 保持本地 API 既有 cancel/retry 权限与 DB 状态闸，不引入新的并行状态机。

## Out

- 不新增远端服务、daemon、Redis 或新的 Agent loop。
- 不在本刀改 live restore、staged rollback 或项目级 Wiki 恢复。

## Research basis

- Multica `references/repos/multica/packages/views/issues/components/execution-log-section.tsx:91-166,251-357,365-430`：active/past 分组、running elapsed、行内 transcript/stop、terminal retry 原 task。
- 本仓既有 API `app/packages/server/src/routes/runs.ts:135-199`：messages、cancel、retry 已存在；前端本刀只补统一入口和轮询。
