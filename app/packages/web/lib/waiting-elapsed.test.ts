import { describe, expect, it } from 'vitest';
import {
  formatWaitingElapsed,
  waitingElapsedLabel,
  waitingElapsedMs,
} from './waiting-elapsed';

describe('waiting-elapsed (Slice 66)', () => {
  const now = 1_000_000;

  it('returns null without enteredAt', () => {
    expect(waitingElapsedMs(null, now)).toBeNull();
    expect(formatWaitingElapsed(undefined, now)).toBeNull();
    expect(waitingElapsedLabel(null, now)).toBeNull();
  });

  it('formats seconds / minutes from waitingLocalEnteredAt', () => {
    expect(formatWaitingElapsed(now - 12_000, now)).toBe('12s');
    expect(formatWaitingElapsed(now - 125_000, now)).toBe('2m 5s');
    expect(waitingElapsedLabel(now - 45_000, now)).toBe('已等待 45s');
  });

  it('clamps negative age to 0', () => {
    expect(waitingElapsedMs(now + 5000, now)).toBe(0);
    expect(formatWaitingElapsed(now + 5000, now)).toBe('0ms');
  });
});
