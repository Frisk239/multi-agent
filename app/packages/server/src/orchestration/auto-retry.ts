import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  autoRetryBackoffMs,
  autoRetryMaxAttempts,
  isAutoRetryableFailureReason,
  type AgentRun,
  type AgentRunFailureReason,
} from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns } from '../db/schema.js';
import * as schema from '../db/schema.js';
import { toAgentRun } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { recordActivityLog } from './activity-logger.js';

type RunRow = typeof agentRuns.$inferSelect;
type RetryExecutor = any;

type RetryOutcome = {
  row: RunRow;
  delayMs: number;
};

function insertRetryChild(
  executor: RetryExecutor,
  source: RunRow,
  now: number,
): RetryOutcome | null {
  if (source.status !== 'failed' && source.status !== 'timed_out') return null;
  if (source.kind !== 'issue' || !source.issueId) return null;
  // Minimal stale-run unit doubles predate the Issue table export; no retry
  // decision can be made safely without checking the linked Issue.
  const reason = source.failureReason as AgentRunFailureReason | null;
  if (!isAutoRetryableFailureReason(reason)) return null;

  const issueTable = (schema as {
    issues?: { id?: unknown; originType?: unknown };
  }).issues as any;
  if (!issueTable?.originType || !issueTable.id) return null;

  const issue = executor
    .select({ originType: issueTable.originType })
    .from(issueTable)
    .where(eq(issueTable.id, source.issueId))
    .get();
  // Automation-linked issues use the same bounded infrastructure policy. The
  // execution-truth synchronizer keeps the automation row retrying until the
  // lineage reaches a terminal child.
  if (!issue) return null;

  const configuredMax = Math.max(1, Number(source.maxAttempts ?? 2));
  const maxAttempts = autoRetryMaxAttempts(reason, configuredMax);
  const attempt = Math.max(1, Number(source.attempt ?? 1));
  if (attempt >= maxAttempts) return null;

  // Fast path; the NOT EXISTS predicate and partial unique index below are
  // the durable guards against duplicate children.
  const existing = executor
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.autoRetryOfRunId, source.id))
    .get();
  if (existing) return null;

  const delayMs = autoRetryBackoffMs(attempt);
  const nextAttemptAt = delayMs > 0 ? now + delayMs : null;
  const childId = crypto.randomUUID();

  try {
    const inserted = executor.run(sql`
      INSERT INTO agent_run (
        id, issue_id, agent_id, runtime, status, kind, quick_prompt,
        chat_thread_id, is_leader, squad_id, error, failure_reason,
        started_at, finished_at, last_heartbeat_at, waiting_local_entered_at,
        prepare_lease_expires_at, rerun_of_run_id, cwd_path, cwd_mode,
        project_id, session_poisoned, parent_run_id, attempt, max_attempts,
        next_attempt_at, auto_retry_of_run_id, created_at
      )
      SELECT
        ${childId}, p.issue_id, p.agent_id, p.runtime, 'queued', p.kind,
        p.quick_prompt, p.chat_thread_id, p.is_leader, p.squad_id, NULL, NULL,
        NULL, NULL, NULL, NULL, NULL, p.id, p.cwd_path, p.cwd_mode,
        p.project_id, 0, p.parent_run_id, ${attempt + 1}, ${maxAttempts},
        ${nextAttemptAt}, p.id, ${now}
      FROM agent_run AS p
      WHERE p.id = ${source.id}
        AND p.status IN ('failed', 'timed_out')
        AND p.kind = 'issue'
        AND p.issue_id IS NOT NULL
        AND p.failure_reason = ${reason}
        AND p.attempt < ${maxAttempts}
        AND NOT EXISTS (
          SELECT 1 FROM agent_run AS c
          WHERE c.auto_retry_of_run_id = p.id
        )
    `);
    if ((inserted.changes ?? 0) === 0) return null;
  } catch {
    // A concurrent invocation may have won the partial unique index. Treat it
    // as an idempotent no-op and return the winner when it is visible.
    const winner = executor
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.autoRetryOfRunId, source.id))
      .get();
    return winner ? { row: winner, delayMs: 0 } : null;
  }

  const row = executor.select().from(agentRuns).where(eq(agentRuns.id, childId)).get();
  return row ? { row, delayMs } : null;
}

