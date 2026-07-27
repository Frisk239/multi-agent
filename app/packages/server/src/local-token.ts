/** Slice 49：局域网 bind 时的本地 token 门闩（纯函数 + Fastify hook） */

import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resolveListenHost } from './bind.js';

export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

function isTruthyEnv(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toLowerCase();
  return t === '1' || t === 'true' || t === 'yes' || t === 'on';
}

/**
 * loopback listen：127.0.0.1 / ::1 / localhost / 127.x.x.x
 * 0.0.0.0、局域网 IP 等 → 非 loopback
 */
export function isLoopbackHost(host: string): boolean {
  const raw = (host ?? '').trim().toLowerCase();
  if (!raw) return false;
  // IPv6 字面量 [::1] 或带区索引
  let h = raw.startsWith('[') && raw.includes(']') ? raw.slice(1, raw.indexOf(']')) : raw;
  // 去掉可能的 :port（仅 IPv4/host；IPv6 裸写无括号时不拆 port）
  if (h.includes('.') || h === 'localhost') {
    const colon = h.lastIndexOf(':');
    if (colon > 0 && /^\d+$/.test(h.slice(colon + 1))) {
      h = h.slice(0, colon);
    }
  }
  if (h === 'localhost' || h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (h === '127.0.0.1') return true;
  // 127.0.0.0/8
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

/** MA_LOCAL_TOKEN trim 后空 = 未配置 */
export function getLocalToken(env: EnvLike = process.env): string | null {
  const t = (env.MA_LOCAL_TOKEN ?? '').trim();
  return t ? t : null;
}

/**
 * 请求是否强制校验 token：
 * - 已配置 token 且（非 loopback 或 MA_LOCAL_TOKEN_ALWAYS）→ 强制
 * - 未配置 token → 不强制（启动侧另有 warn / REQUIRED 退出）
 */
export function isLocalTokenRequired(env: EnvLike, listenHost: string): boolean {
  const token = getLocalToken(env);
  if (!token) return false;
  const always = isTruthyEnv(env.MA_LOCAL_TOKEN_ALWAYS);
  if (always) return true;
  return !isLoopbackHost(listenHost);
}

/**
 * 启动门闩：非 loopback 且 MA_LOCAL_TOKEN_REQUIRED=1 且无 token → 应拒绝启动
 */
export function mustHaveLocalTokenAtStartup(env: EnvLike, listenHost: string): boolean {
  if (isLoopbackHost(listenHost)) return false;
  if (!isTruthyEnv(env.MA_LOCAL_TOKEN_REQUIRED)) return false;
  return getLocalToken(env) === null;
}

export function localTokenStartupWarnings(env: EnvLike, listenHost: string): string[] {
  const warnings: string[] = [];
  if (!isLoopbackHost(listenHost) && getLocalToken(env) === null) {
    warnings.push(
      `[local-token] 局域网暴露（bind=${listenHost}）且未配置 MA_LOCAL_TOKEN：/api 与 /ws 不强制鉴权，存在裸奔风险。建议设置 MA_LOCAL_TOKEN；强制拒绝启动可设 MA_LOCAL_TOKEN_REQUIRED=1`,
    );
  }
  return warnings;
}

export type LocalTokenStartupResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

/** listen 前评估：REQUIRED 无 token → fail；否则 warnings */
export function evaluateLocalTokenStartup(
  env: EnvLike = process.env,
  listenHost: string,
): LocalTokenStartupResult {
  const warnings = localTokenStartupWarnings(env, listenHost);
  if (mustHaveLocalTokenAtStartup(env, listenHost)) {
    return {
      ok: false,
      error: `[local-token] MA_LOCAL_TOKEN_REQUIRED=1 且 bind=${listenHost} 非 loopback，但未配置 MA_LOCAL_TOKEN；拒绝启动`,
      warnings,
    };
  }
  return { ok: true, warnings };
}

function firstHeader(
  headers: FastifyRequest['headers'] | Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = (headers as Record<string, string | string[] | undefined>)[name];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Authorization: Bearer <token> 或 X-MA-Token；WS 还可 query ?token=
 */
export function extractTokenFromRequest(
  headers: FastifyRequest['headers'] | Record<string, string | string[] | undefined>,
  query?: Record<string, unknown> | string | null,
): string | null {
  const auth = firstHeader(headers, 'authorization');
  if (auth) {
    const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(auth);
    if (m?.[1]) return m[1];
  }
  const x = firstHeader(headers, 'x-ma-token');
  if (x && x.trim()) return x.trim();

  if (query != null) {
    if (typeof query === 'string') {
      // raw querystring "token=abc&..." 或仅值
      try {
        const params = new URLSearchParams(
          query.startsWith('?') ? query.slice(1) : query.includes('=') ? query : `token=${query}`,
        );
        const t = params.get('token');
        if (t && t.trim()) return t.trim();
      } catch {
        /* ignore */
      }
    } else if (typeof query === 'object') {
      const raw = (query as { token?: unknown }).token;
      if (typeof raw === 'string' && raw.trim()) return raw.trim();
      if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) {
        return raw[0].trim();
      }
    }
  }
  return null;
}

/** 常量时间比较（长度不同直接 false） */
export function tokensEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/** 路径是否受 token 保护（/healthz 永不） */
export function isLocalTokenProtectedPath(urlPath: string): boolean {
  const path = (urlPath.split('?')[0] ?? '').trim() || '/';
  if (path === '/healthz') return false;
  if (path === '/ws' || path.startsWith('/ws/')) return true;
  if (path === '/api' || path.startsWith('/api/')) return true;
  return false;
}

export function checkLocalTokenAccess(opts: {
  env?: EnvLike;
  listenHost: string;
  urlPath: string;
  headers: FastifyRequest['headers'] | Record<string, string | string[] | undefined>;
  query?: Record<string, unknown> | string | null;
}): { ok: true } | { ok: false; statusCode: 401; error: string; message: string } {
  const env = opts.env ?? process.env;
  if (!isLocalTokenProtectedPath(opts.urlPath)) return { ok: true };
  if (!isLocalTokenRequired(env, opts.listenHost)) return { ok: true };
  const expected = getLocalToken(env);
  if (!expected) return { ok: true };
  const provided = extractTokenFromRequest(opts.headers, opts.query);
  if (provided && tokensEqual(provided, expected)) return { ok: true };
  return {
    ok: false,
    statusCode: 401,
    error: 'unauthorized',
    message: 'MA_LOCAL_TOKEN required (Authorization: Bearer … or X-MA-Token; WS: ?token=)',
  };
}

export type LocalTokenGuardOptions = {
  env?: EnvLike;
  listenHost?: string;
};

/** 注册 onRequest 门闩（/api/* · /ws；/healthz 放行） */
export function registerLocalTokenGuard(
  app: FastifyInstance,
  opts: LocalTokenGuardOptions = {},
): void {
  const env = opts.env ?? process.env;
  const listenHost = opts.listenHost ?? '';

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const host = listenHost || resolveListenHost(env);
    const urlPath = (req.url ?? '/').split('?')[0] || '/';
    const result = checkLocalTokenAccess({
      env,
      listenHost: host,
      urlPath,
      headers: req.headers,
      query: req.query as Record<string, unknown>,
    });
    if (!result.ok) {
      return reply.code(result.statusCode).send({
        error: result.error,
        message: result.message,
      });
    }
  });
}
