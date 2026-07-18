# wiki-dead-bulk-retry

## 用户路径
运维在 Wiki dead 列表或 Settings 健康卡看到多条 dead → 一键批量重试 → 转 pending 并唤醒 worker。

## Must
- server：`retryWikiIngestJobsMany` + `POST /api/wiki/jobs/retry-dead`
- web：Wiki jobs 面板 + Settings wiki-auto 卡按钮
- typecheck + API + Playwright

## Out of scope
- 自动配 LLM key
- 改 maxRetries 策略
