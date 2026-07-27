import { describe, it, expect } from 'vitest';
import {
  AGENT_TEMPLATES,
  getAgentTemplate,
  agentTemplateToCreateInput,
} from './agent-templates';
import { RuntimeId } from './schema';

describe('AGENT_TEMPLATES', () => {
  it('has at least 8 local templates', () => {
    expect(Array.isArray(AGENT_TEMPLATES)).toBe(true);
    expect(AGENT_TEMPLATES.length).toBeGreaterThanOrEqual(8);
  });

  it('has unique ids', () => {
    const ids = AGENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fills required gallery fields and valid runtime', () => {
    for (const t of AGENT_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(t.summary).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.instructions.length).toBeGreaterThan(20);
      expect(RuntimeId.safeParse(t.runtime).success).toBe(true);
      expect(t.concurrency).toBeGreaterThanOrEqual(1);
      expect(t.concurrency).toBeLessThanOrEqual(8);
    }
  });

  it('contains no secret-like fields on template objects', () => {
    for (const t of AGENT_TEMPLATES) {
      const keys = Object.keys(t);
      for (const k of keys) {
        expect(k.toLowerCase()).not.toMatch(/secret|password|api[_-]?key|token|credential/);
      }
      const blob = JSON.stringify(t).toLowerCase();
      expect(blob).not.toMatch(/sk-[a-z0-9]{10,}/);
      expect(blob).not.toMatch(/api[_-]?key\s*[:=]/);
    }
  });

  it('getAgentTemplate resolves known id', () => {
    expect(getAgentTemplate('fullstack')?.title).toBeTruthy();
    expect(getAgentTemplate('missing')).toBeUndefined();
  });

  it('agentTemplateToCreateInput maps defaults and overrides', () => {
    const tpl = getAgentTemplate('docs')!;
    const base = agentTemplateToCreateInput(tpl);
    expect(base.name).toBe(tpl.name);
    expect(base.runtime).toBe(tpl.runtime);
    expect(base.instructions).toBe(tpl.instructions);

    const over = agentTemplateToCreateInput(tpl, { name: '自定义文档', concurrency: 3 });
    expect(over.name).toBe('自定义文档');
    expect(over.concurrency).toBe(3);
    expect(over.category).toBe(tpl.category);
  });

  it('includes expected high-frequency roles', () => {
    const ids = AGENT_TEMPLATES.map((t) => t.id);
    expect(ids).toContain('fullstack');
    expect(ids).toContain('reviewer');
    expect(ids).toContain('docs');
    expect(ids).toContain('bug_triage');
  });
});
