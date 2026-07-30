# Queue / terminal observability

## Must

- Keep existing `status`, `failureReason`, and `error` contracts unchanged.
- Expose additive per-run `queueAgeMs`, `heartbeatAgeMs`, and stable `terminalReason` on `/api/runs` list/detail.
- Extend `/api/ops/snapshot.runs` with a bounded oldest-queue sample and a recent terminal-reason aggregation.
- Let Settings link from an observed queue sample to `/runs` with the run id highlighted; show whether a terminal reason is auto-retryable.

## Out

- No DB migration or persisted terminal-reason column.
- No Prometheus/exporter or full run history redesign.
- No change to auto-retry allowlist or cancellation write path.

## Semantics

- Queue age: `queued.createdAt`; `waiting_local_directory.waitingLocalEnteredAt` with `createdAt` fallback.
- Heartbeat age: `running.lastHeartbeatAt`, then `startedAt`, then `createdAt`.
- Terminal reason: whitelisted `failureReason` where safe; `completed`, `timed_out`, `cancelled`, or `failed` status fallback. A cancelled status wins over stale non-cancellation failure text.
- Terminal aggregation window is seven days by `finishedAt`, with unfinished legacy rows falling back to `createdAt`.
