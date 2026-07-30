import { describe, expect, it } from 'vitest';
import {
  isRuntimeAssignableForDispatch,
  runtimeUnassignableReason,
} from './runtime-assignable';

describe('isRuntimeAssignableForDispatch', () => {
  it('blocks explicit executionImplemented=false (Pi)', () => {
    expect(
      isRuntimeAssignableForDispatch({ runtime: 'pi', executionImplemented: false }),
    ).toBe(false);
    expect(
      runtimeUnassignableReason({ runtime: 'pi', executionImplemented: false }),
    ).toMatch(/未实现|禁止指派/);
  });

  it('allows missing/true executionImplemented', () => {
    expect(isRuntimeAssignableForDispatch({ runtime: 'claude-code' })).toBe(true);
    expect(
      isRuntimeAssignableForDispatch({
        runtime: 'opencode',
        executionImplemented: true,
      }),
    ).toBe(true);
  });
});
