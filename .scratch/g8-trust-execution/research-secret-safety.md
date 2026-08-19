# G8-3 调研：旧密钥清库、envRef fail-closed 与备份诚实

> 2026-08-17；只读调研。未改 `app/` 或 `references/repos/`。

## 结论与推荐边界

推荐做**一个纯扫描/清理服务 + 受现有 local-token 约束的 ops 路由**，而不是启动时自动迁移或另造 vault：

1. 默认 dry-run，只返回 `agentId`、字段/路径、key 名、长度和短指纹，绝不返回原值；`apply` 要显式确认。
2. 正常 JSON 中的敏感 `env_vars` 字面量清为空值；敏感 MCP leaf 直接删除（不能改成空字符串，否则现有校验仍判为明文）；畸形旧 JSON 整列清空并报告。**不自动猜/写 env 名**，可给形如 `FOO_TOKEN` 的建议，但由用户回填 `envRef`。
3. 在 Worker、写临时 MCP 文件/启动 CLI **之前**解析引用：敏感 key 的引用缺值立即失败，错误只含宿主变量名；非敏感引用可保留 warn+不注入的现有宽松语义。
4. `createDbBackup` 和 ZIP snapshot 都是 SQLite 的逐字副本；两者返回/manifest 都应带“历史敏感明文风险”的诚实状态。扫描为 0 只能叫 `no_known_legacy_literals`，不能宣称“绝对安全”。

这正好符合本仓“密钥不落库、不在 UI 回填”的约束，且不引入云 vault。

## 上游一手证据

| 项目 | 原始实现 | 可借鉴做法 |
|---|---|---|
| Multica | `references/repos/multica/server/pkg/agent/codex.go:860-887` | MCP 的 env 可能是密钥，因此写入 task-local、`0600` 的 `CODEX_HOME/config.toml`，避免 argv/日志泄漏；无法物化受管配置或缺 `CODEX_HOME` 时直接失败，禁止悄悄继承用户全局 MCP。 |
| Multica | `references/repos/multica/server/pkg/redact/redact.go:73-106,123-149,166-180` | 对嵌套 map/slice 逐层拷贝并脱敏；超过深度以 placeholder 取代原值，fail-safe 而非回传未处理字符串。`server/internal/handler/agent_env.go:128-139` 还规定审计写入失败就不返回明文。 |
| Multica | `references/repos/multica/server/pkg/taskfailure/classify.go:92-101` | 将缺环境变量/API key 分类为“missing config”，区别于认证失败，便于给出可行动的修复提示。 |
| Hermes | `references/repos/hermes-agent/agent/secret_sources/onepassword.py:250-302` | 解析 secret reference 时，子进程失败或空值都抛错，绝不以空串静默覆盖原凭据。 |
| Hermes | `references/repos/hermes-agent/agent/credential_persistence.py:17-26,151-174` | 新的外部 secret source 默认按 borrowed/reference-only 对待；落盘前删除原始 secret，只保留 source/不可逆指纹等元数据。 |
| Hermes | `references/repos/hermes-agent/hermes_cli/backup.py:292-464` 与 `profile_distribution.py:96-119` | “私有恢复备份”走全量文件/安全 SQLite copy，和“可分享分发包”是两种产品：后者明确排除 `.env`、`auth.json`、DB 与 runtime state。不要把完整备份误标成已脱敏导出。 |

## 本仓现状与明确差距

### 已具备（当前未提交 WIP，应该复用）

- 新写入已在 `runtime/agent-config.ts:13-32` 拒绝敏感 `envVars` 明文，`runtime/mcp-config.ts:59-94` 拒绝敏感 MCP leaf 明文；`roster.ts:102-109,164-176` 将其接到 POST/PATCH。
- API 回读已防御性脱敏：`db/reshape.ts:403-469` 不回显敏感 env 值，`mcp-config.ts:103-141` 脱敏旧 MCP 行。
- 执行端已拒绝重注入旧敏感 env 明文：`runtime/agent-inject.ts:21-31`；Worker 也会拒绝结构上仍含敏感 MCP 字面量的行：`orchestration/run-worker.ts:374-381`。
- Wiki 文件入 snapshot 已排除明显 secret 名/证书：`ops-recovery.ts:250-276`。

