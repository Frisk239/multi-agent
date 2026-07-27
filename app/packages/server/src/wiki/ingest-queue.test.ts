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
  enqueueWikiIngest,
  failWikiIngestJob,
  retryWikiIngestJob,
  wikiIngestBackoffMs,
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
});
