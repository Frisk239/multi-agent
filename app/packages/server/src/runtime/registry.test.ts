import { describe, it, expect } from 'vitest';
import { getBackend, allBackends } from './registry';
import type { RuntimeId } from '@ma/shared';

describe('runtime registry', () => {
  it('returns all five supported backends via allBackends()', () => {
    const backends = allBackends();
    expect(backends.length).toBe(5);
    const ids = backends.map((b) => b.id);
    expect(ids).toContain('claude-code');
    expect(ids).toContain('opencode');
    expect(ids).toContain('cursor');
    expect(ids).toContain('grok');
    expect(ids).toContain('pi');
  });

  it('gets correct backend instance by RuntimeId', () => {
    expect(getBackend('claude-code').id).toBe('claude-code');
    expect(getBackend('opencode').id).toBe('opencode');
    expect(getBackend('cursor').id).toBe('cursor');
    expect(getBackend('grok').id).toBe('grok');
    expect(getBackend('pi').id).toBe('pi');
  });

  it('all backends declare real execution (pi is now a real backend)', () => {
    for (const b of allBackends()) {
      expect(b.executionImplemented).not.toBe(false);
    }
  });

  // A9（2026-07-30）：grok 转 supportsSessionResume=true；pi 也已转真 backend（--session-id 注入）。
  it('all five runtimes support session resume', () => {
    for (const id of ['claude-code', 'opencode', 'cursor', 'grok', 'pi'] as RuntimeId[]) {
      expect(getBackend(id).supportsSessionResume).toBe(true);
    }
  });

  it('throws error for unregistered runtime ID', () => {
    expect(() => getBackend('unknown' as RuntimeId)).toThrow('unknown runtime');
  });
});
