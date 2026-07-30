/** Slice 51：运维快照 — 一页 JSON 排障（runs / wiki / memory breaker / workers / automation） */
/** Slice 69：resumeStats — poison / resume_miss / deferred 近窗计数 */

import { and, desc, eq, gte, inArray, isNull, like, or } from 'drizzle-orm';
import { isAutoRetryableFailureReason } from '@ma/shared';
import {
  db,
  getSqliteHardeningInfo,
  type SqliteHardeningInfo,
} from './db/client.js';
import {
  agentRuns,
  automationRuns,
  inboxItems,
  wikiIngestJobs,
} from './db/schema.js';
import { memoryManager } from './memory/manager.js';
import {
  buildProcessHealth,
  type ProcessHealthResponse,
  type WorkerHealthKey,
  type WorkerHealthSnapshot,
} from './process-health.js';
import {
  deriveRunObservability,
  type RunTerminalReason,
} from './orchestration/run-observability.js';

/** Slice 69 钉死：近 7 日（createdAt） */
export const RESUME_STATS_WINDOW = '7d' as const;
export const RESUME_STATS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const TERMINAL_REASON_WINDOW = '7d' as const;
export const TERMINAL_REASON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const OPS_QUEUE_SAMPLE_LIMIT = 8;

export type OpsQueueAgeSummary = {
  count: number;
  maxMs: number | null;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
};

export type OpsQueueSample = {
  id: string;
  issueId: string | null;
  agentId: string;
  status: 'queued' | 'waiting_local_directory';
  ageMs: number;
  createdAt: number;
  waitingLocalEnteredAt: number | null;
  eligibleAt: number | null;
  blockedReason: 'retry_backoff' | null;
};

export type OpsTerminalReason = {
  reason: RunTerminalReason;
  count: number;
  retryable: boolean;
  latestAt: number | null;
};

export type OpsRunsSnapshot = {
  active: {
    total: number;
    queued: number;
    running: number;
    waitingLocalDirectory: number;
    /** Count of queued/waiting runs still in auto-retry backoff (not work-eligible). */
    retryBackoff: number;
  };
  /** All queue ages (includes backoff rows; raw wall time in queue). */
  queueAge: OpsQueueAgeSummary;
  /**
   * Queue ages excluding retry_backoff rows — drives at-risk / degraded signals
   * so auto-retry children waiting for nextAttemptAt do not look stuck.
   */
  eligibleQueueAge: OpsQueueAgeSummary;
  /** running 心跳龄摘要（lastHeartbeatAt/startedAt/createdAt → now） */
  runningHeartbeatAge: OpsQueueAgeSummary;
  queueSamples: OpsQueueSample[];
  terminalReasons: OpsTerminalReason[];
  terminalWindow: typeof TERMINAL_REASON_WINDOW;
};

/** Minimal run fields needed to project queue health (pure; unit-testable). */
export type OpsQueueRunRow = {
  id: string;
  issueId: string | null;
  agentId: string;
  status: string;
  createdAt: number;
  startedAt?: number | null;
  lastHeartbeatAt?: number | null;
  waitingLocalEnteredAt?: number | null;
  nextAttemptAt?: number | null;
};

export type OpsQueueMetrics = {
  queued: number;
  running: number;
  waitingLocalDirectory: number;
  retryBackoff: number;
  queueAges: number[];
  eligibleQueueAges: number[];
  hbAges: number[];
  queueSamples: OpsQueueSample[];
};

/**
 * Project active-run rows into queue/heartbeat metrics.
 * Pure helper: auto-retry backoff rows still count toward wall-clock queueAge,
 * but are excluded from eligibleQueueAge and counted in retryBackoff.
 */
