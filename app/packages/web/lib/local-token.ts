/**
 * Slice 59：Web 侧局域网 token（仅 env，不落库 / 无 UI 表单）
 *
 * 来源：`NEXT_PUBLIC_MA_LOCAL_TOKEN`（Next 打包进浏览器的 public env）
 * - 与 server `MA_LOCAL_TOKEN` 对齐；loopback 日用可不设
 * - HTTP：`X-MA-Token`（也可 Authorization: Bearer，本客户端统一 X-MA-Token）
 * - WS：`?token=`（浏览器 WebSocket 无法自定义 header）
 */

export type EnvLike = Record<string, string | undefined>;

/** 读 public token；trim 后空 = 未配置 */
export function getPublicLocalToken(
  env: EnvLike = typeof process !== 'undefined' ? (process.env as EnvLike) : {},
): string | null {
  const t = (env.NEXT_PUBLIC_MA_LOCAL_TOKEN ?? '').trim();
  return t ? t : null;
}

export function isPublicLocalTokenConfigured(
  env: EnvLike = typeof process !== 'undefined' ? (process.env as EnvLike) : {},
): boolean {
  return getPublicLocalToken(env) !== null;
}

/**
 * 合并 headers：有 public token 且调用方未自带 Authorization / X-MA-Token 时注入。
 * 不覆盖调用方已设的鉴权头。
 */
export function withLocalTokenHeaders(
  initHeaders?: HeadersInit,
  env: EnvLike = typeof process !== 'undefined' ? (process.env as EnvLike) : {},
): Headers {
  const headers = new Headers(initHeaders ?? undefined);
  const token = getPublicLocalToken(env);
  if (!token) return headers;
  if (headers.has('Authorization') || headers.has('X-MA-Token')) return headers;
  headers.set('X-MA-Token', token);
  return headers;
}

/**
 * 给 WS URL 追加 `token` query（若已配置且 URL 尚无 token 参数）。
 * 保留原有 query / hash。
 */
export function withLocalTokenWsUrl(
  url: string,
  env: EnvLike = typeof process !== 'undefined' ? (process.env as EnvLike) : {},
): string {
  const token = getPublicLocalToken(env);
  if (!token) return url;
  try {
    // 浏览器 / Node：绝对 URL
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (u.searchParams.has('token')) return url;
    u.searchParams.set('token', token);
    // 若入参是绝对 ws/http，返回完整；若是相对则尽量还原
    if (/^wss?:\/\//i.test(url) || /^https?:\/\//i.test(url)) {
      return u.toString();
    }
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    // 极简 fallback
    if (/[?&]token=/.test(url)) return url;
    return url.includes('?') ? `${url}&token=${encodeURIComponent(token)}` : `${url}?token=${encodeURIComponent(token)}`;
  }
}

/** Settings 只读文案：前端是否配置了 public token（永不回显密钥） */
export function publicLocalTokenStatusLabel(
  env: EnvLike = typeof process !== 'undefined' ? (process.env as EnvLike) : {},
): string {
  return isPublicLocalTokenConfigured(env)
    ? '前端已配置 NEXT_PUBLIC_MA_LOCAL_TOKEN（请求将自动带 X-MA-Token / WS ?token=）'
    : '前端未配置 NEXT_PUBLIC_MA_LOCAL_TOKEN（loopback 日用可省略；局域网非 loopback 需与 server MA_LOCAL_TOKEN 一致）';
}

/**
 * 从 settings/status 的 server check detail 推断服务端 token 态（只读，不暴露密钥）。
 * 依赖 Slice 49 文案关键字。
 */
export function inferServerLocalTokenFromCheckDetail(
  detail: string | null | undefined,
): {
  configured: boolean | null;
  summary: string;
} {
  const d = detail ?? '';
  if (!d) {
    return { configured: null, summary: '服务端 token 状态未知（无 server 检查详情）' };
  }
  if (d.includes('MA_LOCAL_TOKEN 已配置')) {
    return {
      configured: true,
      summary: '服务端已配置 MA_LOCAL_TOKEN（非 loopback 时 /api·/ws 需 token）',
    };
  }
  if (d.includes('未配置 MA_LOCAL_TOKEN')) {
    return {
      configured: false,
      summary: '服务端未配置 MA_LOCAL_TOKEN（局域网裸奔风险）',
    };
  }
  if (d.includes('仅本机') || d.includes('MA_LOCAL_TOKEN')) {
    return {
      configured: null,
      summary: '服务端为 loopback 日用（可不强制 token）；局域网暴露请设 MA_LOCAL_TOKEN',
    };
  }
  return { configured: null, summary: `服务端：${d}` };
}
