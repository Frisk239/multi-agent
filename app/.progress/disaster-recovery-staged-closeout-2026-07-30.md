# Isolated staged restore closeout — 2026-07-30

## Verdict

完成一个可安全验收的恢复中间层：从“dry-run 只描述，不执行”推进到“解包到隔离目录并验证”，但仍不允许覆盖线上 DB/Wiki。

## Research and decision

- Multica 的 active task recovery 是 CAS/lease 状态转换，重启时将旧 active 行统一标记为 `runtime_recovery`，不原样复活；见 `references/repos/multica/server/pkg/db/queries/agent.sql:558-648,739-785`。
- Hermes import 先做 archive/path/runtime 校验；checkpoint rollback 先留 pre-rollback snapshot，再 CAS 更新 ref；见 `references/repos/hermes-agent/hermes_cli/backup.py:471-653,750-875`、`tools/checkpoint_manager.py:794-849,873-1005`。
- OpenWiki 用稳定 hash 判断内容变化；见 `references/repos/openwiki/src/agent/utils.ts:136-250`。
- 因此本仓先选择 isolated staging + expiry + read-only integrity check，不引入 Git、不原样恢复 active run，也不提前开放 live swap。

## Delivered

- `app/packages/server/src/ops-recovery.ts`
  - `stageSnapshotRestore`：验证快照、隔离解包、随机 UUID staging、临时目录 + atomic rename。
  - staged SQLite 只读 `PRAGMA integrity_check`，并校验 `user_version` 与 manifest schema。
  - stage report 记录 DB/Wiki 路径、字节数、integrity、schema、expiry、`mutatesLiveState=false`。
  - `removeSnapshotStage` 按 UUID 清理；过期目录只在有合法 expiry marker 时自动清理。
- `app/packages/server/src/routes/ops.ts`
  - `POST /api/ops/snapshots/stage-restore`
  - `DELETE /api/ops/snapshot-stages/:stageId`
- `app/packages/shared/src/schema.ts`：stage create/delete contracts。
- `app/packages/web/lib/api.ts` + `SettingsPage.tsx`：准备隔离包、显示 integrity/expiry/stage id、清理隔离包。
- `ops-recovery.test.ts`：隔离包内容、schema/integrity、线上 DB/Wiki 不变、显式清理。

## Evidence

- `pnpm typecheck`：shared/server/web 全通过。
- focused server tests：2 files / 8 tests passed（包含 staged restore）。
- Playwright：Settings 创建 snapshot → “准备隔离包” → `DB integrity ok`、Wiki 40 个、显示 expiry/stage id → “清理隔离包”；浏览器无业务错误，只有既有 favicon 404 与开发 WebSocket warning。

## Remaining hard gaps

- 仍未做 live swap、maintenance/quiesce、active run recovery、rollback journal、project Wiki mapping。
- 下一刀优先补 Issue/Squad execution log：按 active/past 分组、行内 cancel/retry、live elapsed 和 transcript；证据见 `app/packages/web/components/IssueRunHistory.tsx:156-217`、`app/packages/web/components/SquadRunsTimeline.tsx:138-198`，并对照 Multica `execution-log-section.tsx:55-140,245-400`。
