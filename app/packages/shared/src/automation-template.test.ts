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

describe('renderAutomationTemplate webhook placeholders', () => {
  const plannedAt = new Date('2026-08-21T08:00:00.000Z').getTime();
  const webhook = {
    event: 'push',
    payload: {
      ref: 'refs/heads/main',
      commits: 2,
      author: { name: 'octo' },
    },
  };

  it('renders {{webhook.event}} from the webhook context', () => {
    const result = renderAutomationTemplate('事件 {{webhook.event}}（{{rule_name}}）', {
      plannedAt,
      ruleName: 'Deploy Watch',
      webhook,
    });
    expect(result).toBe('事件 push（Deploy Watch）');
  });

  it('renders {{webhook.payload}} as pretty-printed JSON', () => {
    const result = renderAutomationTemplate('payload:\n{{webhook.payload}}', {
      plannedAt,
      ruleName: 'Deploy Watch',
      webhook,
    });
    expect(result).toContain('"ref": "refs/heads/main"');
    expect(result).toContain('"commits": 2');
    expect(result).toContain('"author": {');
  });

  it('renders string top-level payload fields verbatim via {{webhook.payload.<key>}}', () => {
    const result = renderAutomationTemplate('ref = {{webhook.payload.ref}}', {
      plannedAt,
      ruleName: 'Deploy Watch',
      webhook,
    });
    expect(result).toBe('ref = refs/heads/main');
  });

  it('renders non-string top-level payload fields as compact JSON', () => {
    const result = renderAutomationTemplate(
      'commits={{webhook.payload.commits}} author={{webhook.payload.author}}',
      { plannedAt, ruleName: 'Deploy Watch', webhook },
    );
    expect(result).toBe('commits=2 author={"name":"octo"}');
  });

  it('renders missing keys, non-object payloads and deep paths as empty strings', () => {
    const result = renderAutomationTemplate(
      '[{{webhook.payload.nope}}][{{webhook.payload.a.b}}]',
      { plannedAt, ruleName: 'Deploy Watch', webhook },
    );
    expect(result).toBe('[][]');

    const scalar = renderAutomationTemplate('[{{webhook.payload.ref}}]', {
      plannedAt,
      ruleName: 'Deploy Watch',
      webhook: { event: 'push', payload: 'text' },
    });
    expect(scalar).toBe('[]');
  });

  it('clears all webhook placeholders (incl. deep paths) when ctx has no webhook', () => {
    const result = renderAutomationTemplate(
      '巡检 [{{webhook.event}}][{{webhook.payload}}][{{webhook.payload.ref}}][{{webhook.payload.a.b}}]',
      { plannedAt, ruleName: 'Patrol' },
    );
    expect(result).toBe('巡检 [][][][]');
    expect(result).not.toContain('{{webhook.');
  });

  it('renders full webhook payload as null JSON string when payload is null', () => {
    const result = renderAutomationTemplate('{{webhook.payload}}', {
      plannedAt,
      ruleName: 'Watch',
      webhook: { event: 'push', payload: null },
    });
    expect(result).toBe('null');
  });
});
