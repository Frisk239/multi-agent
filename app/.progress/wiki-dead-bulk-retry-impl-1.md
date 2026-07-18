# Closeout: wiki-dead-bulk-retry

## 交付
- `retryAllDeadWikiIngestJobs` + `POST /api/wiki/jobs/retry-dead`
- web：`useRetryAllDeadWikiJobs`；Wiki jobs 面板 + Settings wiki-auto 按钮

## 证据
- typecheck 绿
- API：dead 4 → retry `{requested:4,retried:4}` → dead 0 / pending 4
- Playwright：Wiki `wiki-jobs-retry-all-dead`「全部重试 · 4」；Settings 对应按钮可见

## 决策
- 全量 dead 上限 100；复用单条 retry + wake worker
- 无 LLM key 时重试后仍会再 dead（预期）

## 债
- 无「仅选中行」批量；无 dry-run

## 给下一 Owner
- 主航道已厚；可选收官或人定新北星