export function accumulateOpsQueueMetrics(
  rows: OpsQueueRunRow[],
  now: number,
): OpsQueueMetrics {
  let queued = 0;
  let running = 0;
  let waitingLocalDirectory = 0;
  let retryBackoff = 0;
  const queueAges: number[] = [];
  const eligibleQueueAges: number[] = [];
  const hbAges: number[] = [];
  const queueSamples: OpsQueueSample[] = [];

  for (const row of rows) {
    if (row.status === 'queued') {
      queued += 1;
      const age = Math.max(0, now - row.createdAt);
      queueAges.push(age);
      const observed = deriveRunObservability(row, now);
      if (observed.queueBlockedReason === 'retry_backoff') retryBackoff += 1;
      else eligibleQueueAges.push(age);
      queueSamples.push({
        id: row.id,
        issueId: row.issueId,
        agentId: row.agentId,
        status: 'queued',
        ageMs: age,
        createdAt: row.createdAt,
        waitingLocalEnteredAt: null,
        eligibleAt: observed.queueEligibleAt,
        blockedReason: observed.queueBlockedReason,
      });
    } else if (row.status === 'waiting_local_directory') {
      waitingLocalDirectory += 1;
      const entered = row.waitingLocalEnteredAt ?? row.createdAt;
      const age = Math.max(0, now - entered);
      queueAges.push(age);
      const observed = deriveRunObservability(row, now);
      if (observed.queueBlockedReason === 'retry_backoff') retryBackoff += 1;
      else eligibleQueueAges.push(age);
      queueSamples.push({
        id: row.id,
        issueId: row.issueId,
        agentId: row.agentId,
        status: 'waiting_local_directory',
        ageMs: age,
        createdAt: row.createdAt,
        waitingLocalEnteredAt: row.waitingLocalEnteredAt ?? null,
        eligibleAt: observed.queueEligibleAt,
        blockedReason: observed.queueBlockedReason,
      });
    } else if (row.status === 'running') {
      running += 1;
      const hb = row.lastHeartbeatAt ?? row.startedAt ?? row.createdAt;
      hbAges.push(Math.max(0, now - hb));
    }
  }

  return {
    queued,
    running,
    waitingLocalDirectory,
    retryBackoff,
    queueAges,
    eligibleQueueAges,
    hbAges,
    queueSamples,
  };
}

export type OpsWikiSnapshot = {
  dead: number;
  pending: number;
  running: number;
  failed: number;
  completed: number;
};

export type OpsMemoryBreakerSnapshot = {
  provider: string | null;
  available: boolean;
  backend: 'sqlite' | 'pgvector' | 'none';
  breakerOpen: boolean;
  breakerFailures: number;
  breakerOpenUntil: string | null;
};

export type OpsAutomationLastError = {
  ruleId: string;
  runId: string;
  error: string;
  at: string;
  source: 'schedule' | 'manual';
};

export type OpsAutomationSnapshot = {
  lastError: OpsAutomationLastError | null;
  failedRules: number;
  lastFailedAt: string | null;
};

/** Slice 57：SQLite 硬化面（busy_timeout / journal / path） */
export type OpsSqliteSnapshot = Pick<
  SqliteHardeningInfo,
  'path' | 'busyTimeoutMs' | 'journalMode' | 'foreignKeys'
>;

/**
 * Slice 69：session resume / deferred 运营计数（近窗，非时序 BI）
 * - sessionPoisoned：session_poisoned=1 的 run 数
 * - resumeMiss：session_resume_status='resume_miss'
 * - deferredUnclaimed：inbox 未读未归档、dedupe_key 以 deferred: 开头
 */
export type OpsResumeStats = {
  sessionPoisoned: number;
  resumeMiss: number;
  deferredUnclaimed: number;
  window: typeof RESUME_STATS_WINDOW;
};

export type OpsSnapshot = {
  ts: number;
  status: 'ok' | 'degraded';
  runs: OpsRunsSnapshot;
  wiki: OpsWikiSnapshot;
  memory: OpsMemoryBreakerSnapshot;
  workers: Record<WorkerHealthKey, WorkerHealthSnapshot>;
  process: Pick<ProcessHealthResponse, 'uptimeMs' | 'db' | 'status'>;
  automation: OpsAutomationSnapshot;
  /** Slice 57：主库 pragma 快照 */
  sqlite: OpsSqliteSnapshot;
  /** Slice 69：poison / resume_miss / deferred 近窗计数 */
  resumeStats: OpsResumeStats;
};

function percentileSorted(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo]!;
  const w = rank - lo;
  return sortedAsc[lo]! * (1 - w) + sortedAsc[hi]! * w;
}

export function summarizeAgesMs(ages: number[]): OpsQueueAgeSummary {
  if (ages.length === 0) {
    return { count: 0, maxMs: null, avgMs: null, p50Ms: null, p95Ms: null };
  }
  const sorted = [...ages].sort((a, b) => a - b);
  const sum = sorted.reduce((s, n) => s + n, 0);
  return {
    count: sorted.length,
    maxMs: sorted[sorted.length - 1]!,
    avgMs: Math.round(sum / sorted.length),
    p50Ms: Math.round(percentileSorted(sorted, 50)!),
    p95Ms: Math.round(percentileSorted(sorted, 95)!),
  };
}

