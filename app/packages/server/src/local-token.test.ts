import { describe, it, expect } from 'vitest';
import {
  isLoopbackHost,
  getLocalToken,
  isLocalTokenRequired,
  mustHaveLocalTokenAtStartup,
  localTokenStartupWarnings,
  evaluateLocalTokenStartup,
  extractTokenFromRequest,
  tokensEqual,
  isLocalTokenProtectedPath,
  checkLocalTokenAccess,
} from './local-token.js';

describe('isLoopbackHost', () => {
  it('accepts common loopback hosts', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('LOCALHOST')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
    expect(isLoopbackHost('127.0.0.2')).toBe(true);
    expect(isLoopbackHost(' 127.0.0.1 ')).toBe(true);
  });

  it('rejects non-loopback / wildcard binds', () => {
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('192.168.1.5')).toBe(false);
    expect(isLoopbackHost('10.0.0.1')).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
  });
});

describe('getLocalToken', () => {
  it('returns null when missing or blank', () => {
    expect(getLocalToken({})).toBeNull();
    expect(getLocalToken({ MA_LOCAL_TOKEN: '' })).toBeNull();
    expect(getLocalToken({ MA_LOCAL_TOKEN: '   ' })).toBeNull();
  });

  it('trims configured token', () => {
    expect(getLocalToken({ MA_LOCAL_TOKEN: '  secret  ' })).toBe('secret');
  });
});

describe('isLocalTokenRequired', () => {
  it('is false when token not configured', () => {
    expect(isLocalTokenRequired({}, '0.0.0.0')).toBe(false);
    expect(isLocalTokenRequired({}, '127.0.0.1')).toBe(false);
  });

  it('requires on non-loopback when token configured', () => {
    const env = { MA_LOCAL_TOKEN: 'sec' };
    expect(isLocalTokenRequired(env, '0.0.0.0')).toBe(true);
    expect(isLocalTokenRequired(env, '192.168.1.10')).toBe(true);
  });

  it('does not require on loopback when token configured (daily use)', () => {
    const env = { MA_LOCAL_TOKEN: 'sec' };
    expect(isLocalTokenRequired(env, '127.0.0.1')).toBe(false);
    expect(isLocalTokenRequired(env, 'localhost')).toBe(false);
  });

  it('MA_LOCAL_TOKEN_ALWAYS forces loopback too', () => {
    const env = { MA_LOCAL_TOKEN: 'sec', MA_LOCAL_TOKEN_ALWAYS: '1' };
    expect(isLocalTokenRequired(env, '127.0.0.1')).toBe(true);
    expect(isLocalTokenRequired(env, '0.0.0.0')).toBe(true);
  });
});

describe('startup gates', () => {
  it('mustHaveLocalTokenAtStartup only when REQUIRED + non-loop + no token', () => {
    expect(mustHaveLocalTokenAtStartup({ MA_LOCAL_TOKEN_REQUIRED: '1' }, '0.0.0.0')).toBe(true);
    expect(
      mustHaveLocalTokenAtStartup(
        { MA_LOCAL_TOKEN_REQUIRED: '1', MA_LOCAL_TOKEN: 'x' },
        '0.0.0.0',
      ),
    ).toBe(false);
    expect(mustHaveLocalTokenAtStartup({ MA_LOCAL_TOKEN_REQUIRED: '1' }, '127.0.0.1')).toBe(
      false,
    );
    expect(mustHaveLocalTokenAtStartup({}, '0.0.0.0')).toBe(false);
  });

  it('warns when non-loopback without token', () => {
    const w = localTokenStartupWarnings({}, '0.0.0.0');
    expect(w.length).toBe(1);
    expect(w[0]).toMatch(/MA_LOCAL_TOKEN/);
    expect(localTokenStartupWarnings({}, '127.0.0.1')).toEqual([]);
    expect(localTokenStartupWarnings({ MA_LOCAL_TOKEN: 'x' }, '0.0.0.0')).toEqual([]);
  });

  it('evaluateLocalTokenStartup fails hard when REQUIRED', () => {
    const fail = evaluateLocalTokenStartup({ MA_LOCAL_TOKEN_REQUIRED: '1' }, '0.0.0.0');
    expect(fail.ok).toBe(false);
    if (!fail.ok) expect(fail.error).toMatch(/MA_LOCAL_TOKEN_REQUIRED/);

    const okWarn = evaluateLocalTokenStartup({}, '0.0.0.0');
    expect(okWarn.ok).toBe(true);
    if (okWarn.ok) expect(okWarn.warnings.length).toBe(1);

    const okLoop = evaluateLocalTokenStartup({}, '127.0.0.1');
    expect(okLoop.ok).toBe(true);
    if (okLoop.ok) expect(okLoop.warnings).toEqual([]);
  });
});

