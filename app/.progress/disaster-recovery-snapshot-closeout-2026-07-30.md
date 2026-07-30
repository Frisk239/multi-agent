# Disaster recovery snapshot v1 closeout — 2026-07-30

## 结论

本刀把“只有 SQLite `.db` 备份、没有可验证恢复边界”的运维缺口推进到一个可日用的安全子集：Settings 可以创建、列出、校验 `.ma-backup.zip`，并生成不写线上状态的恢复演练报告。没有实现 live restore，因此不会把一次误操作变成不可逆覆盖。

## 参考与选型

- Hermes `references/repos/hermes-agent/hermes_cli/backup.py:256-286,471-653,750-875`：ZIP/manifest、WAL-safe SQLite、排除项、路径穿越校验和 restore report。
- OpenWiki `references/repos/openwiki/src/agent/utils.ts:138-240`：稳定目录快照/hash，支持重复运行不产生噪声。
- Multica `references/repos/multica/server/internal/handler/task_lifecycle.go:16-55`：启动收尸和可观测恢复语义，说明恢复必须有状态边界而不是只放一个静态按钮。
- 研究摘要：[disaster recovery research](../../.scratch/disaster-recovery/research.md)。

## 交付

- `app/packages/server/src/ops-recovery.ts`
  - 版本化 `.ma-backup.zip`（archiveVersion=1）和 `manifest.json`。
  - 使用 better-sqlite3 `.backup()`，不复制 live `-wal/-shm`；收集解析后的全局 Wiki。
  - manifest 记录 DB schema、workspace cwd 来源、Wiki 来源/排除项、文件大小和 SHA-256。
  - 创建使用临时文件 + rename；list/create/validate/dry-run restore 均有明确结果。
  - 校验拒绝未知版本、缺 manifest、零字节 DB、哈希/大小不一致、重复/未列出的文件、路径穿越、畸形 manifest/ZIP；Wiki 符号链接、运行时目录、缓存、密钥和 WAL/SHM 侧车不入包。
- `app/packages/server/src/routes/ops.ts`
  - `POST/GET /api/ops/snapshots`
  - `POST /api/ops/snapshots/validate`
  - `POST /api/ops/snapshots/dry-run-restore`
  - 另提供按名称的 resource-shaped aliases。
- `app/packages/shared/src/schema.ts`：manifest、list、validation、create、dry-run contracts。
- `app/packages/web/lib/api.ts` + `SettingsPage.tsx`：Settings 灾备区，展示 hash/大小/时间，提供创建、校验、恢复演练和错误反馈。
- 测试：[ops-recovery.test.ts](../packages/server/src/ops-recovery.test.ts)：确定性 manifest、Wiki/DB 包含、密钥排除、篡改/畸形/穿越拒绝、dry-run 不写线上文件。

## 验证证据

- `pnpm typecheck`（shared/server/web）通过。
- 根目录 `pnpm test` 已改为按 package 配置运行并全绿：shared 5 files/90 tests、server 57/356、web 34/206。
- `pnpm exec vitest run packages/server/src/ops-recovery.test.ts packages/server/src/ops-backup.test.ts packages/server/src/routes/ops.test.ts`：3 files / 16 tests passed。
- Web focused tests（`run-recovery`、`RunEventTimeline`）：2 files / 12 tests passed。
- Playwright 真浏览器：Settings → 环境诊断 → 灾备快照；创建后显示 `41 files / Wiki 40`、`hash valid`，校验显示“校验通过”，恢复演练显示 DB bytes/Wiki 数量且“未修改线上状态”。仅有开发环境 WebSocket 未连接和 favicon 404 噪声，无业务错误。

## 约束与下一刀

- 当前只支持 stored ZIP；不做压缩兼容、下载/删除/保留策略，也不做 live restore、staged swap、rollback 或 worker quiesce。
- 当前明确只打包全局 Wiki；项目级 Wiki 根不入包，并在 manifest 标注 `projectScopedExcluded=true`。下一刀需要先设计项目映射和恢复覆盖报告。
- 下一阶段高价值硬缺口：安全的 staged restore（隔离临时 DB/Wiki、完整校验、人工确认、旧状态保留、失败回滚）以及 retention/download/restore audit；在这之前不开放任何覆盖线上文件的按钮。

## 工作区卫生

本刀只应提交 snapshot 相关文件；README、`app/.opencode/`、临时交互脚本、阶段计划和其他测试草稿等既有用户改动保持未触碰。
