# Closeout: safe-restore-readiness

## 交付

- verified stage → 恢复影响预览 → durable restore journal。
- 预览记录 active run IDs、随机 confirmation token、中文确认短语和 live apply 能力。
- 全局 maintenance seam：开启时普通写请求返回 `503 MAINTENANCE_MODE`，GET/HEAD/OPTIONS 保持可用。
- Settings 展示恢复对象、在途 Run 数和 fail-closed 原因；当前版本确认按钮明确禁用。

## 安全裁决

当前 `db/client.ts` 将 better-sqlite3 与 Drizzle 作为跨模块不可替换单例导出，无法证明进程内文件换入后所有 route、worker、memory 引用都能安全重绑。因此本刀不开放 live apply，也不创建无意义的 rollback snapshot：

- `liveApplyEnabled=false` 时 API 在任何文件、快照或 maintenance 副作用前拒绝确认。
- journal 保持 `staged`，不伪造 `failed` 或 `applied`。
- 真正恢复必须先完成统一的可关闭/可 reopen 数据库生命周期。

## 证据

- `pnpm typecheck`：通过。
- `pnpm test`：shared 92、server 390、web 231，共 713 tests 通过。
- maintenance focused contract：POST `/api/issues` → 503；GET `/healthz` → 200。
- Playwright CLI（隔离临时 SQLite/backup 目录）：
  - 创建快照 → hash 校验通过 → 准备隔离 stage → 生成恢复影响预览。
  - 页面显示 snapshot、0 个在途 Run、fail-closed 原因。
  - 确认按钮为 disabled，文案“当前版本不可应用”。

## 与参考实现的关系

- Multica active task recovery 使用 CAS/recovery，而不是原样复活：`references/repos/multica/server/pkg/db/queries/agent.sql:558-648,689-785`。
- Hermes 导入先校验 archive/path，再显式 overwrite；单文件恢复使用临时文件替换：`references/repos/hermes-agent/hermes_cli/backup.py:471-653,917-990`。

## 下一刀

实现 `reopenable-db-lifecycle`：统一动态 DB accessor、worker stop/start、memory sqlite provider 绑定、active run recovery terminal。完成该 seam 后，才能在现有 journal 上实现 maintenance → rollback snapshot → atomic DB/Wiki swap → migrate/integrity → applied/rolled_back。
