/** 与 server automation-dispatch 同语义：模板占位符渲染 */

export type AutomationTemplateContext = {
  plannedAt: number;
  ruleName: string;
};

export function renderAutomationTemplate(
  tpl: string,
  ctx: AutomationTemplateContext,
): string {
  const d = new Date(ctx.plannedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return tpl
    .replaceAll('{{iso_time}}', d.toISOString())
    .replaceAll('{{date}}', date)
    .replaceAll('{{time}}', time)
    .replaceAll('{{rule_name}}', ctx.ruleName);
}
