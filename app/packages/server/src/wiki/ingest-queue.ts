// S08 Wiki ingest 队列（spec §4，DB 行即锁 + DLQ=同表 dead）
// Slice 39 / R6：fail → nextAttemptAt 指数退避；claim 尊重 nextAttemptAt
// Slice 47 / H2：running lease 墙钟；启动 recover 与运行中 lease 语义分离
import { eq, and, asc, inArray, or, isNull, lte } from 'drizzle-orm';
import type { WikiIngestJob } from '@ma/shared';
import { db } from '../db/client.js';
import { wikiIngestJobs } from '../db/schema.js';

/** 基础退避 5s，按 failCount 指数增长，封顶 15min */
export const WIKI_BACKOFF_BASE_MS = 5_000;
export const WIKI_BACKOFF_MAX_MS = 15 * 60_000;

/**
 * Slice 47 / H2：running 墙钟 lease 默认 20min。
 * env `MA_WIKI_RUNNING_LEASE_MS`；`0`/`false`=关闭运行中 lease（启动 recover 仍生效）。
 */
export const DEFAULT_WIKI_RUNNING_LEASE_MS = 20 * 60_000;

function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw === '0' || raw === 'false') return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 运行中 stuck 墙钟（ms）；0=禁用 requeueStaleRunningJobs */
export function getWikiRunningLeaseMs(): number {
  return envMs('MA_WIKI_RUNNING_LEASE_MS', DEFAULT_WIKI_RUNNING_LEASE_MS);
}

/** failCount 已自增后：delay = min(base * 2^(failCount-1), max) */
export function wikiIngestBackoffMs(failCount: number): number {
  const n = Math.max(1, failCount);
  const raw = WIKI_BACKOFF_BASE_MS * 2 ** (n - 1);
  return Math.min(raw, WIKI_BACKOFF_MAX_MS);
}

export function toWikiIngestJob(row: typeof wikiIngestJobs.$inferSelect): WikiIngestJob {
  const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
  return {
    id: row.id,
    issueId: row.issueId,
    status: row.status as WikiIngestJob['status'],
    failCount: row.failCount,
    maxRetries: row.maxRetries,
    lastError: row.lastError,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    nextAttemptAt: iso(row.nextAttemptAt ?? null),
  };
}

// 同 issue 已有 pending|running 则 skip，返回 null（防重复入队）
export function enqueueWikiIngest(issueId: string): string | null {
  const existing = db
    .select()
    .from(wikiIngestJobs)
    .where(
      and(
        eq(wikiIngestJobs.issueId, issueId),
        inArray(wikiIngestJobs.status, ['pending', 'running']),
      ),
    )
    .get();
  if (existing) return null;

  const id = crypto.randomUUID();
  const now = Date.now();
  db.insert(wikiIngestJobs)
    .values({
      id,
      issueId,
      status: 'pending',
      failCount: 0,
      maxRetries: 3,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
      nextAttemptAt: null,
    })
    .run();
  return id;
}

// 条件 claim 1 个最老 pending → running（DB 行即锁）；尊重 nextAttemptAt
export function claimNextWikiIngestJob(now = Date.now()) {
  const queued = db
    .select()
    .from(wikiIngestJobs)
    .where(
      and(
        eq(wikiIngestJobs.status, 'pending'),
        or(isNull(wikiIngestJobs.nextAttemptAt), lte(wikiIngestJobs.nextAttemptAt, now)),
      ),
    )
    .orderBy(asc(wikiIngestJobs.createdAt))
    .limit(1)
    .get();
  if (!queued) return null;
  db.update(wikiIngestJobs)
    .set({
      status: 'running',
      startedAt: now,
      updatedAt: now,
      nextAttemptAt: null,
    })
    .where(and(eq(wikiIngestJobs.id, queued.id), eq(wikiIngestJobs.status, 'pending')))
    .run();
  const row = db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, queued.id)).get();
  if (!row || row.status !== 'running') return null;
  return row;
}

/** 仅当仍为 running 时 complete（lease 已 requeue / 已终态则 no-op，防双杀） */
export function completeWikiIngestJob(id: string, now = Date.now()): void {
  db.update(wikiIngestJobs)
    .set({
      status: 'completed',
      finishedAt: now,
      updatedAt: now,
      lastError: null,
      nextAttemptAt: null,
    })
    .where(and(eq(wikiIngestJobs.id, id), eq(wikiIngestJobs.status, 'running')))
    .run();
}

/**
 * failCount++；< maxRetries → 回 pending + nextAttemptAt 退避；否则 dead。
 * 仅当仍为 running 时生效（lease requeue 后迟到的 execute fail 不二次计次）。
 * G4-3：无 LLM key（WIKI_LLM_API_KEY 未配置）是环境问题，退避重试无意义 ——
 * 直接 dead（含人工 retry 未配 key 的场景，不再烧一轮 5s/10s/20s）。
 */
