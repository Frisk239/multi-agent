// S08 Wiki ingest 队列（spec §4，DB 行即锁 + DLQ=同表 dead）
// Slice 39 / R6：fail → nextAttemptAt 指数退避；claim 尊重 nextAttemptAt
import { eq, and, asc, inArray, or, isNull, lte } from 'drizzle-orm';
import type { WikiIngestJob } from '@ma/shared';
import { db } from '../db/client.js';
import { wikiIngestJobs } from '../db/schema.js';

/** 基础退避 5s，按 failCount 指数增长，封顶 15min */
export const WIKI_BACKOFF_BASE_MS = 5_000;
export const WIKI_BACKOFF_MAX_MS = 15 * 60_000;

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

export function completeWikiIngestJob(id: string): void {
  const now = Date.now();
  db.update(wikiIngestJobs)
    .set({
      status: 'completed',
      finishedAt: now,
      updatedAt: now,
      lastError: null,
      nextAttemptAt: null,
    })
    .where(eq(wikiIngestJobs.id, id))
    .run();
}

// failCount++；< maxRetries → 回 pending + nextAttemptAt 退避；否则 dead
export function failWikiIngestJob(id: string, error: string, now = Date.now()): void {
  const row = db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, id)).get();
  if (!row) return;
  const failCount = row.failCount + 1;
  if (failCount < row.maxRetries) {
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
      .where(eq(wikiIngestJobs.id, id))
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
      .where(eq(wikiIngestJobs.id, id))
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

// 启动 recovery：卡在 running 的 job 回收为 pending（立即可 claim）
export function recoverStuckRunningJobs(): number {
  const now = Date.now();
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
