import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { AgentRun } from '@ma/shared';
import { db } from '../db/client.js';
import {
  agentRuns,
  automationRules,
  automationRuns,
  issues,
} from '../db/schema.js';
import { toAutomationRun } from '../db/reshape.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { eventBus } from './event-bus.js';
import { enqueueAgentRun, enqueueLeaderRun } from './run-service.js';

const OPEN_AUTOMATION_STATUSES = [
  'issue_created',
  'pending_dispatch',
  'running',
  'retrying',
] as const;
const ACTIVE_RETRY_STATUSES = ['queued', 'waiting_local_directory', 'running'] as const;

function publishAutomationRun(row: typeof automationRuns.$inferSelect): void {
  eventBus.publish({
    type: 'automation:updated',
    automationRun: toAutomationRun(row),
  });
}

/**
 * Locate open automation run for an agent run.
 * create_issue: match issueId; run_only: match linkedRunId (or auto-retry parent id).
 */
export function findOpenAutomationForAgentRun(run: AgentRun): typeof automationRuns.$inferSelect | null {
  if (run.issueId) {
    const byIssue = db
      .select()
      .from(automationRuns)
      .where(
        and(
          eq(automationRuns.issueId, run.issueId),
          inArray(automationRuns.status, [...OPEN_AUTOMATION_STATUSES]),
        ),
      )
      .get();
    if (byIssue) return byIssue;
  }

  const linkIds = [run.id];
  if (run.autoRetryOfRunId) linkIds.push(run.autoRetryOfRunId);
  for (const id of linkIds) {
    const byLink = db
      .select()
      .from(automationRuns)
      .where(
        and(
          eq(automationRuns.linkedRunId, id),
          inArray(automationRuns.status, [...OPEN_AUTOMATION_STATUSES]),
        ),
      )
      .get();
    if (byLink) return byLink;
  }
  return null;
}

/**
 * 将 linked agent run 的真实状态同步到 automation run。
 * 条件 UPDATE 保证迟到/重复事件不能覆盖 terminal。
 * Supports create_issue (issueId) and Multica-style run_only (linkedRunId only).
 */
export function syncAutomationRunFromAgentRun(run: AgentRun): void {
  const automation = findOpenAutomationForAgentRun(run);
  if (!automation) return;

  const activeRetryChild =
    !run.autoRetryOfRunId
      ? run.issueId
        ? db
            .select({ id: agentRuns.id })
            .from(agentRuns)
            .where(
              and(
                eq(agentRuns.issueId, run.issueId),
                isNotNull(agentRuns.autoRetryOfRunId),
                inArray(agentRuns.status, [...ACTIVE_RETRY_STATUSES]),
              ),
            )
            .get()
        : db
            .select({ id: agentRuns.id })
            .from(agentRuns)
            .where(
              and(
                eq(agentRuns.autoRetryOfRunId, run.id),
                inArray(agentRuns.status, [...ACTIVE_RETRY_STATUSES]),
              ),
            )
            .get()
      : null;
  const retrying =
    run.autoRetryStatus === 'scheduled' ||
    Boolean(activeRetryChild) ||
    (Boolean(run.autoRetryOfRunId) &&
      (run.status === 'queued' ||
        run.status === 'waiting_local_directory' ||
        run.status === 'running'));
  const next =
    retrying
      ? 'retrying'
      : run.status === 'completed'
        ? 'success'
        : run.status === 'failed' ||
            run.status === 'timed_out' ||
            run.status === 'cancelled'
          ? 'failed'
          : run.status === 'running' || run.status === 'waiting_local_directory'
            ? 'running'
            : 'issue_created';
  const linkedRunId =
    next === 'retrying'
      ? run.autoRetryChildId ?? activeRetryChild?.id ?? run.id
      : run.id;
  const error =
    next === 'failed'
      ? run.error ?? run.failureReason ?? `linked run ${run.status}`
      : next === 'retrying'
        ? `自动重试中${run.autoRetryNextAttemptAt ? `，下次 ${run.autoRetryNextAttemptAt}` : ''}`
        : null;

  const changed = db
    .update(automationRuns)
    .set({
      status: next,
      linkedRunId,
      error,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(automationRuns.id, automation.id),
        inArray(automationRuns.status, [...OPEN_AUTOMATION_STATUSES]),
      ),
    )
    .returning()
    .get();
  if (changed) publishAutomationRun(changed);
}

