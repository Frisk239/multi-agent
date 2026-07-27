import { describe, it, expect } from 'vitest';
import {
  distanceFromBottom,
  isNearBottom,
  NEAR_BOTTOM_PX,
  shouldAutoStick,
} from './chat-scroll';

describe('chat-scroll', () => {
  it('distanceFromBottom is scrollHeight - scrollTop - clientHeight', () => {
    expect(
      distanceFromBottom({ scrollTop: 100, scrollHeight: 500, clientHeight: 200 }),
    ).toBe(200);
  });

  it('isNearBottom within default threshold', () => {
    expect(
      isNearBottom({ scrollTop: 400, scrollHeight: 500, clientHeight: 100 }),
    ).toBe(true);
    expect(
      isNearBottom({
        scrollTop: 200,
        scrollHeight: 500,
        clientHeight: 100,
      }),
    ).toBe(false);
  });

  it('shouldAutoStick only when stick and near bottom', () => {
    expect(shouldAutoStick(true, true)).toBe(true);
    expect(shouldAutoStick(true, false)).toBe(false);
    expect(shouldAutoStick(false, true)).toBe(false);
  });

  it('exports NEAR_BOTTOM_PX', () => {
    expect(NEAR_BOTTOM_PX).toBe(100);
  });
});
