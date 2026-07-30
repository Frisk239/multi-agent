import { describe, expect, it } from 'vitest';
import { pickTopBannerId } from './banner-queue';

describe('pickTopBannerId', () => {
  it('returns null when none active', () => {
    expect(
      pickTopBannerId([
        { id: 'ws', severity: 'critical', active: false },
        { id: 'env', severity: 'high', active: false },
      ]),
    ).toBeNull();
  });

  it('prefers critical over high/medium/low', () => {
    expect(
      pickTopBannerId([
        { id: 'env', severity: 'high', active: true },
        { id: 'ws', severity: 'critical', active: true },
        { id: 'onboarding', severity: 'low', active: true },
      ]),
    ).toBe('ws');
  });

  it('prefers high when critical inactive', () => {
    expect(
      pickTopBannerId([
        { id: 'onboarding', severity: 'low', active: true },
        { id: 'env', severity: 'high', active: true },
      ]),
    ).toBe('env');
  });

  it('returns at most one id', () => {
    const id = pickTopBannerId([
      { id: 'a', severity: 'medium', active: true },
      { id: 'b', severity: 'medium', active: true },
    ]);
    expect(id === 'a' || id === 'b').toBe(true);
  });
});
