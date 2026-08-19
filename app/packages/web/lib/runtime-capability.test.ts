import { describe, expect, it } from 'vitest';
import { runtimeCapabilityState } from './runtime-capability';

const catalog = {
  runtimes: [
    { id: 'pi', supportsThinkingLevel: false },
    { id: 'claude-code', supportsThinkingLevel: true },
  ],
};

describe('runtimeCapabilityState', () => {
  it('fail-closed when catalog or row missing', () => {
    expect(runtimeCapabilityState(undefined, 'pi', 'supportsThinkingLevel')).toBe(
      'unknown',
    );
    expect(runtimeCapabilityState({ runtimes: [] }, 'pi', 'supportsThinkingLevel')).toBe(
      'unknown',
    );
  });

  it('maps explicit true/false', () => {
    expect(runtimeCapabilityState(catalog, 'pi', 'supportsThinkingLevel')).toBe(
      'unsupported',
    );
    expect(
      runtimeCapabilityState(catalog, 'claude-code', 'supportsThinkingLevel'),
    ).toBe('supported');
  });
});
