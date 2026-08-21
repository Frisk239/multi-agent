# Spec: Webhook Payload 模板注入

日期：2026-08-20
状态：已完成（closeout：`app/.progress/webhook-payload-template-impl-1.md`）
上一刀：`automation-webhook-trigger`（`app/.progress/automation-webhook-trigger-impl-1.md`）
参考：Multica 深读「payload 作为 JSON 块嵌进 issue description，agent 内联看到事件」（`references/deep/multica.md` §Webhook）

## 用户路径

操作者在 Automation 模板里写 `{{webhook.event}}` / `{{webhook.payload}}` / `{{webhook.payload.ref}}`；webhook 触发时 payload 内容渲染进 issue 标题/正文或 run prompt，agent 内联消费事件；schedule/manual 触发时这些占位符渲染为空串（模板可安全共用）。

## Must

1. **shared**（`automation-template.ts`）：`AutomationTemplateContext` 加可选 `webhook?: { event: string; payload: unknown }`；新增替换：`{{webhook.event}}`、`{{webhook.payload}}`（`JSON.stringify(payload,null,2)`）、`{{webhook.payload.<key>}}`（payload 为对象时顶层字段：字符串原样、其它 JSON.stringify；不存在/非对象 → 空串）；无 webhook ctx 时所有 `{{webhook.*}}` 占位符（含任意 key 形态）→ 空串。补测试 ≥6 用例。
2. **server**：`dispatchAutomationRule(ruleId, plannedAt, source, webhook?)` 第 4 可选参；渲染点（title/bodyBase，automation-dispatch.ts:458-462）把 webhook 传入 ctx；webhook 路由（automation-webhook.ts）POST 触发时透传 `{event, payload}`（delivery 已有 payload 审计不变）；schedule/manual 调用点零改动。补测试：webhook 触发 run 标题/正文含渲染值；schedule 触发模板含 webhook 占位符渲染为空。
3. **web**：Automation 表单模板输入区的变量提示文案补 `{{webhook.event}}`、`{{webhook.payload}}`、`{{webhook.payload.<字段>}}`（找现有 hint 文案位置对齐格式；webhook 区块内可加一句「模板可用 webhook 变量」说明）。
4. **Owner 隔离 E2E**：规则模板带 `事件 {{webhook.event}} @ {{webhook.payload.ref}}` → POST webhook（event=push, payload.ref=refs/heads/main）→ automation run（及 create_issue 模式的 issue）标题/正文含 `push` 与 `refs/heads/main`。

## Out

- 不做 payload 嵌套深层路径（`{{webhook.payload.a.b}}` 只支持顶层）、数组索引、payload 体积限制策略（delivery 已有审计）、模板预览渲染、HMAC。

## 验收

- webhook 触发的事件内容可被 agent 在 prompt/issue 正文内联看到；非 webhook 触发模板共用不炸；全量测试绿。
