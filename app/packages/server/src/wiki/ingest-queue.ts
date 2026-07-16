// S08 Wiki ingest 队列（spec §4，DB 行即锁 + DLQ=同表 dead）
import { eq, and, asc, inArray } from 'drizzle-orm';
import type { WikiIngestJob } from '@ma/shared';
import { db } from '../db/client.js';
import { wikiIngestJobs } from '../db/schema.js';

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
    })
    .run();
  return id;
}

// 条件 claim 1 个最老 pending → running（DB 行即锁）
export function claimNextWikiIngestJob() {
  const queued = db
    .select()
    .from(wikiIngestJobs)
    .where(eq(wikiIngestJobs.status, 'pending'))
    .orderBy(asc(wikiIngestJobs.createdAt))
    .limit(1)
    .get();
  if (!queued) return null;
  const now = Date.now();
  db.update(wikiIngestJobs)
    .set({ status: 'running', startedAt: now, updatedAt: now })
    .where(and(eq(wikiIngestJobs.id, queued.id), eq(wikiIngestJobs.status, 'pending')))
    .run();
  const row = db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, queued.id)).get();
  if (!row || row.status !== 'running') return null;
  return row;
}

export function completeWikiIngestJob(id: string): void {
  const now = Date.now();
  db.update(wikiIngestJobs)
    .set({ status: 'completed', finishedAt: now, updatedAt: now, lastError: null })
    .where(eq(wikiIngestJobs.id, id))
    .run();
}

// failCount++；< maxRetries → 回 pending 重试；否则 dead
export function failWikiIngestJob(id: string, error: string): void {
  const row = db.select().from(wikiIngestJobs).where(eq(wikiIngestJobs.id, id)).get();
  if (!row) return;
  const failCount = row.failCount + 1;
  const now = Date.now();
  if (failCount < row.maxRetries) {
    db.update(wikiIngestJobs)
      .set({
        status: 'pending',
        failCount,
        lastError: error.slice(0, 2000),
        updatedAt: now,
        startedAt: null,
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
      })
      .where(eq(wikiIngestJobs.id, id))
      .run();
  }
}

// dead → pending（人工 retry）
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
    })
    .where(eq(wikiIngestJobs.id, id))
    .run();
  return true;
}

// 启动 recovery：卡在 running 的 job 回收为 pending
export function recoverStuckRunningJobs(): number {
  const now = Date.now();
  const r = db
    .update(wikiIngestJobs)
    .set({ status: 'pending', updatedAt: now, startedAt: null })
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
