import type { RuntimePreflightStatus } from '@ma/shared';
import type {
  PreflightFailureReason,
  PreflightResult,
  RuntimeBackend,
} from './types.js';

/** A short bound for a future adapter's independently proven-safe preflight. */
export const RUNTIME_PREFLIGHT_TIMEOUT_MS = 5_000;
const RUNTIME_PREFLIGHT_CACHE_TTL_MS = 60_000;

export type RuntimePreflightOutcome = {
  preflightStatus: RuntimePreflightStatus;
  runtimeVerification: 'unverified' | 'verified';
  /** A fixed product-safe explanation; never provider output or a credential. */
  detail: string | null;
};

type CachedOutcome = {
  outcome: RuntimePreflightOutcome;
  expiresAt: number;
};

type CacheEntry = {
  cached?: CachedOutcome;
  inFlight?: Promise<RuntimePreflightOutcome>;
};

const cache = new WeakMap<RuntimeBackend, CacheEntry>();

function unavailable(): RuntimePreflightOutcome {
  return {
    preflightStatus: 'not_available',
    runtimeVerification: 'unverified',
    detail: null,
  };
}

function failed(reason: PreflightFailureReason): RuntimePreflightOutcome {
  const detail =
    reason === 'auth_required'
      ? '运行时安全预检未通过：请先在本机 CLI 完成登录，然后重试。'
      : reason === 'configuration_invalid'
        ? '运行时安全预检未通过：请检查本机 CLI 的运行时配置后重试。'
        : reason === 'runtime_unavailable'
          ? '运行时安全预检未通过：请确认本机 CLI 可正常启动后重试。'
          : reason === 'service_unavailable'
            ? '运行时安全预检未通过：请检查网络或服务状态后重试。'
            : '运行时安全预检未完成：请检查本机 CLI 登录和配置后重试。';
  return {
    preflightStatus: 'failed',
    runtimeVerification: 'unverified',
    detail,
  };
}

function passed(): RuntimePreflightOutcome {
  return {
    preflightStatus: 'passed',
    runtimeVerification: 'verified',
    detail: null,
  };
}

function cacheEntry(backend: RuntimeBackend): CacheEntry {
  const existing = cache.get(backend);
  if (existing) return existing;
  const entry: CacheEntry = {};
  cache.set(backend, entry);
  return entry;
}

/**
 * Reads a previously computed preflight state only. In particular, Settings'
 * short polling loop must use this helper rather than invoke a new child process.
 */
export function getCachedRuntimePreflightOutcome(
  backend: RuntimeBackend,
  now = Date.now(),
): RuntimePreflightOutcome {
  if (!backend.preflight) return unavailable();
  const entry = cache.get(backend);
  if (!entry?.cached || entry.cached.expiresAt <= now) return unavailable();
  return entry.cached.outcome;
}

async function invokePreflight(
  backend: RuntimeBackend,
  timeoutMs: number,
): Promise<RuntimePreflightOutcome> {
  if (!backend.preflight) return unavailable();

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('runtime preflight timed out'));
    }, timeoutMs);
  });

  try {
    const result: PreflightResult = await Promise.race([
      backend.preflight({ signal: controller.signal, timeoutMs }),
      deadline,
    ]);
    return result.status === 'passed' ? passed() : failed(result.reason);
  } catch {
    // Do not surface caught process/provider errors: they may include sensitive data.
    return failed('unknown');
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Invokes a preflight only for an adapter that explicitly supplies one. Results
 * are short-TTL and one-flight cached per backend; callers still need to handle
 * real execution failures at launch time.
 */
export async function evaluateRuntimePreflight(
  backend: RuntimeBackend,
  options?: { now?: number; timeoutMs?: number },
): Promise<RuntimePreflightOutcome> {
  if (!backend.preflight) return unavailable();

  const now = options?.now ?? Date.now();
  const entry = cacheEntry(backend);
  if (entry.cached && entry.cached.expiresAt > now) return entry.cached.outcome;
  if (entry.inFlight) return entry.inFlight;

  const timeoutMs = options?.timeoutMs ?? RUNTIME_PREFLIGHT_TIMEOUT_MS;
  const task = invokePreflight(backend, timeoutMs).then((outcome) => {
    entry.cached = {
      outcome,
      expiresAt: (options?.now ?? Date.now()) + RUNTIME_PREFLIGHT_CACHE_TTL_MS,
    };
    return outcome;
  });
  entry.inFlight = task;
  try {
    return await task;
  } finally {
    if (entry.inFlight === task) entry.inFlight = undefined;
  }
}
