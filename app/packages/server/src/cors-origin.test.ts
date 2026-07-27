import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_CORS_ORIGINS,
  makeCorsOriginChecker,
  resolveCorsOrigins,
} from './cors-origin.js';

describe('resolveCorsOrigins', () => {
  it('defaults to localhost web origins', () => {
    expect(resolveCorsOrigins({})).toEqual([...DEFAULT_CORS_ORIGINS]);
  });

  it('parses comma-separated MA_CORS_ORIGIN', () => {
    expect(
      resolveCorsOrigins({
        MA_CORS_ORIGIN: 'http://192.168.1.10:3000, http://localhost:3000',
      }),
    ).toEqual(['http://192.168.1.10:3000', 'http://localhost:3000']);
  });

  it('treats * as allow-all', () => {
    expect(resolveCorsOrigins({ MA_CORS_ORIGIN: '*' })).toBe(true);
  });
});

describe('makeCorsOriginChecker', () => {
  it('allows listed origins and missing Origin', () => {
    const checker = makeCorsOriginChecker(['http://localhost:3000']);
    expect(typeof checker).toBe('function');
    if (typeof checker !== 'function') return;

    const cb = vi.fn();
    checker('http://localhost:3000', cb);
    expect(cb).toHaveBeenCalledWith(null, true);

    cb.mockClear();
    checker('http://evil.example', cb);
    expect(cb).toHaveBeenCalledWith(null, false);

    cb.mockClear();
    checker(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('returns true for allow-all', () => {
    expect(makeCorsOriginChecker(true)).toBe(true);
  });
});
