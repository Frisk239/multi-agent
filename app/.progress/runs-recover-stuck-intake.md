# Intake: runs-recover-stuck

## 合并 / 位置
- Commit `b302ca2` 已在 `main` 且 `origin/main` 同步
- Closeout：`app/.progress/runs-recover-stuck-impl-1.md`
- Spec：`.scratch/runs-recover-stuck/spec.md`

## 证据抽查
- 代码存在：`stale-runs.ts` 的 `failStaleQueuedRuns` / `recoverStuckRuns`；`POST /api/runs/recover-stuck`；Settings/Runs 入口
- Closeout 声明 typecheck 绿 + API seed/recover + Playwright 按钮可见
- 无密钥 / 无 wiki 运行产物进该 commit

## Spec 对照
- queued 过久 / missing agent 收尸：有
- 运维 API + UI：有
- 与 Multica FailStale/orphan 精神对齐：有（本地用 createdAt 龄期）

## 债
- closeout 建议下一刀：cwd 持久化 ADR；**runs bulk cancel**；heartbeat 指标
- 工作区已有 bulk cancel 半成品（未 commit）

## 判定
**通过** — 开下一刀 `runs-bulk-cancel`
