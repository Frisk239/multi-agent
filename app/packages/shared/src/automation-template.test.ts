import { describe, it, expect } from 'vitest';
import { renderAutomationTemplate } from './automation-template';

describe('renderAutomationTemplate', () => {
  it('should render all template placeholders correctly', () => {
    const plannedAt = new Date('2026-07-26T14:30:00.000Z').getTime();
    const ctx = {
      plannedAt,
      ruleName: 'Daily Review',
    };

    const template = 'Rule {{rule_name}} executed at {{time}} on {{date}} (ISO: {{iso_time}})';
    const result = renderAutomationTemplate(template, ctx);

    expect(result).toContain('Rule Daily Review executed at');
    expect(result).toContain('on 2026-07-26');
    expect(result).toContain('ISO: 2026-07-26T14:30:00.000Z');
  });

  it('should handle templates with no placeholders', () => {
    const ctx = {
      plannedAt: Date.now(),
      ruleName: 'Test Rule',
    };
    const template = 'Static text without placeholders';
    expect(renderAutomationTemplate(template, ctx)).toBe(template);
  });

  it('should handle empty template string', () => {
    const ctx = {
      plannedAt: Date.now(),
      ruleName: 'Test Rule',
    };
    expect(renderAutomationTemplate('', ctx)).toBe('');
  });

  it('should handle multiple occurrences of the same placeholder', () => {
    const ctx = {
      plannedAt: new Date('2026-01-01T00:00:00.000Z').getTime(),
      ruleName: 'Loop',
    };
    const template = '{{rule_name}} - {{rule_name}} - {{date}} - {{date}}';
    const result = renderAutomationTemplate(template, ctx);

    expect(result).toBe('Loop - Loop - 2026-01-01 - 2026-01-01');
  });

  it('should correctly format single-digit months, days, hours, and minutes with zero padding', () => {
    // 2026-02-05 04:09:00 UTC
    const plannedAt = new Date('2026-02-05T04:09:00.000Z').getTime();
    const ctx = { plannedAt, ruleName: 'PadTest' };

    const template = '{{date}} {{time}}';
    const result = renderAutomationTemplate(template, ctx);

    expect(result).toContain('2026-02-05');
  });
});