export function buildOpsRunsSnapshot(now = Date.now()): OpsRunsSnapshot {
  const rows = db
    .select({
      id: agentRuns.id,
      issueId: agentRuns.issueId,
      agentId: agentRuns.agentId,
      status: agentRuns.status,
      createdAt: agentRuns.createdAt,
      startedAt: agentRuns.startedAt,
      lastHeartbeatAt: agentRuns.lastHeartbeatAt,
      // Slice 66：waiting 龄用进入时刻，避免用 createdAt 瞎猜
      waitingLocalEnteredAt: agentRuns.waitingLocalEnteredAt,
      nextAttemptAt: agentRuns.nextAttemptAt,
      failureReason: agentRuns.failureReason,
      error: agentRuns.error,
      finishedAt: agentRuns.finishedAt,
    })
    .from(agentRuns)
    .where(
      inArray(agentRuns.status, [
        'queued',
        'waiting_local_directory',
        'running',
      ]),
    )
    .all();

  const {
    queued,
    running,
    waitingLocalDirectory,
    retryBackoff,
    queueAges,
    eligibleQueueAges,
    hbAges,
    queueSamples,
  } = accumulateOpsQueueMetrics(rows, now);

  const terminalRows = db
    .select({
      status: agentRuns.status,
      failureReason: agentRuns.failureReason,
      error: agentRuns.error,
      finishedAt: agentRuns.finishedAt,
      createdAt: agentRuns.createdAt,
    })
    .from(agentRuns)
    .where(
      and(
        inArray(agentRuns.status, ['completed', 'failed', 'cancelled', 'timed_out']),
        or(
          gte(agentRuns.finishedAt, now - TERMINAL_REASON_WINDOW_MS),
          and(isNull(agentRuns.finishedAt), gte(agentRuns.createdAt, now - TERMINAL_REASON_WINDOW_MS)),
        ),
      ),
    )
    .all();
  const terminalMap = new Map<RunTerminalReason, { count: number; latestAt: number | null }>();
  for (const row of terminalRows) {
    const reason = deriveRunObservability(row, now).terminalReason;
    if (!reason) continue;
    const at = row.finishedAt ?? row.createdAt;
    const current = terminalMap.get(reason);
    terminalMap.set(reason, {
      count: (current?.count ?? 0) + 1,
      latestAt: current?.latestAt == null ? at : Math.max(current.latestAt, at),
    });
  }
  const terminalReasons: OpsTerminalReason[] = [...terminalMap.entries()]
    .map(([reason, value]) => ({
      reason,
      count: value.count,
      retryable: isAutoRetryableFailureReason(reason),
      latestAt: value.latestAt,
    }))
    .sort((a, b) => b.count - a.count || (b.latestAt ?? 0) - (a.latestAt ?? 0));

  return {
    active: {
      total: queued + running + waitingLocalDirectory,
      queued,
      running,
      waitingLocalDirectory,
      retryBackoff,
    },
    queueAge: summarizeAgesMs(queueAges),
    eligibleQueueAge: summarizeAgesMs(eligibleQueueAges),
    runningHeartbeatAge: summarizeAgesMs(hbAges),
    queueSamples: queueSamples.sort((a, b) => b.ageMs - a.ageMs).slice(0, OPS_QUEUE_SAMPLE_LIMIT),
    terminalReasons,
    terminalWindow: TERMINAL_REASON_WINDOW,
  };
}

export function buildOpsWikiSnapshot(): OpsWikiSnapshot {
  const rows = db
    .select({ status: wikiIngestJobs.status })
    .from(wikiIngestJobs)
    .all();
  let dead = 0;
  let pending = 0;
  let running = 0;
  let failed = 0;
  let completed = 0;
  for (const r of rows) {
    if (r.status === 'dead') dead += 1;
    else if (r.status === 'pending') pending += 1;
    else if (r.status === 'running') running += 1;
    else if (r.status === 'failed') failed += 1;
    else if (r.status === 'completed') completed += 1;
  }
  return { dead, pending, running, failed, completed };
}

export function buildOpsMemorySnapshot(): OpsMemoryBreakerSnapshot {
  const st = memoryManager.getStatus();
  return {
    provider: st.provider,
    available: st.available,
    backend: st.backend,
    breakerOpen: st.breakerOpen,
    breakerFailures: st.breakerFailures,
    breakerOpenUntil: st.breakerOpenUntil,
  };
}

