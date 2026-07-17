# Closeout: inbox-fail-retry

## 证据

- typecheck 绿
- Playwright `/inbox?kind=run_failed`：
  - `inbox-retry-run` ×20
  - cwd 失败 `inbox-fail-settings` ×19
  - strip `inbox-fail-settings-strip` → `/settings`

## 交付

- 失败通知行内再执行（`useRetryRun`）
- cwd 文案 → 环境；失败条补 settings

## 再下一刀建议

- settings 诊断完成后回跳 runs/inbox；批量已读失败
