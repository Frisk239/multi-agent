# Intake: run-observability-consistency — 2026-07-30

## Verdict

有条件通过。

## Merge

`9300789`、`1e304fd` 均已进入 `origin/main`；核验时 `HEAD` 与 `origin/main` 一致。

## 抽查

- Settings queued/waiting/running 统计、`waitingLocalEnteredAt` fallback 与 `0` 禁用 near-risk：通过。
- 公共 run read projection 与 Agent/Issue active 统计：通过。
- Live Probes queue age / heartbeat age 语义：通过。
- focused Vitest：2 files / 6 tests 通过。
- slice commits 无密钥、`wiki/`、DB、Playwright 运行产物。

## 条件与债务

- 后续附件粘贴提交一度重复定义 `handlePaste`，本次 intake 已恢复主线 typecheck。
- Playwright 证据仅为 closeout 文字记录，可重放性较弱。
- 公共 read entrypoints 尚缺覆盖 Agent、Quick-create、Chat、rerun、cancel、queue 的契约矩阵测试。
- 未跟踪的 `app/.opencode/`、`app/.tmp-staged-verify/` 属运行产物，不得进入提交。
