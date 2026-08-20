# Closeout: Automation Webhook 触发

日期：2026-08-20
产品提交：`ff6146c feat(automation): webhook trigger with token auth and delivery audit`
上一刀：`issue-due-date`（`app/.progress/issue-due-date-impl-1.md`）
调研：Multica 对照扫描候选 2 + 深读 `references/deep/multica.md` §Webhook（`autopilot_webhook.go:343`）

## 已交付

- **shared**：`AutomationRunSource` + `'webhook'`；`WebhookDelivery`/`WebhookTriggerInput`/token/events 契约；`AutomationRule` 暴露 `webhookToken`/`webhookEvents`（契约层归一空=全部）。
- **server**（migration 0057：`webhook_token` unique + `webhook_events` + `automation_webhook_delivery` 表）：
  - 公开 `POST /api/webhooks/:token`：token 即凭证（`checkLocalTokenAccess` 放行该前缀，+2 单测）；错 token 同形 404；`ping`→200 不记；disabled/archived→202+error delivery；事件过滤未命中→202+filtered；命中→复用 `dispatchAutomationRule(ruleId, now, 'webhook')`（run-only 核心，幂等占位）；一次 POST 恰一条 delivery（含 payload JSON 审计 + run 链接 + run.error 透传）。
  - 管理 API：token 生成/轮换（48-hex，轮换即失效）、事件过滤 PUT、deliveries GET（clamp 1-100）。
- **web**：Automation 页每规则「Webhook」面板——生成/URL+复制/轮换（danger 确认「旧 URL 立即失效」）/事件过滤编辑/deliveries 表（event/结果/时间/run 深链）；归档规则只读。

## 分工

实现子代理：全链路 + 27 新用例（shared 6 / server 14 / web 7）+ 迁移空库自验。
Owner：调研拍板、spec、seam 抽查（guard 放行/404 同形）、隔离 E2E、回归、提交关刀。

## 验收证据

- 全量 `pnpm -w test`：shared 145 / server 126 files / 1102 / web 87 files / 628 全绿；typecheck 3 包、check-docs 过。
- 隔离 E2E（fresh DB 含 0057，双端口，headless Chromium，脚本 `.scratch/automation-webhook-trigger/owner-e2e-20260820-1400/webhook.e2e.mjs`）：**9/9 PASS**——UI 生成 token（48-hex URL）→ 无浏览器 token ping 200（guard 放行实证）→ 真事件 202 dispatched + 恰一条 delivery + automation run `source=webhook` → 错 token 404 → 事件过滤 filtered → UI deliveries 表显示两条（含「已过滤」原因）。截图 `shots/`。

## 边界 / 债

- payload 仅存 delivery 审计，未注入模板（`{{webhook.*}}` 变量留下一刀——Multica 的 payload-进-description 是其价值核心，本刀先立触发与审计底座）。
- HMAC per-provider / GitHub 规范化 / 频率限制 / 多 token——Out 未做（本地 loopback 单用户，token 足够）。
- `.scratch/*/owner-e2e-*` 运行目录不 stage。

## 下一刀建议

- 候选 A（G2/G4）：**webhook payload 模板注入**（`{{webhook.event}}`/`{{webhook.payloadJson}}` 模板变量，让 agent 消费事件内容；本刀底座直接续）。
- 候选 B（G3）：看板泳道视图（按 agent 分道；调研池候选 3）。
- 候选 C（G3）：列表表格二阶（列选择/分组；调研池候选 4）。