describe('extractTokenFromRequest', () => {
  it('reads Bearer authorization', () => {
    expect(
      extractTokenFromRequest({ authorization: 'Bearer abc123' }),
    ).toBe('abc123');
    expect(
      extractTokenFromRequest({ authorization: 'bearer  xyz  ' }),
    ).toBe('xyz');
  });

  it('reads X-MA-Token header', () => {
    expect(extractTokenFromRequest({ 'x-ma-token': 'from-header' })).toBe('from-header');
  });

  it('prefers Authorization over X-MA-Token', () => {
    expect(
      extractTokenFromRequest({
        authorization: 'Bearer first',
        'x-ma-token': 'second',
      }),
    ).toBe('first');
  });

  it('reads query token (object or string)', () => {
    expect(extractTokenFromRequest({}, { token: 'q1' })).toBe('q1');
    expect(extractTokenFromRequest({}, 'token=q2&x=1')).toBe('q2');
    expect(extractTokenFromRequest({}, '?token=q3')).toBe('q3');
  });

  it('returns null when absent', () => {
    expect(extractTokenFromRequest({})).toBeNull();
    expect(extractTokenFromRequest({ authorization: 'Basic x' })).toBeNull();
  });
});

describe('tokensEqual', () => {
  it('matches equal strings', () => {
    expect(tokensEqual('a', 'a')).toBe(true);
    expect(tokensEqual('secret', 'secret')).toBe(true);
  });

  it('rejects mismatch / empty / different length', () => {
    expect(tokensEqual('a', 'b')).toBe(false);
    expect(tokensEqual('ab', 'a')).toBe(false);
    expect(tokensEqual('', '')).toBe(false);
  });
});

describe('isLocalTokenProtectedPath', () => {
  it('protects /api and /ws; always skips /healthz', () => {
    expect(isLocalTokenProtectedPath('/healthz')).toBe(false);
    expect(isLocalTokenProtectedPath('/healthz?x=1')).toBe(false);
    expect(isLocalTokenProtectedPath('/api/issues')).toBe(true);
    expect(isLocalTokenProtectedPath('/api')).toBe(true);
    expect(isLocalTokenProtectedPath('/ws')).toBe(true);
    expect(isLocalTokenProtectedPath('/ws?token=x')).toBe(true);
    expect(isLocalTokenProtectedPath('/')).toBe(false);
  });

  it('skips /api/webhooks/* (webhook token in URL is the credential)', () => {
    expect(isLocalTokenProtectedPath('/api/webhooks/abc123')).toBe(false);
    expect(isLocalTokenProtectedPath('/api/webhooks/abc123?x=1')).toBe(false);
    expect(isLocalTokenProtectedPath('/api/webhooks')).toBe(false);
    // 仅该前缀放行；其它 /api 仍受保护
    expect(isLocalTokenProtectedPath('/api/webhooks-other')).toBe(true);
    expect(isLocalTokenProtectedPath('/api/automation/rules')).toBe(true);
  });
});

describe('checkLocalTokenAccess', () => {
  const secret = 's3cret';
  const envNonLoop = { MA_LOCAL_TOKEN: secret };

  it('allows healthz always', () => {
    const r = checkLocalTokenAccess({
      env: envNonLoop,
      listenHost: '0.0.0.0',
      urlPath: '/healthz',
      headers: {},
    });
    expect(r.ok).toBe(true);
  });

  it('allows api without token on loopback even if token configured', () => {
    const r = checkLocalTokenAccess({
      env: envNonLoop,
      listenHost: '127.0.0.1',
      urlPath: '/api/settings/status',
      headers: {},
    });
    expect(r.ok).toBe(true);
  });

  it('rejects api without token on non-loopback when configured', () => {
    const r = checkLocalTokenAccess({
      env: envNonLoop,
      listenHost: '0.0.0.0',
      urlPath: '/api/settings/status',
      headers: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.statusCode).toBe(401);
  });

  it('accepts Bearer / X-MA-Token / query on non-loopback', () => {
    expect(
      checkLocalTokenAccess({
        env: envNonLoop,
        listenHost: '0.0.0.0',
        urlPath: '/api/x',
        headers: { authorization: `Bearer ${secret}` },
      }).ok,
    ).toBe(true);
    expect(
      checkLocalTokenAccess({
        env: envNonLoop,
        listenHost: '0.0.0.0',
        urlPath: '/api/x',
        headers: { 'x-ma-token': secret },
      }).ok,
    ).toBe(true);
    expect(
      checkLocalTokenAccess({
        env: envNonLoop,
        listenHost: '0.0.0.0',
        urlPath: '/ws',
        headers: {},
        query: { token: secret },
      }).ok,
    ).toBe(true);
  });

  it('rejects wrong token', () => {
    const r = checkLocalTokenAccess({
      env: envNonLoop,
      listenHost: '0.0.0.0',
      urlPath: '/api/x',
      headers: { authorization: 'Bearer wrong' },
    });
    expect(r.ok).toBe(false);
  });

  it('allows /api/webhooks/* without X-MA-Token (token in URL is the credential)', () => {
    const r = checkLocalTokenAccess({
      env: envNonLoop,
      listenHost: '0.0.0.0',
      urlPath: '/api/webhooks/48-hex-token',
      headers: {},
    });
    expect(r.ok).toBe(true);
  });

  it('does not force when token unset (compat)', () => {
    const r = checkLocalTokenAccess({
      env: {},
      listenHost: '0.0.0.0',
      urlPath: '/api/x',
      headers: {},
    });
    expect(r.ok).toBe(true);
  });
});
