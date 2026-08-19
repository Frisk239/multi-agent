/** Slice 38：进程健康面 — worker 上次成功 tick + DB ping + overall */
import { scrubSecrets } from './runtime/secret-scrubber.js';

export type WorkerHealthKey =
  | 'runWorker'
  | 'automationWorker'
  | 'wikiIngestWorker'
  | 'staleRunSweeper';

export type WorkerHealthSnapshot = {
  /** 最近一次成功完成的 worker tick（不是最近一次尝试）。 */
  lastTickAt: number | null;
  ageMs: number | null;
  running: boolean;
  /** 最近成功 tick 以来连续失败的顶层循环次数。 */
  consecutiveFailures: number;
  /** 最近一次顶层 tick 失败的 epoch ms。 */
  lastFailureAt: number | null;
  /** 供 API/UI 使用的脱敏、限长失败摘要；完整错误只进 logger。 */
  lastFailureSummary: string | null;
};

export type ProcessHealthStatus = 'ok' | 'degraded';

export type ProcessHealthResponse = {
  status: ProcessHealthStatus;
  ts: number;
  uptimeMs: number;
  db: { ok: boolean; latencyMs: number | null; error?: string };
  workers: Record<WorkerHealthKey, WorkerHealthSnapshot>;
  /** Slice 75：残留进程树强杀计数（shutdownServer 残留树 kill 后报告） */
  treeKilled?: number;
};

const startedAt = Date.now();

const lastTickAt: Record<WorkerHealthKey, number | null> = {
  runWorker: null,
  automationWorker: null,
  wikiIngestWorker: null,
  staleRunSweeper: null,
};

const running: Record<WorkerHealthKey, boolean> = {
  runWorker: false,
  automationWorker: false,
  wikiIngestWorker: false,
  staleRunSweeper: false,
};

const consecutiveFailures: Record<WorkerHealthKey, number> = {
  runWorker: 0,
  automationWorker: 0,
  wikiIngestWorker: 0,
  staleRunSweeper: 0,
};

const lastFailureAt: Record<WorkerHealthKey, number | null> = {
  runWorker: null,
  automationWorker: null,
  wikiIngestWorker: null,
  staleRunSweeper: null,
};

const lastFailureSummary: Record<WorkerHealthKey, string | null> = {
  runWorker: null,
  automationWorker: null,
  wikiIngestWorker: null,
  staleRunSweeper: null,
};

/** 不把底层 DB/CLI 错误全文放进 API；日志仍保留原始 Error。 */
export const WORKER_FAILURE_SUMMARY_MAX_CHARS = 240;

export function summarizeWorkerFailure(error: unknown): string {
  try {
    const raw =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'worker tick failed';
    const normalized = scrubSecrets(raw).replace(/\s+/g, ' ').trim() || 'worker tick failed';
    return normalized.length > WORKER_FAILURE_SUMMARY_MAX_CHARS
      ? `${normalized.slice(0, WORKER_FAILURE_SUMMARY_MAX_CHARS)}…`
      : normalized;
  } catch {
    // 健康面必须比被观测的 worker 更可靠：摘要失败时宁可给固定安全文案。
    return 'worker tick failed';
  }
}

/** 超过该空窗且 worker 宣称 running → degraded（run/wiki 0.5s tick，取宽松阈值） */
export const WORKER_STALE_MS: Record<WorkerHealthKey, number> = {
  runWorker: 5_000,
  automationWorker: 90_000,
  wikiIngestWorker: 5_000,
  staleRunSweeper: 45_000,
};

/** `_at` 保留为兼容旧测试/调用点；启动本身不再伪造成功 tick。 */
export function markWorkerStarted(key: WorkerHealthKey, _at?: number): void {
  running[key] = true;
}

export function markWorkerStopped(key: WorkerHealthKey): void {
  running[key] = false;
}

export function noteWorkerTick(key: WorkerHealthKey, at = Date.now()): void {
  lastTickAt[key] = at;
  running[key] = true;
  consecutiveFailures[key] = 0;
  lastFailureAt[key] = null;
  lastFailureSummary[key] = null;
}

