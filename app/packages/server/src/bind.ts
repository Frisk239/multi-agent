/** Slice 38：listen host 解析（纯函数，默认可安全） */

export const DEFAULT_LISTEN_HOST = '127.0.0.1';

/**
 * 默认只绑回环。放开局域网：`MA_BIND=0.0.0.0` 或 `HOST=0.0.0.0`。
 * 优先级：MA_BIND > HOST > 默认 127.0.0.1
 */
export function resolveListenHost(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): string {
  const fromBind = (env.MA_BIND ?? '').trim();
  if (fromBind) return fromBind;
  const fromHost = (env.HOST ?? '').trim();
  if (fromHost) return fromHost;
  return DEFAULT_LISTEN_HOST;
}
