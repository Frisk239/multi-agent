/** Slice 38：CORS 允许源解析（纯函数） */

export const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const;

/**
 * 默认收紧到本机 web。逗号分隔扩展：`MA_CORS_ORIGIN=http://192.168.1.10:3000`
 * 空字符串 / 未设 → 默认；`*` 表示反射任意 origin（不推荐，仅显式放开）。
 */
export function resolveCorsOrigins(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string[] | true {
  const raw = (env.MA_CORS_ORIGIN ?? '').trim();
  if (!raw) return [...DEFAULT_CORS_ORIGINS];
  if (raw === '*') return true;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : [...DEFAULT_CORS_ORIGINS];
}

/** @fastify/cors origin 回调：列表内放行；true 时反射任意 */
export function makeCorsOriginChecker(
  allowed: string[] | true,
): boolean | string[] | ((origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => void) {
  if (allowed === true) return true;
  const set = new Set(allowed);
  return (origin, cb) => {
    // 同源 / 非浏览器 / curl 无 Origin 头
    if (!origin) {
      cb(null, true);
      return;
    }
    cb(null, set.has(origin));
  };
}