export function failWikiIngestJob(id: string, error: string, now = Date.now()): void {
  const row = db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, id)).get();
  if (!row || row.status !== 'running') return;
  const failCount = row.failCount + 1;
  const missingKey = String(error).includes('WIKI_LLM_API_KEY');
  if (!missingKey && failCount < row.maxRetries) {
    const nextAttemptAt = now + wikiIngestBackoffMs(failCount);
    db.update(wikiIngestJobs)
      .set({
        status: 'pending',
        failCount,
        lastError: error.slice(0, 2000),
        updatedAt: now,
        startedAt: null,
        nextAttemptAt,
      })
      .where(and(eq(wikiIngestJobs.id, id), eq(wikiIngestJobs.status, 'running')))
      .run();
  } else {
    db.update(wikiIngestJobs)
      .set({
        status: 'dead',
        failCount,
        lastError: error.slice(0, 2000),
        updatedAt: now,
        finishedAt: now,
        nextAttemptAt: null,
      })
      .where(and(eq(wikiIngestJobs.id, id), eq(wikiIngestJobs.status, 'running')))
      .run();
  }
}

// dead → pending（人工 retry）；清退避与 failCount
export function retryWikiIngestJob(id: string): boolean {
  const row = db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, id)).get();
  if (!row || row.status !== 'dead') return false;
  const now = Date.now();
  db.update(wikiIngestJobs)
    .set({
      status: 'pending',
      failCount: 0,
      lastError: null,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
      nextAttemptAt: null,
    })
    .where(eq(wikiIngestJobs.id, id))
    .run();
  return true;
}

/** 批量重试全部 dead（上限 100） */
export function retryAllDeadWikiIngestJobs(limit = 100): {
  requested: number;
  retried: number;
  skipped: number;
} {
  const dead = db
    .select()
    .from(wikiIngestJobs)
    .where(eq(wikiIngestJobs.status, 'dead'))
    .orderBy(asc(wikiIngestJobs.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)))
    .all();
  let retried = 0;
  let skipped = 0;
  for (const row of dead) {
    if (retryWikiIngestJob(row.id)) retried += 1;
    else skipped += 1;
  }
  return { requested: dead.length, retried, skipped };
}

/**
 * 启动 recovery（仅 worker start 调用）：上一进程遗留的全部 running → pending。
 * - 不计 failCount（进程已死，属孤儿锁，非业务失败）
 * - nextAttemptAt=null → 立即可 claim
 * - 与 requeueStaleRunningJobs 不双杀：启动后无 running 残留；运行中只走 lease
 */
export function recoverStuckRunningJobs(now = Date.now()): number {
  const r = db
    .update(wikiIngestJobs)
    .set({
      status: 'pending',
      updatedAt: now,
      startedAt: null,
      nextAttemptAt: null,
    })
    .where(eq(wikiIngestJobs.status, 'running'))
    .run();
  return r.changes ?? 0;
}

/**
 * Slice 47 / H2：运行中 lease 扫。
 * - 条件：status=running 且 (startedAt ?? updatedAt) < now - lease
 * - 策略：走 fail 路径 → failCount++；未满 max → pending + nextAttemptAt 退避；满 → dead
 * - lease=0 关闭（启动 recover 仍可用）
 * - 可注入 now 便于单测时钟推进
 */
export function requeueStaleRunningJobs(now = Date.now()): number {
  const leaseMs = getWikiRunningLeaseMs();
  if (leaseMs <= 0) return 0;
  const cutoff = now - leaseMs;
  const running = db
    .select()
    .from(wikiIngestJobs)
    .where(eq(wikiIngestJobs.status, 'running'))
    .all();
  let n = 0;
  for (const row of running) {
    const leaseStart = row.startedAt ?? row.updatedAt;
    if (leaseStart > cutoff) continue;
    const beforeStatus = row.status;
    failWikiIngestJob(
      row.id,
      `stale: wiki ingest running lease exceeded (${leaseMs}ms)`,
      now,
    );
    const after = db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, row.id)).get();
    if (after && after.status !== beforeStatus) n += 1;
  }
  return n;
}

export function listWikiIngestJobs(status?: string) {
  if (status) {
    return db
      .select()
      .from(wikiIngestJobs)
      .where(
        eq(
          wikiIngestJobs.status,
          status as 'pending' | 'running' | 'completed' | 'failed' | 'dead',
        ),
      )
      .orderBy(asc(wikiIngestJobs.createdAt))
      .all();
  }
  return db.select().from(wikiIngestJobs).orderBy(asc(wikiIngestJobs.createdAt)).all();
}

export function getWikiIngestJob(id: string) {
  return db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, id)).get();
}
