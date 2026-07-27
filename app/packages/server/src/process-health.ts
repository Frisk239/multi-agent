/** Slice 38：进程健康面 — worker 上次 tick + DB ping + overall */

export type WorkerHealthKey =
  | 'runWorker'
  | 'automationWorker'
  | 'wikiIngestWorker'
  | 'staleRunSweeper';

export type WorkerHealthSnapshot = {
  lastTickAt: number | null;
  ageMs: number | null;
  running: boolean;
};

export type ProcessHealthStatus = 'ok' | 'degraded';

export type ProcessHealthResponse = {
  status: ProcessHealthStatus;
  ts: number;
  uptimeMs: number;
  db: { ok: boolean; latencyMs: number | null; error?: string };
  workers: Record<WorkerHealthKey, WorkerHealthSnapshot>;
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

/** 超过该空窗且 worker 宣称 running → degraded（run/wiki 0.5s tick，取宽松阈值） */
export const WORKER_STALE_MS: Record<WorkerHealthKey, number> = {
  runWorker: 5_000,
  automationWorker: 90_000,
  wikiIngestWorker: 5_000,
  staleRunSweeper: 45_000,
};

export function markWorkerStarted(key: WorkerHealthKey, at = Date.now()): void {
  running[key] = true;
  // 启动即记一次，避免首 tick 前被误判 stale
  if (lastTickAt[key] == null) lastTickAt[key] = at;
}

export function markWorkerStopped(key: WorkerHealthKey): void {
  running[key] = false;
}

export function noteWorkerTick(key: WorkerHealthKey, at = Date.now()): void {
  lastTickAt[key] = at;
  running[key] = true;
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
    workers[key] = { lastTickAt: t, ageMs, running: isRunning };

    if (!isRunning) {
      // 未启动：进程刚起或已关停 — 计 degraded
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
  };
}

/** 测试用：重置内存状态 */
export function __resetProcessHealthForTests(): void {
  for (const key of Object.keys(lastTickAt) as WorkerHealthKey[]) {
    lastTickAt[key] = null;
    running[key] = false;
  }
}
