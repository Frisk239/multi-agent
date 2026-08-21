/** 与 server automation-dispatch 同语义：模板占位符渲染 */

/** webhook 触发时注入模板的事件上下文（学 multica：payload 作为 JSON 块内联） */
export type AutomationTemplateWebhookContext = {
  event: string;
  payload: unknown;
};

export type AutomationTemplateContext = {
  plannedAt: number;
  ruleName: string;
  webhook?: AutomationTemplateWebhookContext;
};

/** 兜底：剩余任意 webhook 占位符（无 ctx / 未知 key / 深层路径）统一清空 */
const WEBHOOK_PLACEHOLDER_RE = /\{\{webhook\.[^}]*\}\}/g;

/** payload 顶层字段：字符串原样，其它 JSON.stringify；不存在/非对象 → 空串（Out：不做深层路径） */
function renderWebhookPayloadKey(payload: unknown, key: string): string {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return '';
  const record = payload as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, key)) return '';
  const value = record[key];
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

export function renderAutomationTemplate(
  tpl: string,
  ctx: AutomationTemplateContext,
): string {
  const d = new Date(ctx.plannedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let out = tpl
    .replaceAll('{{iso_time}}', d.toISOString())
    .replaceAll('{{date}}', date)
    .replaceAll('{{time}}', time)
    .replaceAll('{{rule_name}}', ctx.ruleName);

  const { webhook } = ctx;
  if (webhook) {
    out = out.replaceAll('{{webhook.event}}', webhook.event);
    try {
      out = out.replaceAll(
        '{{webhook.payload}}',
        JSON.stringify(webhook.payload, null, 2) ?? '',
      );
    } catch {
      out = out.replaceAll('{{webhook.payload}}', '');
    }
    if (
      webhook.payload !== null &&
      typeof webhook.payload === 'object' &&
      !Array.isArray(webhook.payload)
    ) {
      for (const key of Object.keys(webhook.payload)) {
        out = out.replaceAll(
          `{{webhook.payload.${key}}}`,
          renderWebhookPayloadKey(webhook.payload, key),
        );
      }
    }
  }

  // schedule/manual 共用同一模板：无 webhook 时所有 {{webhook.*}}（含任意 key/深层形态）安全清空
  return out.replace(WEBHOOK_PLACEHOLDER_RE, '');
}