export type ReconcileAutomationRunResult =
  | { ok: true; run: ReturnType<typeof toAutomationRun>; created: boolean }
  | { ok: false; status: 404 | 409; error: string };

/** 操作员恢复 pending dispatch；重复调用只绑定同一 active run。 */
export async function reconcileAutomationRun(
  automationRunId: string,
): Promise<ReconcileAutomationRunResult> {
  const automation = db
    .select()
    .from(automationRuns)
    .where(eq(automationRuns.id, automationRunId))
    .get();
  if (!automation) return { ok: false, status: 404, error: 'automation run 不存在' };
  const rule = db
    .select({ id: automationRules.id, archivedAt: automationRules.archivedAt })
    .from(automationRules)
    .where(eq(automationRules.id, automation.ruleId))
    .get();
  if (!rule) return { ok: false, status: 404, error: 'automation rule 不存在' };
  if (rule.archivedAt != null) {
    return { ok: false, status: 409, error: 'automation rule 已归档，不能重新派发' };
  }
  if (!automation.issueId) {
    return { ok: false, status: 409, error: 'automation run 没有 linked Issue' };
  }
  if (automation.status !== 'pending_dispatch') {
    return { ok: false, status: 409, error: `automation run 已是终态 ${automation.status}` };
  }

  // DB 行即锁：pending_dispatch → issue_created 是 reconcile claim。
  // claim 在任何 await 之前完成，因此并发请求只有一个能进入 enqueue。
  const claimed = db
    .update(automationRuns)
    .set({ status: 'issue_created', error: null, updatedAt: Date.now() })
    .where(
      and(
        eq(automationRuns.id, automation.id),
        eq(automationRuns.status, 'pending_dispatch'),
      ),
    )
    .returning()
    .get();
  if (!claimed) {
    const current = db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.id, automation.id))
      .get();
    if (!current) return { ok: false, status: 404, error: 'automation run 不存在' };
    return { ok: true, run: toAutomationRun(current), created: false };
  }

  const issue = db.select().from(issues).where(eq(issues.id, automation.issueId)).get();
  if (!issue) {
    db.update(automationRuns)
      .set({
        status: 'pending_dispatch',
        error: 'linked Issue 不存在',
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(automationRuns.id, automation.id),
          eq(automationRuns.status, 'issue_created'),
        ),
      )
      .run();
    return { ok: false, status: 404, error: 'linked Issue 不存在' };
  }

  const existing = db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.issueId, issue.id),
        inArray(agentRuns.status, [
          'queued',
          'running',
          'waiting_local_directory',
        ]),
      ),
    )
    .get();

  let linked = existing;
  let detail: string | null = null;
  try {
    if (!linked) {
      const result =
        issue.assigneeType === 'agent' && issue.assigneeId
          ? await enqueueAgentRun(issue.id, issue.assigneeId)
          : issue.assigneeType === 'squad' && issue.assigneeId
            ? await (async () => {
                const squad = loadSquadDetail(issue.assigneeId!);
                if (!squad?.leaderId) return null;
                return enqueueLeaderRun(issue.id, squad.leaderId, squad.id);
              })()
            : null;
      linked = result?.run
        ? db.select().from(agentRuns).where(eq(agentRuns.id, result.run.id)).get()
        : undefined;
      detail = result?.detail ?? result?.reason ?? '当前仍无法派发';
    }
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }

  const changed = db
    .update(automationRuns)
    .set({
      status: linked ? 'issue_created' : 'pending_dispatch',
      linkedRunId: linked?.id ?? automation.linkedRunId,
      error: linked ? null : detail,
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(automationRuns.id, automation.id),
        eq(automationRuns.status, 'issue_created'),
      ),
    )
    .returning()
    .get();

  const current =
    changed ??
    db.select().from(automationRuns).where(eq(automationRuns.id, automation.id)).get()!;
  if (changed) publishAutomationRun(changed);
  return { ok: true, run: toAutomationRun(current), created: !existing && Boolean(linked) };
}
