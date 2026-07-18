# Closeout: runs-recover-stuck

## 证据

- typecheck 绿（server/web）
- API seed+recover：
  - missing agent queued → `orphan: agent missing for queued run`
  - 40min queued → `stale: queued too long without claim`
  - report `{missingAgentQueued:1,staleQueued:1,total:2}`
- Playwright：Settings「收尸卡住 run」按钮可见；Runs failed banner「收尸卡住」可见

## 交付

- `failStaleQueuedRuns` / `failQueuedMissingAgentRuns` / `recoverStuckRuns`
- 启动与 15s sweeper 共用
- `POST /api/runs/recover-stuck`
- web `useRecoverStuckRuns` + Settings/Runs 入口

## 决策

- 参考 Multica `FailStaleTasks` / orphan recover 精神；本地无 prepare_lease，用 createdAt 龄期 + agent 存在性
- queued 超时默认 30 分钟，避免正常排队被误杀

## 再下一刀建议

- cwd 持久化 ADR；runs bulk cancel；heartbeat 指标到 Settings
