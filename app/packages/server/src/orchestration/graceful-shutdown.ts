// Slice 23：进程优雅退出 —— 停 worker → cancel ACTIVE DB runs → abort 残留 → 等 empty 或 grace。
// Slice 75：grace 后 residual 进程树强杀（killAllTrackedTrees）；最后一次关停报告供 Settings 观测。
// Slice 57：关停末尾可选 WAL checkpoint（PASSIVE，失败仅 warn）。
import { inArray } from 'drizzle-orm';
import { db, sqlite, walCheckpoint } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import { logger } from '../logger.js';
import {
  killAllTrackedTrees,
  trackedChildCount,
  type KillAllTrackedTreesReport,
} from '../runtime/process-tree.js';
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
  /** Slice 75：grace 后强杀的 tracked CLI 子进程数 */
  treeKilled: number;
  treeKillPids: number[];
};

export type ShutdownServerReport = CancelAllActiveRunsReport & {
  workersStopped: true;
  /** Slice 57：wal_checkpoint(PASSIVE) 是否执行成功；跳过则为 null */
  walCheckpointOk: boolean | null;
};

export type LastShutdownSnapshot = {
  at: number;
  cancelled: number;
  abortedResidual: number;
  stillActive: number;
  timedOut: boolean;
  treeKilled: number;
  treeKillPids: number[];
  walCheckpointOk: boolean | null;
};

let lastShutdown: LastShutdownSnapshot | null = null;

export function getLastShutdownSnapshot(): LastShutdownSnapshot | null {
  return lastShutdown;
}

/** 测试用 */
export function __resetLastShutdownForTests(): void {
  lastShutdown = null;
}

export type ShutdownServerOptions = {
  /** 等 in-memory abort 清空 / 子进程收尾 的 grace 窗口 */
  graceMs?: number;
  /** 轮询 listActiveRunIds 间隔 */
  pollMs?: number;
  /** 可注入依赖（测试用） */
  deps?: Partial<ShutdownDeps>;
  /** 默认 true：关停末尾 PASSIVE checkpoint；测试可关 */
  walCheckpoint?: boolean;
};

type ShutdownDeps = {
  stopWorkers: () => void;
  listDbActiveRunIds: () => string[];
  cancelRunsMany: (ids: string[]) => { cancelled: number };
  listActiveRunIds: () => string[];
  abortRun: (id: string) => boolean;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  walCheckpoint: () => void;
  killAllTrackedTrees: () => KillAllTrackedTreesReport;
  trackedChildCount: () => number;
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

function defaultWalCheckpoint(): void {
  walCheckpoint(sqlite, 'PASSIVE');
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
    walCheckpoint: partial?.walCheckpoint ?? defaultWalCheckpoint,
    killAllTrackedTrees: partial?.killAllTrackedTrees ?? killAllTrackedTrees,
    trackedChildCount: partial?.trackedChildCount ?? trackedChildCount,
  };
}

/**
 * 取消 DB 中全部 ACTIVE run，并对内存 abort 表残留再 abort 一次。
 * 随后轮询直到 listActiveRunIds 空或 grace 超时；超时后 residual 进程树强杀。
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

  let timedOut = stillActive.length > 0;
  let treeKilled = 0;
  let treeKillPids: number[] = [];

  // Slice 75：grace 后或仍有 tracked CLI 子进程时 residual tree kill
  const trackedBefore = d.trackedChildCount();
  if (timedOut || trackedBefore > 0) {
    const killed = d.killAllTrackedTrees();
    treeKilled = killed.attempted;
    treeKillPids = killed.pids;
    if (treeKilled > 0) {
      logger.warn(
        { treeKilled, treeKillPids, stillActive, graceMs },
        '[shutdown] residual process trees killed after grace',
      );
    }
    // 再扫一轮 abort 表（tree kill 后可能仍挂 key 直至 finish）
    stillActive = d.listActiveRunIds();
    timedOut = stillActive.length > 0;
  }

  if (timedOut) {
    logger.warn(
      { stillActive, graceMs, treeKilled },
      '[shutdown] grace elapsed with residual active aborts',
    );
  }

  return {
    cancelled: cancelRes.cancelled,
    abortedResidual,
    stillActive,
    timedOut,
    treeKilled,
    treeKillPids,
  };
}

/**
 * 完整关停序列：停 timers → cancel ACTIVE → residual tree kill → WAL。
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
      treeKilled: report.treeKilled,
    },
    '[shutdown] cancelAllActiveRuns done',
  );

  let walCheckpointOk: boolean | null = null;
  if (opts.walCheckpoint !== false) {
    try {
      d.walCheckpoint();
      walCheckpointOk = true;
      logger.info('[shutdown] wal_checkpoint(PASSIVE) ok');
    } catch (e) {
      walCheckpointOk = false;
      logger.warn(
        { err: e instanceof Error ? e.message : String(e) },
        '[shutdown] wal_checkpoint(PASSIVE) failed',
      );
    }
  }

  lastShutdown = {
    at: d.now(),
    cancelled: report.cancelled,
    abortedResidual: report.abortedResidual,
    stillActive: report.stillActive.length,
    timedOut: report.timedOut,
    treeKilled: report.treeKilled,
    treeKillPids: report.treeKillPids,
    walCheckpointOk,
  };

  return { ...report, workersStopped: true, walCheckpointOk };
}
