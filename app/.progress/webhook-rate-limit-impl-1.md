# Closeout: Webhook 触发频率限制

日期：2026-08-21
产品提交：`b30c032 feat(automation): webhook rate limiting`
上一刀：`list-table-upgrade`（`app/.progress/list-table-upgrade-impl-1.md`）

## 已交付

- **shared**：`WebhookDeliveryStatus` + `'rate_limited'`；`AutomationRule.webhookRatePerMin`（1-1000 nullable）；`UpdateAutomationWebhookRateInput` + `DEFAULT_WEBHOOK_RATE_PER_MIN=10`/`MAX=1000` 常量。
- **server**（migration 0058 `webhook_rate_per_min`）：`POST /api/webhooks/:token` 滑动窗口限流（60s 内 `dispatched` delivery 计数 ≥ 上限 → 429 + `retry-after: 60` + `rate_limited` delivery 审计，不建 run）；检查位置 = disabled/archived 门后、事件过滤前（坏规则保留 error 审计不被限流吞掉）；只有真实触发占额（filtered/limited/error/ping 豁免）；`PUT .../webhook/rate`（null=恢复默认，非法 400）。
- **web**：面板「每分钟上限」输入（placeholder 默认 10/分钟，空=恢复默认，非法本地拦截）+ deliveries 表「已限流」pill（skipped 色，非告警色）。

## 验收证据

- 全量 `pnpm -w test`：shared 153 / server 1113 / web 662 全绿（+11 用例）；typecheck 3 包、check-docs 过；迁移 tmp 空库自验（59 条迁移至 0058）。
- 隔离 E2E（fresh DB，脚本 `.scratch/webhook-rate-limit/owner-e2e-20260821-1130/rate.e2e.mjs`）：**9/9 PASS**——上限 2 → 连发 4：前 2 次 202 dispatched、后 2 次 429 rate_limited（带 retry-after: 60）；deliveries 恰 2+2；ping 超限下仍 200；UI 面板回显上限、deliveries 显示「已限流」、UI 改上限 5 后恢复 202 触发。截图 `shots/`。

## 边界 / 债

- 全局跨规则限流、令牌桶突发、按 IP、精确 Retry-After——Out 未做。
- 429 响应体 `{success:false, status:'rate_limited', error:'触发频率超限…'}`；delivery payloadJson 存序列化 payload（与其他 delivery 同语义）。
- `.scratch/*/owner-e2e-*` 运行目录不 stage。

## 下一刀建议

- 候选 A（G3）：泳道跨道拖拽改派（第七刀 Out 项；复用看板既有 dnd + 批量改派 preflight 路径）。
- 候选 B（G4）：Memory/Wiki 与 Issue 知识反链。
- 候选 C（G3）：Issue 卡片 inline due 编辑（due date 刀的快捷补全，卡片上直接改日期免开详情）。
