import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { wikiIngestJobs } from '../db/schema.js';

const testState = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!testState.db) throw new Error('test db not ready');
    return testState.db;
  },
}));

import {
  claimNextWikiIngestJob,
  completeWikiIngestJob,
  enqueueWikiIngest,
  failWikiIngestJob,
  getWikiRunningLeaseMs,
  recoverStuckRunningJobs,
  requeueStaleRunningJobs,
  retryWikiIngestJob,
  wikiIngestBackoffMs,
  DEFAULT_WIKI_RUNNING_LEASE_MS,
  WIKI_BACKOFF_BASE_MS,
  WIKI_BACKOFF_MAX_MS,
} from './ingest-queue.js';

describe('wiki ingest backoff (Slice 39)', () => {
  beforeEach(() => {
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
  });

  afterEach(() => {
    testState.cleanup?.();
    testState.db = null;
    testState.cleanup = null;
  });

  it('wikiIngestBackoffMs is exponential and capped', () => {
    expect(wikiIngestBackoffMs(1)).toBe(WIKI_BACKOFF_BASE_MS);
    expect(wikiIngestBackoffMs(2)).toBe(WIKI_BACKOFF_BASE_MS * 2);
    expect(wikiIngestBackoffMs(3)).toBe(WIKI_BACKOFF_BASE_MS * 4);
    expect(wikiIngestBackoffMs(20)).toBe(WIKI_BACKOFF_MAX_MS);
  });

  it('claim skips jobs still in backoff; claims when nextAttemptAt reached', () => {
    const jobId = enqueueWikiIngest('iss-test-1');
    expect(jobId).toBeTruthy();

    const t0 = 1_700_000_000_000;
    // force into running then fail → pending + nextAttemptAt
    testState.db!
      .update(wikiIngestJobs)
      .set({ status: 'running', startedAt: t0, updatedAt: t0 })
      .where(eq(wikiIngestJobs.id, jobId!))
      .run();

    failWikiIngestJob(jobId!, 'boom', t0);
    const afterFail = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(afterFail.status).toBe('pending');
    expect(afterFail.failCount).toBe(1);
    expect(afterFail.nextAttemptAt).toBe(t0 + wikiIngestBackoffMs(1));

    // still in backoff
    expect(claimNextWikiIngestJob(t0 + 1000)).toBeNull();

    // time reached
    const claimed = claimNextWikiIngestJob(afterFail.nextAttemptAt!);
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(jobId);
    expect(claimed!.status).toBe('running');
    expect(claimed!.nextAttemptAt).toBeNull();
  });

  it('reaches dead after maxRetries and supports manual retry', () => {
    const jobId = enqueueWikiIngest('iss-test-1');
    expect(jobId).toBeTruthy();
    const t0 = 1_700_000_000_000;

    // maxRetries default 3 → need 3 fails to dead
    for (let i = 0; i < 3; i++) {
      testState.db!
        .update(wikiIngestJobs)
        .set({ status: 'running', startedAt: t0 + i, updatedAt: t0 + i, nextAttemptAt: null })
        .where(eq(wikiIngestJobs.id, jobId!))
        .run();
      failWikiIngestJob(jobId!, `err-${i}`, t0 + i);
    }

    const dead = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(dead.status).toBe('dead');
    expect(dead.failCount).toBe(3);
    expect(dead.nextAttemptAt).toBeNull();
    expect(claimNextWikiIngestJob(t0 + 999_999_999)).toBeNull();

    expect(retryWikiIngestJob(jobId!)).toBe(true);
    const pending = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(pending.status).toBe('pending');
    expect(pending.failCount).toBe(0);
    expect(pending.nextAttemptAt).toBeNull();

    const claimed = claimNextWikiIngestJob(t0);
    expect(claimed?.id).toBe(jobId);
  });

  it('G4-3 no-key error → dead immediately (no backoff burn, even with maxRetries=3)', () => {
    const jobId = enqueueWikiIngest('iss-test-1');
    expect(jobId).toBeTruthy();
    const t0 = 1_700_000_000_000;

    claimNextWikiIngestJob(t0);
    failWikiIngestJob(jobId!, 'WIKI_LLM_API_KEY 未配置', t0);

    const dead = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(dead.status).toBe('dead');
    expect(dead.failCount).toBe(1); // 一次失败即 dead，不烧 5s/10s/20s 三轮
    expect(dead.nextAttemptAt).toBeNull();
    expect(dead.lastError).toContain('WIKI_LLM_API_KEY');
    // 不落 pending：不会在退避时间到后自动重试
    expect(claimNextWikiIngestJob(t0 + 999_999_999)).toBeNull();
  });

  it('G4-3 no-key 人工 retry（仍未配 key）→ 再次直接 dead，不烧一轮退避', () => {
    const jobId = enqueueWikiIngest('iss-test-1');
    expect(jobId).toBeTruthy();
    const t0 = 1_700_000_000_000;

    claimNextWikiIngestJob(t0);
    failWikiIngestJob(jobId!, 'WIKI_LLM_API_KEY 未配置', t0);
    expect(retryWikiIngestJob(jobId!)).toBe(true);

    claimNextWikiIngestJob(t0);
    failWikiIngestJob(jobId!, 'WIKI_LLM_API_KEY 未配置', t0);
    const after = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(after.status).toBe('dead');
    expect(after.failCount).toBe(1);
    expect(after.nextAttemptAt).toBeNull();
  });

  it('G4-3 非 no-key 错误仍走指数退避（不误伤重试语义）', () => {
    const jobId = enqueueWikiIngest('iss-test-1');
    expect(jobId).toBeTruthy();
    const t0 = 1_700_000_000_000;

    claimNextWikiIngestJob(t0);
    failWikiIngestJob(jobId!, 'provider network timeout', t0);
    const after = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(after.status).toBe('pending');
    expect(after.failCount).toBe(1);
    expect(after.nextAttemptAt).toBe(t0 + wikiIngestBackoffMs(1));
  });
});