/** 只记录失败，不更新时间戳；age 始终基于上一次成功 tick。 */
export function noteWorkerFailure(
  key: WorkerHealthKey,
  error: unknown,
  at = Date.now(),
): void {
  consecutiveFailures[key] += 1;
  lastFailureAt[key] = at;
  lastFailureSummary[key] = summarizeWorkerFailure(error);
}

/**
 * 将 worker 的一次循环与健康语义绑定：仅成功后写 heartbeat；失败立即可观测，
 * 但仍把异常抛给 timer/wake 外层的 logger-safe wrapper。
 */
export async function trackWorkerTick<T>(
  key: WorkerHealthKey,
  operation: () => T | Promise<T>,
): Promise<T> {
  try {
    const result = await operation();
    noteWorkerTick(key);
    return result;
  } catch (error) {
    noteWorkerFailure(key, error);
    throw error;
  }
}

/**
 * timer / wake 的最后一道 Promise 边界。它故意吞掉 rejection，让 worker 下一轮
 * 仍能继续；调用方负责以完整 Error 写 logger，API 只读取上面的安全摘要。
 */
export function invokeWorkerTickSafely(
  operation: () => unknown | Promise<unknown>,
  onError: (error: unknown) => void,
): void {
  void Promise.resolve()
    .then(operation)
    .catch((error) => {
      try {
        onError(error);
      } catch (reportingError) {
        // 极端情况下 logger 本身异常也不能变成 unhandled rejection。
        console.error('[worker-health] failed to report tick failure', reportingError);
      }
    });
}

export function getWorkerLastTickAt(key: WorkerHealthKey): number | null {
  return lastTickAt[key];
}

export function isWorkerRunning(key: WorkerHealthKey): boolean {
  return running[key];
}

export type DbPingResult = { ok: boolean; latencyMs: number | null; error?: string };

const DB_SKIPPED: DbPingResult = { ok: true, latencyMs: null };

export function buildProcessHealth(opts?: {
  now?: number;
  db?: DbPingResult;
  treeKilled?: number;
}): ProcessHealthResponse {
  const now = opts?.now ?? Date.now();
  // 路由层注入真实 DB ping；单测可传 mock；缺省视为 skipped/ok
  const db = opts?.db ?? DB_SKIPPED;

  const workers = {} as Record<WorkerHealthKey, WorkerHealthSnapshot>;
  let workersDegraded = false;

  for (const key of Object.keys(lastTickAt) as WorkerHealthKey[]) {
    const t = lastTickAt[key];
    const isRunning = running[key];
    const ageMs = t == null ? null : Math.max(0, now - t);
    workers[key] = {
      lastTickAt: t,
      ageMs,
      running: isRunning,
      consecutiveFailures: consecutiveFailures[key],
      lastFailureAt: lastFailureAt[key],
      lastFailureSummary: lastFailureSummary[key],
    };

    if (!isRunning) {
      // 未启动：进程刚起或已关停 — 计 degraded
      workersDegraded = true;
      continue;
    }
    if (consecutiveFailures[key] > 0) {
      workersDegraded = true;
      continue;
    }
    if (ageMs != null && ageMs > WORKER_STALE_MS[key]) {
      workersDegraded = true;
    }
  }

  const status: ProcessHealthStatus = !db.ok || workersDegraded ? 'degraded' : 'ok';

  return {
    status,
    ts: now,
    uptimeMs: Math.max(0, now - startedAt),
    db,
    workers,
    treeKilled: opts?.treeKilled,
  };
}

/** 测试用：重置内存状态 */
export function __resetProcessHealthForTests(): void {
  for (const key of Object.keys(lastTickAt) as WorkerHealthKey[]) {
    lastTickAt[key] = null;
    running[key] = false;
    consecutiveFailures[key] = 0;
    lastFailureAt[key] = null;
    lastFailureSummary[key] = null;
  }
}
