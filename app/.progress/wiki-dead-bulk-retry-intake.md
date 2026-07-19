# Intake: wiki-dead-bulk-retry

## 合并
- `63d1c5c` 已在 `main` / `origin/main`

## 证据抽查
- `retryAllDeadWikiIngestJobs` + `POST /api/wiki/jobs/retry-dead`
- Wiki `wiki-jobs-retry-all-dead`；Settings 重试入口
- Closeout 含 typecheck + API + Playwright
- 无密钥 / wiki 运行产物进 commit

## Spec 对照
- 批量 dead→pending + wake：有

## 债
- 无选中行批量；无 LLM 时仍会再 dead（预期）

## 判定
**通过** — 开 `cwd-resolve-unify`
