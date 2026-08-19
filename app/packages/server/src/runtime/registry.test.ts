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

  // G1-2 收官（2026-08-03）：grok 已实现 ACP stdio 客户端（session/load 续跑）→ 全 runtime 真 resume
  it('全 runtime 支持真 resume（grok ACP 已实现，G1-2 收官）', () => {
    for (const id of ['claude-code', 'opencode', 'cursor', 'pi', 'grok'] as RuntimeId[]) {
      expect(getBackend(id).supportsSessionResume).toBe(true);
    }
  });

  it('supportsThinkingLevel 仅 claude/grok/cursor/opencode 显式 true；pi 缺省不支持', () => {
    expect(getBackend('claude-code').supportsThinkingLevel).toBe(true);
    expect(getBackend('grok').supportsThinkingLevel).toBe(true);
    expect(getBackend('cursor').supportsThinkingLevel).toBe(true);
    expect(getBackend('opencode').supportsThinkingLevel).toBe(true);
    expect(getBackend('pi').supportsThinkingLevel).not.toBe(true);
  });

  it('throws error for unregistered runtime ID', () => {
    expect(() => getBackend('unknown' as RuntimeId)).toThrow('unknown runtime');
  });
});