describe('wiki ingest running lease (Slice 47)', () => {
  let prevLease: string | undefined;

  beforeEach(() => {
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    prevLease = process.env.MA_WIKI_RUNNING_LEASE_MS;
    process.env.MA_WIKI_RUNNING_LEASE_MS = String(60_000); // 1min for tests
  });

  afterEach(() => {
    if (prevLease === undefined) delete process.env.MA_WIKI_RUNNING_LEASE_MS;
    else process.env.MA_WIKI_RUNNING_LEASE_MS = prevLease;
    testState.cleanup?.();
    testState.db = null;
    testState.cleanup = null;
  });

  it('getWikiRunningLeaseMs reads env; default 20min when unset', () => {
    delete process.env.MA_WIKI_RUNNING_LEASE_MS;
    expect(getWikiRunningLeaseMs()).toBe(DEFAULT_WIKI_RUNNING_LEASE_MS);
    process.env.MA_WIKI_RUNNING_LEASE_MS = '0';
    expect(getWikiRunningLeaseMs()).toBe(0);
    process.env.MA_WIKI_RUNNING_LEASE_MS = '900000';
    expect(getWikiRunningLeaseMs()).toBe(900_000);
  });

  it('requeueStaleRunningJobs: clock advance stuck running → pending + failCount + backoff', () => {
    const jobId = enqueueWikiIngest('iss-test-1');
    expect(jobId).toBeTruthy();
    const t0 = 1_700_000_000_000;
    const leaseMs = getWikiRunningLeaseMs();

    testState.db!
      .update(wikiIngestJobs)
      .set({ status: 'running', startedAt: t0, updatedAt: t0, nextAttemptAt: null })
      .where(eq(wikiIngestJobs.id, jobId!))
      .run();

    // still within lease
    expect(requeueStaleRunningJobs(t0 + leaseMs - 1)).toBe(0);
    let row = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(row.status).toBe('running');
    expect(row.failCount).toBe(0);

    // past lease wall
    expect(requeueStaleRunningJobs(t0 + leaseMs)).toBe(1);
    row = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(row.status).toBe('pending');
    expect(row.failCount).toBe(1);
    expect(row.startedAt).toBeNull();
    expect(row.nextAttemptAt).toBe(t0 + leaseMs + wikiIngestBackoffMs(1));
    expect(row.lastError).toMatch(/running lease/i);

    // claim respects backoff
    expect(claimNextWikiIngestJob(t0 + leaseMs + 100)).toBeNull();
    const claimed = claimNextWikiIngestJob(row.nextAttemptAt!);
    expect(claimed?.id).toBe(jobId);
  });

  it('requeueStaleRunningJobs: repeated lease hits reach dead', () => {
    const jobId = enqueueWikiIngest('iss-test-1');
    const t0 = 1_700_000_000_000;
    const leaseMs = 60_000;

    for (let i = 0; i < 3; i++) {
      testState.db!
        .update(wikiIngestJobs)
        .set({
          status: 'running',
          startedAt: t0 + i * leaseMs,
          updatedAt: t0 + i * leaseMs,
          nextAttemptAt: null,
        })
        .where(eq(wikiIngestJobs.id, jobId!))
        .run();
      requeueStaleRunningJobs(t0 + i * leaseMs + leaseMs);
    }

    const dead = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(dead.status).toBe('dead');
    expect(dead.failCount).toBe(3);
    expect(retryWikiIngestJob(jobId!)).toBe(true);
  });

  it('recoverStuckRunningJobs does not bump failCount (startup orphan path)', () => {
    const jobId = enqueueWikiIngest('iss-test-1');
    const t0 = 1_700_000_000_000;
    testState.db!
      .update(wikiIngestJobs)
      .set({ status: 'running', startedAt: t0, updatedAt: t0, failCount: 0 })
      .where(eq(wikiIngestJobs.id, jobId!))
      .run();

    expect(recoverStuckRunningJobs(t0)).toBe(1);
    const row = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(row.status).toBe('pending');
    expect(row.failCount).toBe(0);
    expect(row.nextAttemptAt).toBeNull();
    expect(row.startedAt).toBeNull();
  });

  it('complete/fail after lease requeue are no-ops (no double-kill)', () => {
    const jobId = enqueueWikiIngest('iss-test-1');
    const t0 = 1_700_000_000_000;
    testState.db!
      .update(wikiIngestJobs)
      .set({ status: 'running', startedAt: t0, updatedAt: t0 })
      .where(eq(wikiIngestJobs.id, jobId!))
      .run();

    expect(requeueStaleRunningJobs(t0 + 60_000)).toBe(1);
    const afterLease = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(afterLease.status).toBe('pending');
    expect(afterLease.failCount).toBe(1);

    completeWikiIngestJob(jobId!, t0 + 60_001);
    failWikiIngestJob(jobId!, 'late fail', t0 + 60_002);

    const final = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(final.status).toBe('pending');
    expect(final.failCount).toBe(1);
    expect(final.nextAttemptAt).toBe(afterLease.nextAttemptAt);
  });

  it('lease disabled (0) skips requeue', () => {
    process.env.MA_WIKI_RUNNING_LEASE_MS = '0';
    const jobId = enqueueWikiIngest('iss-test-1');
    const t0 = 1_700_000_000_000;
    testState.db!
      .update(wikiIngestJobs)
      .set({ status: 'running', startedAt: t0, updatedAt: t0 })
      .where(eq(wikiIngestJobs.id, jobId!))
      .run();
    expect(requeueStaleRunningJobs(t0 + 999_999_999)).toBe(0);
    const row = testState.db!
      .select()
      .from(wikiIngestJobs)
      .where(eq(wikiIngestJobs.id, jobId!))
      .get()!;
    expect(row.status).toBe('running');
  });
});
