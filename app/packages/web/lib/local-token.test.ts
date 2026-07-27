import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPublicLocalToken,
  isPublicLocalTokenConfigured,
  withLocalTokenHeaders,
  withLocalTokenWsUrl,
  publicLocalTokenStatusLabel,
  inferServerLocalTokenFromCheckDetail,
} from './local-token';

describe('getPublicLocalToken / isPublicLocalTokenConfigured', () => {
  it('returns null when missing or blank', () => {
    expect(getPublicLocalToken({})).toBeNull();
    expect(getPublicLocalToken({ NEXT_PUBLIC_MA_LOCAL_TOKEN: '' })).toBeNull();
    expect(getPublicLocalToken({ NEXT_PUBLIC_MA_LOCAL_TOKEN: '   ' })).toBeNull();
    expect(isPublicLocalTokenConfigured({})).toBe(false);
  });

  it('trims configured token', () => {
    expect(getPublicLocalToken({ NEXT_PUBLIC_MA_LOCAL_TOKEN: '  secret  ' })).toBe('secret');
    expect(isPublicLocalTokenConfigured({ NEXT_PUBLIC_MA_LOCAL_TOKEN: 'x' })).toBe(true);
  });
});

describe('withLocalTokenHeaders', () => {
  it('injects X-MA-Token when configured', () => {
    const h = withLocalTokenHeaders({ 'Content-Type': 'application/json' }, {
      NEXT_PUBLIC_MA_LOCAL_TOKEN: 'tok-1',
    });
    expect(h.get('Content-Type')).toBe('application/json');
    expect(h.get('X-MA-Token')).toBe('tok-1');
  });

  it('does nothing when token unset', () => {
    const h = withLocalTokenHeaders({ Accept: 'application/json' }, {});
    expect(h.get('X-MA-Token')).toBeNull();
    expect(h.get('Accept')).toBe('application/json');
  });

  it('does not override existing Authorization or X-MA-Token', () => {
    const withAuth = withLocalTokenHeaders(
      { Authorization: 'Bearer keep' },
      { NEXT_PUBLIC_MA_LOCAL_TOKEN: 'tok' },
    );
    expect(withAuth.get('Authorization')).toBe('Bearer keep');
    expect(withAuth.get('X-MA-Token')).toBeNull();

    const withX = withLocalTokenHeaders(
      { 'X-MA-Token': 'caller' },
      { NEXT_PUBLIC_MA_LOCAL_TOKEN: 'tok' },
    );
    expect(withX.get('X-MA-Token')).toBe('caller');
  });

  it('accepts Headers / array init shapes', () => {
    const fromHeaders = withLocalTokenHeaders(new Headers({ a: '1' }), {
      NEXT_PUBLIC_MA_LOCAL_TOKEN: 't',
    });
    expect(fromHeaders.get('a')).toBe('1');
    expect(fromHeaders.get('X-MA-Token')).toBe('t');

    const fromArr = withLocalTokenHeaders([['b', '2']], {
      NEXT_PUBLIC_MA_LOCAL_TOKEN: 't',
    });
    expect(fromArr.get('b')).toBe('2');
    expect(fromArr.get('X-MA-Token')).toBe('t');
  });
});

describe('withLocalTokenWsUrl', () => {
  it('appends token query when configured', () => {
    const url = withLocalTokenWsUrl('ws://localhost:3001/ws', {
      NEXT_PUBLIC_MA_LOCAL_TOKEN: 's3cret',
    });
    expect(url).toContain('token=s3cret');
    expect(url.startsWith('ws://localhost:3001/ws')).toBe(true);
  });

  it('leaves url when token unset', () => {
    expect(withLocalTokenWsUrl('ws://localhost:3001/ws', {})).toBe('ws://localhost:3001/ws');
  });

  it('does not duplicate existing token param', () => {
    const url = withLocalTokenWsUrl('ws://localhost:3001/ws?token=already', {
      NEXT_PUBLIC_MA_LOCAL_TOKEN: 'new',
    });
    expect(url).toBe('ws://localhost:3001/ws?token=already');
  });
});

describe('status labels', () => {
  it('publicLocalTokenStatusLabel never echoes secret', () => {
    const configured = publicLocalTokenStatusLabel({
      NEXT_PUBLIC_MA_LOCAL_TOKEN: 'super-secret-value',
    });
    expect(configured).toMatch(/已配置/);
    expect(configured).not.toContain('super-secret-value');

    const unset = publicLocalTokenStatusLabel({});
    expect(unset).toMatch(/未配置/);
  });

  it('inferServerLocalTokenFromCheckDetail parses slice49 copy', () => {
    expect(
      inferServerLocalTokenFromCheckDetail(
        '监听 0.0.0.0:3001 · bind=0.0.0.0 · MA_LOCAL_TOKEN 已配置（/api·/ws 需 Bearer 或 X-MA-Token）',
      ).configured,
    ).toBe(true);
    expect(
      inferServerLocalTokenFromCheckDetail(
        '监听 0.0.0.0:3001 · bind=0.0.0.0 · 未配置 MA_LOCAL_TOKEN（局域网裸奔风险）',
      ).configured,
    ).toBe(false);
    expect(
      inferServerLocalTokenFromCheckDetail(
        '监听 127.0.0.1:3001 · 仅本机；局域网暴露：MA_BIND=0.0.0.0（并设 MA_CORS_ORIGIN；请设 MA_LOCAL_TOKEN）',
      ).configured,
    ).toBeNull();
  });
});

describe('apiFetch header injection (mock env + fetch)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('apiFetch-like merge injects X-MA-Token', async () => {
    const calls: { url: string; headers: Headers }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        calls.push({
          url: String(input),
          headers,
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    // 与 api.ts 中 apiFetch 同构
    async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
      return fetch(input, {
        ...init,
        headers: withLocalTokenHeaders(init?.headers, {
          NEXT_PUBLIC_MA_LOCAL_TOKEN: 'mock-token',
        }),
      });
    }

    await apiFetch('http://localhost:3001/api/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get('Content-Type')).toBe('application/json');
    expect(calls[0].headers.get('X-MA-Token')).toBe('mock-token');
  });
});