function publishScheduledRetry(source: RunRow, outcome: RetryOutcome): AgentRun {
  const child = toAgentRun(outcome.row);
  eventBus.publish({ type: 'run:queued', run: child });
  recordActivityLog({
    issueId: source.issueId!,
    eventType: 'run_auto_retry_scheduled',
    payload: {
      runId: source.id,
      childRunId: child.id,
      failureReason: source.failureReason,
      attempt: child.attempt,
      maxAttempts: child.maxAttempts,
      nextAttemptAt: child.nextAttemptAt,
      delayMs: outcome.delayMs,
    },
  });
  return child;
}

/**
 * Create at most one automatic retry child for a failed Issue Run. The source
 * transition is expected to have already committed; use
 * transitionAndScheduleAutoRetry for a fail+child atomic transition.
 */
export function scheduleAutoRetryForFailedRun(
  source: RunRow,
  now = Date.now(),
): AgentRun | null {
  const outcome = insertRetryChild(db, source, now);
  return outcome ? publishScheduledRetry(source, outcome) : null;
}

export type TransitionAndRetryResult = {
  applied: boolean;
  row?: RunRow;
  autoRetryChild?: AgentRun | null;
};

/**
 * Atomically transition an active run to a failure state and create its
 * bounded auto-retry child. Side effects (WS/activity) happen only after the
 * SQLite transaction commits.
 */
export function transitionAndScheduleAutoRetry(args: {
  id: string;
  fromStatuses: readonly string[];
  patch: Record<string, unknown>;
  now?: number;
}): TransitionAndRetryResult {
  const now = args.now ?? Date.now();
  // A few isolated unit tests provide a minimal DB double without Drizzle's
  // transaction method. Preserve their transition semantics while production
  // always takes the atomic branch below.
  if (typeof (db as { transaction?: unknown }).transaction !== 'function') {
    const changed = db
      .update(agentRuns)
      .set(args.patch as Partial<RunRow>)
      .where(
        and(
          eq(agentRuns.id, args.id),
          inArray(agentRuns.status, [...args.fromStatuses] as RunRow['status'][]),
        ),
      )
      .run();
    if ((changed.changes ?? 0) === 0) return { applied: false };
    const row = db.select().from(agentRuns).where(eq(agentRuns.id, args.id)).get();
    if (!row) return { applied: false };
    const retry = insertRetryChild(db, row, now);
    const child = retry ? publishScheduledRetry(row, retry) : null;
    return { applied: true, row, autoRetryChild: child };
  }
  const result = db.transaction((tx) => {
    const changed = tx
      .update(agentRuns)
      .set(args.patch as Partial<RunRow>)
      .where(
        and(
          eq(agentRuns.id, args.id),
          inArray(agentRuns.status, [...args.fromStatuses] as RunRow['status'][]),
        ),
      )
      .run();
    if ((changed.changes ?? 0) === 0) return null;
    const row = tx.select().from(agentRuns).where(eq(agentRuns.id, args.id)).get();
    if (!row) return null;
    const retry = insertRetryChild(tx, row, now);
    return { row, retry };
  });
  if (!result) return { applied: false };
  const child = result.retry ? publishScheduledRetry(result.row, result.retry) : null;
  return { applied: true, row: result.row, autoRetryChild: child };
}

/** Whether an Issue Run currently has an active auto-retry child. */
export function hasActiveAutoRetryChild(runId: string): boolean {
  if (!(agentRuns as { autoRetryOfRunId?: unknown }).autoRetryOfRunId) return false;
  return Boolean(
    db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.autoRetryOfRunId, runId),
          inArray(agentRuns.status, ['queued', 'waiting_local_directory', 'running']),
        ),
      )
      .get(),
  );
}
