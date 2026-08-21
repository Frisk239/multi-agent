# Spec: Webhook 触发频率限制

日期：2026-08-21
状态：已完成（closeout：`app/.progress/webhook-rate-limit-impl-1.md`）
上一刀：`list-table-upgrade`（`app/.progress/list-table-upgrade-impl-1.md`）
来源：调研池候选（G5）；底座 = `automation-webhook-trigger`（delivery 审计表已有）

## 用户路径

本地脚本循环 bug 误打 webhook 时，同规则高频触发被滑动窗口限流：超限请求 429、delivery 记 `rate_limited`（不产生 automation run）；规则可在 Webhook 面板配置每分钟上限（留空=默认 10）。

## Must

1. **shared**：`WebhookDeliveryStatus` 加 `'rate_limited'`；`AutomationRule` 契约加 `webhookRatePerMin: number | null`（null=默认上限）。
2. **server**：migration 0058 `automation_rule.webhook_rate_per_min`（integer nullable）；`POST /api/webhooks/:token` 在事件过滤**之前**检查滑动窗口——最近 60 秒该规则 `dispatched` delivery 计数 ≥ 上限（`webhookRatePerMin ?? 10`）→ 429 `{status:'rate_limited'}` + 记 `rate_limited` delivery（不 dispatch）；管理 API `PUT /api/automation/rules/:id/webhook/rate`（body `{perMinute: number|null}`，校验 1-1000 或 null）；detail 契约带出。`ping` 不受限流影响（仍 200 不记 delivery）。
3. **web**：Webhook 面板加「每分钟上限」输入（`data-testid="automation-webhook-rate-input"`，数字，空=默认）+ 保存（`automation-webhook-rate-save`）；deliveries 表 `rate_limited` 显示「已限流」。
4. **测试**：shared 契约；server——超限 429+delivery、窗口滑出后恢复、null=默认上限、自定义上限生效、ping 不受限、rate PUT 校验（0/负数/1001 → 400）；web——面板输入保存、deliveries 限流文案；≥8 用例。
5. **Owner 隔离 E2E**：上限设 2 → 连发 4 次同事件 → 前 2 次 202 dispatched、后 2 次 429 rate_limited → deliveries 表 2+2 → UI 改上限 → 等窗口或新 token 后恢复触发。

## Out

- 全局（跨规则）限流、令牌桶/突发配额、按 IP 限流、429 Retry-After 精确计算（可给固定 hint）、UI 图表。

## 验收

- 误打脚本最多每分钟产生上限数量的 run；限流拒绝有 delivery 审计可查；默认行为（不配置）= 每分钟 10 次上限；全量测试绿。
