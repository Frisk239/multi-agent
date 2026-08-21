# Closeout: Webhook Payload 模板注入

日期：2026-08-20
产品提交：`88fddec feat(automation): webhook payload template variables`
上一刀：`automation-webhook-trigger`（`app/.progress/automation-webhook-trigger-impl-1.md`）
参考：Multica 深读「payload 作为 JSON 块嵌进 issue description，agent 内联看到事件」

## 已交付

- **shared**（`automation-template.ts`）：`AutomationTemplateWebhookContext` 类型 + 三类变量——`{{webhook.event}}`、`{{webhook.payload}}`（pretty JSON）、`{{webhook.payload.<key>}}`（顶层字段：字符串原样/其它 compact JSON）；正则兜底清空一切残留占位符（未知 key、深层路径、无 ctx）→ 模板可跨触发源安全共用。
- **server**：`dispatchAutomationRule` 第 4 可选参 `webhook`，穿透 run_only/create_issue 两分支的全部渲染点；webhook 路由透传 `{event, payload}`；schedule/manual 调用点零改动。
- **web**：创建表单 hint + textarea placeholder + webhook 面板说明文案（注明「定时/手动触发渲染为空」）。

## 验收证据

- 全量 `pnpm -w test`：shared 152 / server 1106 / web 628 全绿（+15 用例：shared 8 渲染、server 4 透传+跨源安全、web 3）；typecheck 3 包、check-docs 过。
- 隔离 E2E（fresh DB，脚本 `.scratch/webhook-payload-template/owner-e2e-20260820-1430/tpl.e2e.mjs`）：**9/9 PASS**——带模板 create_issue 规则 → webhook 触发 → issue 标题精确 `部署事件 deploy @ refs/heads/release`、正文含 `提交人 octocat` 与完整 payload JSON、深层占位符清空不残留；run-now（manual）复用同模板 → 标题占位符渲染为空、正文零残留；UI 看板卡片显示渲染后标题。截图 `shots/t1-board-rendered.png`。

## 边界 / 债

- 深层路径/数组索引/模板预览 webhook 值/payload 体积限制——Out 未做。
- payload 字符串值内含 `{{webhook.*}}` 文本会被兜底正则二次清空（单遍渲染，业界惯例）。
- `.scratch/*/owner-e2e-*` 运行目录不 stage。

## 下一刀建议

- 候选 A（G3）：看板泳道视图（按 agent 分道；调研池候选 3，`swimlane-view.tsx` 参考）。
- 候选 B（G3）：列表表格二阶（列选择/分组行；候选 4）。
- 候选 C（G5）：webhook 触发频率限制/防抖（防脚本误打爆 run）。