export function buildOpsAutomationSnapshot(): OpsAutomationSnapshot {
  const failRuns = db
    .select({
      id: automationRuns.id,
      ruleId: automationRuns.ruleId,
      error: automationRuns.error,
      createdAt: automationRuns.createdAt,
      source: automationRuns.source,
    })
    .from(automationRuns)
    .where(eq(automationRuns.status, 'failed'))
    .orderBy(desc(automationRuns.createdAt))
    .all();

  const failedRuleIds = new Set(failRuns.map((r) => r.ruleId));
  const latest = failRuns[0] ?? null;
  let lastError: OpsAutomationLastError | null = null;
  if (latest && latest.error && latest.error.trim()) {
    lastError = {
      ruleId: latest.ruleId,
      runId: latest.id,
      error: latest.error.slice(0, 2000),
      at: new Date(latest.createdAt).toISOString(),
      source: latest.source as 'schedule' | 'manual',
    };
  } else if (latest) {
    // 失败行但 error 空：仍暴露最近失败时间，error 用占位
    lastError = {
      ruleId: latest.ruleId,
      runId: latest.id,
      error: '(no error text)',
      at: new Date(latest.createdAt).toISOString(),
      source: latest.source as 'schedule' | 'manual',
    };
  }

  return {
    lastError: failRuns.length > 0 ? lastError : null,
    failedRules: failedRuleIds.size,
    lastFailedAt:
      latest != null ? new Date(latest.createdAt).toISOString() : null,
  };
}

export function buildOpsSqliteSnapshot(
  info?: OpsSqliteSnapshot,
): OpsSqliteSnapshot {
  if (info) return info;
  try {
    return getSqliteHardeningInfo();
  } catch {
    return {
      path: process.env.DB_PATH ?? './dev.db',
      busyTimeoutMs: 0,
      journalMode: 'unknown',
      foreignKeys: false,
    };
  }
}

/**
 * Slice 69：近 7 日 poison / resume_miss + 同窗未读 deferred inbox。
 * SQLite 上简单 select + length；空库全 0。
 */
export function buildOpsResumeStats(now = Date.now()): OpsResumeStats {
  const cutoff = now - RESUME_STATS_WINDOW_MS;

  let sessionPoisoned = 0;
  let resumeMiss = 0;
  let deferredUnclaimed = 0;

  try {
    sessionPoisoned = db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.sessionPoisoned, 1),
          gte(agentRuns.createdAt, cutoff),
        ),
      )
      .all().length;

    resumeMiss = db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.sessionResumeStatus, 'resume_miss'),
          gte(agentRuns.createdAt, cutoff),
        ),
      )
      .all().length;

    deferredUnclaimed = db
      .select({ id: inboxItems.id })
      .from(inboxItems)
      .where(
        and(
          eq(inboxItems.read, 0),
          eq(inboxItems.archived, 0),
          like(inboxItems.dedupeKey, 'deferred:%'),
          gte(inboxItems.createdAt, cutoff),
        ),
      )
      .all().length;
  } catch {
    // 排障快照不应因计数失败拖垮整页；降级 0
    sessionPoisoned = 0;
    resumeMiss = 0;
    deferredUnclaimed = 0;
  }

  return {
    sessionPoisoned,
    resumeMiss,
    deferredUnclaimed,
    window: RESUME_STATS_WINDOW,
  };
}

export function buildOpsSnapshot(opts?: {
  now?: number;
  processHealth?: ProcessHealthResponse;
  sqlite?: OpsSqliteSnapshot;
}): OpsSnapshot {
  const now = opts?.now ?? Date.now();
  const processHealth = opts?.processHealth ?? buildProcessHealth({ now });
  const runs = buildOpsRunsSnapshot(now);
  const wiki = buildOpsWikiSnapshot();
  const memory = buildOpsMemorySnapshot();
  const automation = buildOpsAutomationSnapshot();
  const sqliteSnap = buildOpsSqliteSnapshot(opts?.sqlite);
  const resumeStats = buildOpsResumeStats(now);

  const processDegraded = processHealth.status === 'degraded';
  const opsDegraded =
    processDegraded ||
    !memory.available ||
    memory.breakerOpen ||
    wiki.dead > 0 ||
    automation.failedRules > 0 ||
    (runs.eligibleQueueAge.maxMs != null && runs.eligibleQueueAge.maxMs > 60_000);

  return {
    ts: now,
    status: opsDegraded ? 'degraded' : 'ok',
    runs,
    wiki,
    memory,
    workers: processHealth.workers,
    process: {
      status: processHealth.status,
      uptimeMs: processHealth.uptimeMs,
      db: processHealth.db,
      // Slice 75：上次关停 residual tree kill 计数（无则为 undefined）
      ...(processHealth.treeKilled != null
        ? { treeKilled: processHealth.treeKilled }
        : {}),
    },
    automation,
    sqlite: sqliteSnap,
    resumeStats,
  };
}
