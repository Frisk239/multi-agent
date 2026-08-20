# Spec: Automation Webhook 触发

日期：2026-08-20
状态：已完成（closeout：`app/.progress/automation-webhook-trigger-impl-1.md`）
上一刀：`issue-due-date`（`app/.progress/issue-due-date-impl-1.md`）
调研：Multica 对照扫描候选 2；深读 `references/deep/multica.md` §Webhook 触发（`autopilot_webhook.go:343`：token → 规范化 envelope → 事件过滤 → delivery 落库 → DispatchAutopilot）

## 用户路径

操作者在 Automation 详情打开「Webhook」区块：生成 token 得到本地 URL（`POST /api/webhooks/<token>`）；本地脚本/git hook POST `{event, payload}` 触发该规则（与 run-now 同一 dispatch 核心，`source='webhook'` 可观测）；可配置事件名过滤；最近 deliveries（触发/过滤/失败）在详情可查；`event: "ping"` 仅测连通不触发。

## 参考与决策

- 学 Multica：token 即凭证、事件过滤、delivery 审计、复用 dispatch 核心（`dispatchAutomationRule`，`automation-dispatch.ts:586`——webhook 绕过 planner 直接调用，对齐 deep doc TS 移植要点）。
- **不做 HMAC**（per-provider 签名是云多租户需求；本地 loopback + 随机 token 足够）。token 是功能凭证非 LLM 密钥，存 DB 不违 ADR 0003（该 ADR 限定 Wiki LLM/embedding 密钥）。
- payload 第一刀仅存 delivery 审计，不注入模板（模板变量留下一刀）。
- 安全：token ≥32 hex 随机；轮换即失效旧 token；webhook 端点不经 `registerLocalTokenGuard` 的 token 校验（放行 `/api/webhooks/` 前缀——token 本身即凭证）；CORS 不放行该端点（浏览器跨域写天然被拒，防 CSRF；curl/本地脚本不受影响）。

## Must

1. **shared**：`AutomationRunSource` 扩为 `['schedule','manual','webhook']`；`WebhookDelivery` 契约（id/ruleId/event/status: `'dispatched'|'filtered'|'error'`/payloadJson/automationRunId?/error?/createdAt）；Automation detail 契约加 `webhookToken?/webhookEvents?`。
2. **server**：
   - migration 0057：`automation_rule` 加 `webhook_token`（text，unique index，nullable）、`webhook_events`（text nullable，逗号分隔）；新表 `automation_webhook_delivery`（FK rule cascade）。
   - `POST /api/webhooks/:token`：token 找规则（无→404，**不泄漏规则存在性**）；disabled/archived → 202 记 `error` delivery 不触发；`event==='ping'` → 200 `{ok:true}` 不触发不记 delivery；事件过滤（配置非空且 event 不在列表 → 202 记 `filtered` delivery 不触发）；通过 → `dispatchAutomationRule(ruleId, Date.now(), 'webhook')`，delivery 记 `dispatched`（含 automationRunId）或 run 终态 error（dispatch 内部失败如 agent_archived→skipped 仍算 dispatched，run 侧已有审计）。
   - 管理 API（走既有鉴权）：`POST /api/automations/:id/webhook/token`（生成或轮换，返回新 token）、`PUT /api/automations/:id/webhook/events`（过滤配置，空串/null=全部）、`GET /api/automations/:id/webhook/deliveries?limit=20`。
   - `checkLocalTokenAccess` 放行 `/api/webhooks/` 前缀（注释说明 token 即凭证）。
3. **web**：Automation 详情「Webhook」区块（`data-testid="automation-webhook-section"`）：无 token「生成 Webhook」；有 token 显示完整 URL（由 `API` base 推导）+ 复制 + 「轮换」（danger 确认「旧 URL 立即失效」）+ 事件过滤输入（逗号分隔，保存）+ deliveries 表（event/status/时间/run 链接，refresh 随 query invalidation）。
4. **测试**：shared 契约；server：token 对/错、ping、disabled/archived、事件过滤命中/未命中、delivery 落库、轮换后旧 token 404、guard 放行路径（不要求 X-MA-Token）；web：区块三态（无 token/有 token/轮换确认）、deliveries 渲染。≥12 用例。
5. **Owner 隔离 E2E**：UI 生成 → curl ping（200）→ curl 真事件（delivery dispatched + automation run 创建）→ 错 token 404 → 事件过滤 rejected/filtered → UI deliveries 可见。

## Out

- HMAC/per-provider 签名、GitHub 事件规范化、payload 模板注入（{{webhook.*}}）、webhook 触发频率限制、多 token。
- 不改 dispatch 核心语义/调度器；不做云端转发。

## 验收

- 隔离 E2E 证明端到端触发链与审计；错误 token/过滤/disabled 均不产生 automation run；轮换即失效；全量测试绿。
