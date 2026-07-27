// Slice 23：进程优雅退出 —— 停 worker → cancel ACTIVE DB runs → abort 残留 → 等 empty 或 grace。
// 复用 cancelRunsMany / abortRun / listActiveRunIds；不重写 killTree（spawn-line 走 AbortSignal）。
import { inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import { logger } from '../logger.js';
import { stopAutomationWorker } from './automation-worker.js';
import { abortRun, listActiveRunIds } from './run-control.js';
import { cancelRunsMany } from './run-service.js';
import { stopRunWorker } from './run-worker.js';
import { stopStaleRunSweeper } from './stale-runs.js';
import { stopWikiIngestWorker } from '../wiki/ingest-worker.js';

/** DB active statuses — 与 run-service cancel 入口对齐 */
const ACTIVE = ['queued', 'waiting_local_directory', 'running'] as const;

export const DEFAULT_SHUTDOWN_GRACE_MS = 8_000;
export const DEFAULT_HARD_EXIT_MS = 12_000;

export type CancelAllActiveRunsReport = {
  cancelled: number;
  abortedResidual: number;
  stillActive: string[];
  timedOut: boolean;
};

export type ShutdownServerReport = CancelAllActiveRunsReport & {
  workersStopped: true;
};

export type ShutdownServerOptions = {
  /** 等 in-memory abort 清空 / 子进程收尾 的 grace 窗口 */
  graceMs?: number;
  /** 轮询 listActiveRunIds 间隔 */
  pollMs?: number;
  /** 可注入依赖（测试用） */
  deps?: Partial<ShutdownDeps>;
};

type ShutdownDeps = {
  stopWorkers: () => void;
  listDbActiveRunIds: () => string[];
  cancelRunsMany: (ids: string[]) => { cancelled: number };
  listActiveRunIds: () => string[];
  abortRun: (id: string) => boolean;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

function defaultStopWorkers(): void {
  stopRunWorker();
  stopStaleRunSweeper();
  stopAutomationWorker();
  stopWikiIngestWorker();
}

function listDbActiveRunIds(): string[] {
  return db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(inArray(agentRuns.status, [...ACTIVE]))
    .all()
    .map((r) => r.id);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveDeps(partial?: Partial<ShutdownDeps>): ShutdownDeps {
  return {
    stopWorkers: partial?.stopWorkers ?? defaultStopWorkers,
    listDbActiveRunIds: partial?.listDbActiveRunIds ?? listDbActiveRunIds,
    cancelRunsMany: partial?.cancelRunsMany ?? cancelRunsMany,
    listActiveRunIds: partial?.listActiveRunIds ?? listActiveRunIds,
    abortRun: partial?.abortRun ?? abortRun,
    sleep: partial?.sleep ?? sleep,
    now: partial?.now ?? (() => Date.now()),
  };
}

/**
 * 取消 DB 中全部 ACTIVE run，并对内存 abort 表残留再 abort 一次。
 * 随后轮询直到 listActiveRunIds 空或 grace 超时。
 */
export async function cancelAllActiveRuns(
  opts: {
    graceMs?: number;
    pollMs?: number;
    deps?: Partial<ShutdownDeps>;
  } = {},
): Promise<CancelAllActiveRunsReport> {
  const graceMs = opts.graceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;
  const pollMs = opts.pollMs ?? 50;
  const d = resolveDeps(opts.deps);

  const dbIds = d.listDbActiveRunIds();
  const cancelRes = dbIds.length > 0 ? d.cancelRunsMany(dbIds) : { cancelled: 0 };

  // cancelRunById 已 abort；对仍挂着的 controller 再 sweep 一次（竞态 / 非 DB 路径）
  let abortedResidual = 0;
  for (const id of d.listActiveRunIds()) {
    if (d.abortRun(id)) abortedResidual += 1;
  }

  const deadline = d.now() + graceMs;
  let stillActive = d.listActiveRunIds();
  while (stillActive.length > 0 && d.now() < deadline) {
    await d.sleep(pollMs);
    stillActive = d.listActiveRunIds();
  }

  const timedOut = stillActive.length > 0;
  if (timedOut) {
    logger.warn(
      { stillActive, graceMs },
      '[shutdown] grace elapsed with residual active aborts',
    );
  }

  return {
    cancelled: cancelRes.cancelled,
    abortedResidual,
    stillActive,
    timedOut,
  };
}

/**
 * 完整关停序列：停 timers → cancel ACTIVE → 等 grace。
 * 调用方负责 app.close() 与 hard process.exit 超时。
 */
export async function shutdownServer(
  opts: ShutdownServerOptions = {},
): Promise<ShutdownServerReport> {
  const d = resolveDeps(opts.deps);
  d.stopWorkers();
  logger.info('[shutdown] workers stopped');

  const report = await cancelAllActiveRuns({
    graceMs: opts.graceMs,
    pollMs: opts.pollMs,
    deps: d,
  });

  logger.info(
    {
      cancelled: report.cancelled,
      abortedResidual: report.abortedResidual,
      stillActive: report.stillActive.length,
      timedOut: report.timedOut,
    },
    '[shutdown] cancelAllActiveRuns done',
  );

  return { ...report, workersStopped: true };
}
