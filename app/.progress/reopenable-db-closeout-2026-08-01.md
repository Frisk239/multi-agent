# reopenable-db-lifecycle · 关刀 closeout（2026-08-01）

> 主线刀（CONTEXT.md「下一刀默认」）完成。commit：`4887e29`（D1-D4）+ `7b1459b`（D5）。
> 拆解文档：`reopenable-db-lifecycle-breakdown-2026-08-01.md`（实施记录）

## 完成内容

| 步 | 内容 | 证据 |
|---|---|---|
| D1 | `db/client.ts`：`export let sqlite/db` + `swapDatabase(newPath)`（关旧/开新/pragmas/drizzle 重建）。**ESM live binding 让 58 个 import 方零改动跟随**（livebind.test.ts 验证） | swap.test.ts 3 例（真实文件 A/B/A 数据切换/可写/幂等） |
| D2 | `db-lifecycle.ts`：`swapDatabaseUnderMaintenance`——D4 终态化 → stop run+automation worker → swap → 重启（finally 保证恢复） | db-lifecycle.test.ts 3 例（终态化/编排/失败路径） |
| D3 | memory sqlite provider：**零改动**（live-bound db 自动跟随） | — |
| D4 | `terminalizeActiveRuns`：abort 在途子进程（run-control）+ 条件 UPDATE 终态化 | 同上 |
| D5 | `safe-live-restore.ts`：preview 解锁 `liveApplyEnabled=true`；confirm 实现 apply 闭环（maintenance → extract zip db → migrate 增量 → swap → journal applied；失败记 failed，rollback snapshot 已生成供人工再恢复）；旧 journal 防御保留 | safe-live-restore.apply.test.ts 2 例（全链路 applied + 消费方切快照库；extract 失败路径）+ 既有 fail-closed 契约更新 |

**顺带修复（D5 调试发现的产品级 bug）**：`createSnapshot` 秒级时间戳命名——restore 流程里目标快照与 rollback snapshot 同秒创建时**同名互相覆盖**（rollback 覆盖目标 zip → 恢复进活库）。已加 3 字节随机后缀。

**Settings UI 零改动**：确认按钮按 `liveApplyEnabled` 动态控制，D5 解锁后自动启用。

## 验收

- server **657 用例全绿** + 三包 typecheck 全绿
- D5 全链路：createSnapshot → stage → preview（liveApplyEnabled=true）→ confirm → journal=applied → 消费方切到快照库（旧库数据不可见）+ rollback snapshot 生成
- 全部 push `feat/issue-workbench`

## Remaining / 后续

- **Wiki 换入**未做（stage.json 结构只有 database.integrity；wiki 有 global/project 多根，建议另开刀：stage 扩展 wiki 校验 → swap wiki 目录 → journal wiki 字段）
- `ma wiki query --roots` CLI flag（P2-3 Out，UI 开关已做）
- skill/scanner + import-url 完整测试（W5 Out）
- CONTEXT.md 的「刻意不做：live restore 全量 swap」条目可删（已解锁）；「下一刀默认」可更新
