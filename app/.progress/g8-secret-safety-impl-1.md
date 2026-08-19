# Closeout: G8-3 · 旧密钥清库、envRef fail-closed 与备份诚实

日期：2026-08-17  
Spec：`.scratch/g8-trust-execution/spec.md` §G8-3 · `kickoffs/G8-3-secret-cleanup.md`

## 交付

- 新增 `secret-safety` 纯服务：对历史 `agent.env_vars` / `agent.mcp_servers` 做只读扫描；finding 固定为 `agentId / field / path / key / length / 12 位 SHA-256 指纹`，从不返回、记录或持久化原值。
- 默认 dry-run；`POST /api/ops/secret-safety/apply` 必须精确确认 `CLEAN_LEGACY_SECRET_LITERALS` 才会事务性清理：敏感 env 值清为空字符串、敏感 MCP leaf 删除、畸形 JSON 整列置空。不会猜测或写入 `envRef`。
- 运行前解析改为 fail-closed：敏感 Agent `envRef` 缺失、为空或非法，以及敏感 MCP `${env:NAME}` 未解析时，Worker 在 backend / 临时 MCP 文件之前结束 Run，持久化 `missing_required_env_ref`；错误只含宿主变量名和配置键，不含值。非敏感引用保持安全 warn / best-effort。
- 防新写入进一步收紧：敏感 MCP key 只能保存精确 `${env:NAME}`；number、boolean、null、object、array 等任何字面量一律拒绝。
- DB backup、灾备 snapshot manifest / create / list 都带 `secretSafety` advisory：`known_legacy_literals_detected`、`no_known_legacy_literals` 或 `scan_inconclusive`；旧 archive 无 metadata 时明确为待确认，而不称“安全”。
- Settings 加入“密钥安全检查”：默认不扫描、不显示值；扫描后只展示安全 finding；清理走危险确认弹窗。快照列表同步显示历史密钥风险状态。Run failure UX 显示“缺少宿主环境变量”并导向 Settings。

## 参考与取舍

- 调研报告：`.scratch/g8-trust-execution/research-secret-safety.md`。
- 参考 Multica 的 task-local 配置物化失败即终止与多层脱敏，以及 Hermes 的 secret reference 解析空值即抛错；本仓维持纯本地 env reference，不引入 vault/云服务。
- 选择共享 scanner/cleaner + 既有 local-token 保护的 `/api/ops` 路由，而非启动时自动迁移：先让操作者看到无值 dry-run，再做不可逆清理。
- 完整 SQLite/ZIP 备份仍是私有恢复包，不被误标为脱敏导出；风险 metadata 只说明可识别的历史字面量，不能承诺绝对无密钥。

## 证据

- `pnpm check`：通过。shared **123**、server **988**、web **477** tests；三个 package 的 TypeScript typecheck 均通过。
- G8-3 server 覆盖：legacy scanner/cleaner、畸形 JSON、敏感 env/MCP 缺引用、Worker no-spawn、ops scan/apply confirmation、DB backup、snapshot manifest/list、shared schema。
- Playwright（隔离临时 SQLite，迁移并 seed；未使用或修改本机默认开发 DB）：
  1. Settings → 环境诊断默认显示“尚未扫描”，扫描空库后显示“未发现已知历史敏感字面量”。
  2. 仅在隔离库写入合成测试字面量，扫描显示 agent/key/path/长度/指纹，而页面不出现原始测试值。
  3. 点击清理出现不可恢复确认；确认后自动重扫并回到“未发现已知历史敏感字面量”。
  4. 测试服务与浏览器均已停止。浏览器仅有既有 dev warning 与 `/favicon.ico` 404，未发现本刀应用错误。

## 偏离 / 限制 / 合并注意

- 无规格偏离；不做云 vault、密钥回填 UI 或 transcript 全量 scrub（G8-5）。
- 新发现的旧字面量只清理 live SQLite；已生成的历史 backup/snapshot 仍可能含旧值，需清理后重新创建备份。
- 当前 worktree 有大量非本刀 WIP，且 G8-2 含 `0053` migration；未 commit/push，避免混合提交。正常开发库合入前仍需按 G8-2 运行 `pnpm --filter @ma/server db:migrate`。

## 给下一 Owner

- 优先 G8-4：在派活前将 Runtime preflight、readiness 分层和 capability UI 做成诚实闭环；先对照 `references/deep/multica.md` / 当前 `RuntimeBackend` 适配器，避免把有副作用的 CLI 探测塞进 Settings。
- G8-5（transcript/log secret scrub）仍依赖本刀的语义边界，随后推进。
