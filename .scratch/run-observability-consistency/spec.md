# Run observability consistency

## Must

- Settings run health must count `queued`, `waiting_local_directory`, and `running` consistently with Ops snapshot.
- Waiting age uses `waitingLocalEnteredAt` with `createdAt` fallback; waiting wall-clock limit is configurable and `0` disables near-risk alerts.
- Public run read responses from `/api/runs`, Agent runs, Quick-create, Chat, and Issue rerun/cancel/queue use the same additive `queueAgeMs`, `heartbeatAgeMs`, `terminalReason` projection.
- Live Runtime Probes must label waiting/queued age as queue age and running age as heartbeat age.

## Out

- No persisted dynamic age fields.
- No changes to internal lifecycle event source-of-truth or auto-retry policy.
- No RunTree DTO redesign or path-holder enrichment in this slice.