### 仍缺（G8-3 Must）

1. **历史 SQLite 仍有原值。** 上述措施只防新写入/API 回显；没有扫描或 apply 清理，旧 `agent.env_vars`/`agent.mcp_servers` 仍会被 DB/ZIP 备份复制。
2. **envRef 缺值会静默降级。** `parseAgentEnvVars` 在 `agent-inject.ts:21-26` 遇到缺失 `process.env[envRef]` 直接略过；`resolveEnvReference` 在 `mcp-config.ts:22-25` 把缺失引用变成 `''`，再由 Claude/ACP 投影使用。Worker (`run-worker.ts:386,629-644`) 无法区分“没有配置”与“必须的引用未解析”。
3. **备份没有风险语义。** `ops-backup.ts:149-217` 返回的是原 SQLite clone；`ops-recovery.ts:295-398` 又把同一 DB 写入 `db/backup.sqlite`。两者的响应/manifest 均未声明旧库可能含密钥。
4. **可观测分类不足。** 当前缺引用只能落为通用失败；建议新增明确 `missing_required_env_ref` failure reason + UI 文案，至少保证错误为“宿主环境缺少 FOO（供 BAR 使用）”，不带值且不自动重试。

## 可执行选项

| 选项 | 内容 | 取舍 |
|---|---|---|
| A. 启动时自动迁移 | server 启动即删除历史敏感字段 | 不推荐：无 dry-run、意外破坏配置，违背 kickoff 的显式 apply 要求。 |
| B. CLI-only 清库 | `ma ops secret-safety scan/apply` 直连 DB 或 server | 可做但当前 CLI 主要为 Wiki；会重复 API/auth 与返回 envelope 习惯，且 Settings 难复用。 |
| C. 共享服务 + ops route + 备份 advisory | `secret-safety.ts` 纯函数扫描/修复；`POST /api/ops/secret-safety/scan`、显式 apply；备份复用扫描摘要 | **推荐。** 贴近已有 `/api/ops/*` 与 local-token 惯例，服务可单测，之后 UI 只需调用，不显示密钥。 |

## 推荐落点与验收

- 增加 `secret-safety.ts`：规范化/遍历敏感 key；合法 JSON 精确清理，畸形 JSON 作为不可恢复字段清空；同一事务更新；返回仅安全 finding。可选短 SHA-256 指纹仅用于本次报告关联，绝不写回 DB。
- 增加 `resolveAgentEnvVars`、`resolveMcpServersEnv` 的结果型 API：`missingSensitiveRefs` 直接让 `run-worker` 的 `failRun` 终止；非敏感只记录 safe warning。不要让 `''` 成为敏感引用的运行时值。
- `ops-backup` 与 `createSnapshot` 复用 scanner，返回/manifest 写入 `secretSafety`（`known_legacy_literals_detected | no_known_legacy_literals | scan_inconclusive`）及迁移提示；snapshot 同样需要，不能只改 `.db` 备份。
- 测试至少覆盖：dry-run 无原值、apply 后数据库字符串不含 fixture、畸形旧 JSON 安全清空、敏感 envRef/MCP envRef 缺失立即失败、非敏感缺值只 warn、两类备份的风险字段。

## 不应重做/不应碰的现有 WIP

- 不要推翻或重写 `runtime/agent-config.ts`、`runtime/mcp-config.ts` 的**新写入拒绝 + canonical MCP + API 脱敏**；G8-3 只在它们旁边加 legacy scanner 和运行时解析结果。
- 不要把 `agent-inject.ts` 再改回“敏感明文可注入”，也不要让 `reshape.ts`/`roster.ts` 回显旧值。
- 不要碰无关的未提交 G8-2 execution ownership 文件/迁移（`0053_run_execution_owner.sql`、`execution-ownership.*`、`process-identity.*`）、memory project WIP（`0052_memory_project.sql` 等）或 `references/repos/`。
- 不做 UI secret 回填、云 vault、全量 transcript scrub（后者属于 G8-5）。
