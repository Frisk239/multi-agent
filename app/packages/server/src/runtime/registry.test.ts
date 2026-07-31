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

  it('Pi backend is registered as execution not implemented (Slice 44)', () => {
    const pi = getBackend('pi');
    expect(pi.executionImplemented).toBe(false);
    // other backends default to implemented (undefined or true)
    for (const id of ['claude-code', 'opencode', 'cursor', 'grok'] as RuntimeId[]) {
      const b = getBackend(id);
      expect(b.executionImplemented).not.toBe(false);
    }
  });

  // A9（2026-07-30）：grok 转为 supportsSessionResume=true + --resume 注入。
  // 唯一不支持的是 pi（执行本身未实现）。
  it('claude-code, opencode, cursor, grok support session resume; pi does not', () => {
    for (const id of ['claude-code', 'opencode', 'cursor', 'grok'] as RuntimeId[]) {
      expect(getBackend(id).supportsSessionResume).toBe(true);
    }
    expect(getBackend('pi').supportsSessionResume).toBe(false);
  });

  it('throws error for unregistered runtime ID', () => {
    expect(() => getBackend('unknown' as RuntimeId)).toThrow('unknown runtime');
  });
});
