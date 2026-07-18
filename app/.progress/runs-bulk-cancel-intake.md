# Intake: runs-bulk-cancel

## 合并 / 位置
- Commit `00fb07d` 已在 `main` / `origin/main`
- Closeout：`app/.progress/runs-bulk-cancel-impl-1.md`
- Spec：`.scratch/runs-bulk-cancel/spec.md`

## 证据抽查
- 契约：`CancelRunsManyInput` / `POST /api/runs/cancel-many` / `useCancelRunsMany`
- UI：`runs-cancel-visible-active` + `runs-active-cancel-banner`
- Closeout 含 typecheck + API smoke + Playwright toast「已取消 2/2」
- 无密钥 / 无 wiki / 无 `*.db` 进 commit

## Spec 对照
- 当前列表可见 active 批量取消：有
- 确认 + toast + 列表刷新：有
- 复用 `cancelRunById`：有

## 债
- 无全库 cancel-all / 行 checkbox（刻意）
- 下一刀候选：cwd 持久化 ADR；Settings heartbeat / 收尸指标

## 判定
**通过** — 开下一刀 `settings-run-health`
