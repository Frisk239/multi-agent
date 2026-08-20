import { and, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
  autoRetryBackoffMs,
  autoRetryMaxAttempts,
  isAutoRetryableFailureReason,
  type AgentRun,
  type AgentRunFailureReason,
} from '@ma/shared';
import { db } from '../db/client.js';
import { agentRuns, agents, issues, squads } from '../db/schema.js';
import * as schema from '../db/schema.js';
import { toAgentRun, toObservedAgentRun } from '../db/reshape.js';
import { eventBus } from './event-bus.js';
import { recordActivityLog } from './activity-logger.js';
import { notifyRunEscalated } from './inbox-writer.js';

type RunRow = typeof agentRuns.$inferSelect;
/** db 或事务的统一执行句柄（生产 db / 事务内 tx 均满足；只暴露用到的三个方法） */
type RetryExecutor = Pick<BetterSQLite3Database<typeof schema>, 'select' | 'update' | 'insert'>;

type RetryOutcome = {
  row: RunRow;
  delayMs: number;
};

/**
 * P2-4：显式 fallback 改派结果。仅在 runtime 连接不上 + auto-retry 预算
 * 用尽时产生；child 是新 agent 的全新 queued run（attempt 归 1）。
 */
type EscalationOutcome = RetryOutcome & {
  fallbackAgentId: string;
  fallbackAgentName: string;
};

/**
 * P2-4（触发面修正）：连接不上类失败判定。
 *
 * 用户场景是「本地运行时连接不上」，客观形态有两类，全部属于本函数触发面：
 * 1. `runtime_offline`（classifyFailure 规则表已认；走 auto-retry 预算，用尽才改派）
 * 2. `exec_error` + 连接不上文本：
 *    - 本仓 backend 自写文本「XX CLI 未安装」（opencode.ts / claude-code.ts /
 *      cursor.ts 的 detect 失败分支）
 *    - spawn 失败 `Error: spawn <cmd> ENOENT`（spawn-line.ts child.on('error')）
 *   这两类不进 auto-retry（attempt 恒 1），首次失败即改派——CLI 不存在重试
 *   无意义，改派后 fallback 的 runtime 可能可用。
 *
 * 刻意不认：`exit 1`（CLI 跑起来了但报错）、timeout、stale_heartbeat 等——
 * 那些不是「连接不上」，维持 auto-retry / 人工可行动。
 */
export function isConnectionFailure(
  reason: AgentRunFailureReason | string | null | undefined,
  error: string | null | undefined,
): boolean {
  if (reason === 'runtime_offline') return true;
  const e = (error ?? '').trim();
  if (!e) return false;
  // 本仓 backend 自写文本：「opencode CLI 未安装」等（CLI 探测失败）
  if (/CLI\s*未安装|未安装/.test(e)) return true;
  // spawn 启动失败：`Error: spawn opencode ENOENT`（Windows 上 spawn 一个
  // 不存在/非可执行的 bin 即此形态）
  if (/spawn\s+[\w.-]+\s+ENOENT/i.test(e)) return true;
  return false;
}

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

  const issue = executor
    .select({ originType: issues.originType })
    .from(issues)
    .where(eq(issues.id, source.issueId))
    .get();
  // Automation-linked issues use the same bounded infrastructure policy. The
  // execution-truth synchronizer keeps the automation row retrying until the
  // lineage reaches a terminal child.
  if (!issue) return null;

  // Retry children are a direct INSERT, not a normal enqueue call. Honor the
  // same archive lifecycle gate here so an Agent retired while its source was
  // failing cannot receive a delayed queued retry (even under env readiness
  // bypasses elsewhere).
  // Squad history is retained after retirement, but retrying it must not copy
  // the old squad_id/briefing. Resolve the former leader and emit a normal
  // Agent run instead (also covers a historical member-run).
  let targetAgentId = source.agentId;
  let nextIsLeader = source.isLeader;
  let nextSquadId = source.squadId;
  if (source.squadId) {
    const historicalSquad = executor
      .select()
      .from(squads)
      .where(eq(squads.id, source.squadId))
      .get();
    if (!historicalSquad?.leaderId) return null;
    targetAgentId = historicalSquad.leaderId;
    nextIsLeader = 0;
    nextSquadId = null;
  }

  const sourceAgent = executor
    .select()
    .from(agents)
    .where(eq(agents.id, targetAgentId))
    .get();
  if (!sourceAgent || sourceAgent.archivedAt != null) return null;

  const configuredMax = Math.max(1, Number(source.maxAttempts ?? 2));
  const maxAttempts = autoRetryMaxAttempts(reason, configuredMax);
  const attempt = Math.max(1, Number(source.attempt ?? 1));
  if (attempt >= maxAttempts) return null;

  // 防重：JS 预检 + 部分唯一索引（uq_agent_run_auto_retry_of，NULL 可重复
  // 即等效 partial unique）兜底并发赢家；源 run 已终态不可变，预检与
  // 原条件 INSERT 谓词等价。SQLite 的 Drizzle insert 无 .select()，
  // 故 child 用类型化 values 直插。
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
    const inserted = executor
      .insert(agentRuns)
      .values({
        id: childId,
        issueId: source.issueId,
        agentId: sourceAgent.id,
        runtime: sourceAgent.runtime,
        status: 'queued',
        kind: source.kind,
        priority: source.priority, // G6-1：重试继承父 run 优先级快照，不因重试掉队
        quickPrompt: source.quickPrompt,
        chatThreadId: source.chatThreadId,
        isLeader: nextIsLeader,
        squadId: nextSquadId,
        rerunOfRunId: source.id,
        cwdPath: source.cwdPath,
        cwdMode: source.cwdMode,
        projectId: source.projectId,
        sessionPoisoned: source.sessionPoisoned,
        parentRunId: source.parentRunId,
        attempt: attempt + 1,
        maxAttempts,
        nextAttemptAt,
        autoRetryOfRunId: source.id,
        createdAt: now,
      })
      .run();
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

/**
 * P2-4：连接不上类的 Issue run 自动改派给源 agent 显式配置的 fallback agent。
 *
 * 触发面（触发面窄 #4 修正版）：`isConnectionFailure` 判定——`runtime_offline`
 * （auto-retry 预算用尽后）或 `exec_error` + 连接不上文本（CLI 未安装 / spawn
 * ENOENT，首次失败即改派，不进 auto-retry）。timeout / stale_heartbeat /
 * exit 1 等「慢/卡/CLI 跑了但报错」类维持 auto-retry + 可观测，不改派。
 *
 * attempt 分流：`runtime_offline` 必须预算用尽（attempt >= maxAttempts，它走
 * auto-retry，预算内先重试）；CLI 未安装 / ENOENT 分支不 gate attempt（这类
 * 不进 auto-retry，第一次失败即改派——CLI 不存在重试无意义，fallback 的
 * runtime 可能可用）。
 *
 * 深度 1 防循环（#5）：source.escalatedFromRunId 非空 → 不再改派（fallback
 * 失败走正常 failRun，不递归）。
 *
 * 幂等：与 auto-retry 同款 NOT EXISTS + 部分唯一索引（uq_agent_run_escalated_from）
 * 双保险，重复调用无副作用。错误文本正则只放应用层（SQL 里做文本正则不划算）；
 * SQL 用 failure_reason IN ('runtime_offline','exec_error') 做双保险
 * （CLI 未安装 / ENOENT 按 classifyFailure 规则表归 exec_error）。
 */
/** G2-1：fireDeferredRuns 复用改派守卫（深度 1 + 幂等；deferred_escalated 路径） */
export function insertEscalatedChild(
  executor: RetryExecutor,
  source: RunRow,
  now: number,
  opts: { allowDeferred?: boolean } = {},
): EscalationOutcome | null {
  const allowDeferred = opts.allowDeferred === true;
  // 深度 1：改派而来的 run 不再链式改派
  if (source.escalatedFromRunId) return null;
  if (source.status !== 'failed') return null;
  if (source.kind !== 'issue' || !source.issueId) return null;
  const reason = source.failureReason as AgentRunFailureReason | null;
  // 常规：仅 connection failure；G2-1 升级路径：deferred_escalated
  if (!isConnectionFailure(reason, source.error) && !(allowDeferred && reason === 'deferred_escalated'))
    return null;

  const configuredMax = Math.max(1, Number(source.maxAttempts ?? 2));
  // 预算分流：runtime_offline 必须预算用尽（insertRetryChild 返回 null 的
  // attempt >= maxAttempts 路径）；CLI 未安装 / ENOENT（exec_error，不进
  // auto-retry）不 gate attempt——第一次失败即改派。
  let gateAttempt = 1;
  if (reason === 'runtime_offline') {
    const maxAttempts = autoRetryMaxAttempts(reason, configuredMax);
    const attempt = Math.max(1, Number(source.attempt ?? 1));
    if (attempt < maxAttempts) return null;
    gateAttempt = maxAttempts;
  }

  // 源 agent 显式配置 fallback；fallback 存在且未归档
  const sourceAgent = executor
    .select()
    .from(agents)
    .where(eq(agents.id, source.agentId))
    .get();
  // The fallback itself already has an archive guard below. Also stop this
  // direct escalation when the source Agent was archived: retirement means no
  // future work should be emitted from its retry lineage either.
  if (!sourceAgent || sourceAgent.archivedAt != null) return null;
  const fallbackId = sourceAgent.fallbackAgentId;
  if (!fallbackId || fallbackId === source.agentId) return null;
  const fallback = executor
    .select()
    .from(agents)
    .where(eq(agents.id, fallbackId))
    .get();
  if (!fallback || fallback.archivedAt != null) return null;

  // 幂等守卫：已有改派子 run 则不再建
  const existing = executor
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.escalatedFromRunId, source.id))
    .get();
  if (existing) return null;

  const childId = crypto.randomUUID();
  const freshMaxAttempts = autoRetryMaxAttempts('runtime_offline', configuredMax);

  // 同款防重：JS 预检 + 唯一索引（uq_agent_run_escalated_from）兜底并发赢家。
  // attempt 门在 insertRetryChild 预算分流后已由 gateAttempt 表达；失败分支
  // （deferred_escalated / connection failure）谓词在 isConnectionFailure 分流。
  const reasonGate = allowDeferred
    ? eq(agentRuns.failureReason, 'deferred_escalated')
    : inArray(agentRuns.failureReason, ['runtime_offline', 'exec_error']);

  // 仅当源 run 仍满足 reason 谓词时插入（deferred 升级放宽 + 常规 connection
  // failure 双轨）；预检以 source 行 + SQL 谓词双保险。
  const gate = executor
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.id, source.id), reasonGate))
    .get();
  if (!gate) return null;

  try {
    const inserted = executor
      .insert(agentRuns)
      .values({
        id: childId,
        issueId: source.issueId,
        agentId: fallback.id,
        runtime: fallback.runtime,
        status: 'queued',
        kind: source.kind,
        priority: source.priority, // G6-1：改派 child 同样继承优先级快照
        quickPrompt: source.quickPrompt,
        chatThreadId: source.chatThreadId,
        isLeader: 0,
        squadId: null,
        cwdPath: source.cwdPath,
        cwdMode: source.cwdMode,
        projectId: source.projectId,
        sessionPoisoned: source.sessionPoisoned,
        parentRunId: source.parentRunId,
        attempt: 1,
        maxAttempts: freshMaxAttempts,
        escalatedFromRunId: source.id,
        createdAt: now,
      })
      .run();
    if ((inserted.changes ?? 0) === 0) return null;
  } catch {
    // 并发赢家：部分唯一索引兜底，重复调用视为幂等 no-op
    const winner = executor
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.escalatedFromRunId, source.id))
      .get();
    if (!winner) return null;
    return {
      row: winner,
      delayMs: 0,
      fallbackAgentId: fallback.id,
      fallbackAgentName: fallback.name,
    };
  }

  // 源 run error 注明「已自动改派给 <fallback name>」（与 child 同一事务/顺序内，
  // 保持 failRun 幂等：child 插入失败则不注明）
  const annotated = source.error
    ? `${source.error}\n[已自动改派给 ${fallback.name}]`
    : `[已自动改派给 ${fallback.name}]`;
  try {
    executor
      .update(agentRuns)
      .set({ error: annotated })
      .where(eq(agentRuns.id, source.id))
      .run();
  } catch {
    /* 注解写失败不阻塞改派（child 已在事务内落库） */
  }

  const row = executor.select().from(agentRuns).where(eq(agentRuns.id, childId)).get();
  return row
    ? { row, delayMs: 0, fallbackAgentId: fallback.id, fallbackAgentName: fallback.name }
    : null;
}

function publishScheduledRetry(source: RunRow, outcome: RetryOutcome): AgentRun {
  const child = toObservedAgentRun(outcome.row);
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

/** P2-4：改派落地后的可见性（run:queued + activity run_escalated + inbox）。 */
function publishEscalation(source: RunRow, outcome: EscalationOutcome): AgentRun {
  const child = toObservedAgentRun(outcome.row);
  eventBus.publish({ type: 'run:queued', run: child });
  recordActivityLog({
    issueId: source.issueId!,
    actorType: 'system',
    actorName: '系统',
    eventType: 'run_escalated',
    payload: {
      fromRunId: source.id,
      toRunId: child.id,
      fromAgentId: source.agentId,
      toAgentId: outcome.fallbackAgentId,
      toAgentName: outcome.fallbackAgentName,
      failureReason: source.failureReason,
    },
  });
  notifyRunEscalated(toAgentRun(source), {
    toRunId: child.id,
    toAgentId: outcome.fallbackAgentId,
    toAgentName: outcome.fallbackAgentName,
  });
  return child;
}

/** P2-4：连接不上类失败（runtime_offline 预算用尽 / CLI 未安装 / spawn ENOENT）的
 * fallback 改派（db 插入 + 可见性发布）。 */
export function scheduleEscalationForFailedRun(
  source: RunRow,
  now = Date.now(),
): AgentRun | null {
  const outcome = insertEscalatedChild(db, source, now);
  return outcome ? publishEscalation(source, outcome) : null;
}

/**
 * Create at most one automatic retry child for a failed Issue Run. The source
 * transition is expected to have already committed; use
 * transitionAndScheduleAutoRetry for a fail+child atomic transition.
 * P2-4：预算用尽且命中连接不上类（runtime_offline / CLI 未安装 / spawn ENOENT）
 * + 显式 fallback 时，返回改派子 run。
 */
export function scheduleAutoRetryForFailedRun(
  source: RunRow,
  now = Date.now(),
): AgentRun | null {
  const outcome = insertRetryChild(db, source, now);
  if (outcome) return publishScheduledRetry(source, outcome);
  return scheduleEscalationForFailedRun(source, now);
}

export type TransitionAndRetryResult = {
  applied: boolean;
  row?: RunRow;
  autoRetryChild?: AgentRun | null;
  /** P2-4：连接不上类的显式 fallback 改派子 run（无则 null） */
  escalatedChild?: AgentRun | null;
};

/**
 * Atomically transition an active run to a failure state and create its
 * bounded auto-retry child. Side effects (WS/activity) happen only after the
 * SQLite transaction commits. P2-4：auto-retry 无果（预算用尽，或 exec_error
 * 连接不上类根本不进 auto-retry）时，同一事务内尝试显式 fallback 改派子 run
 * （escalatedChild）。
 */
export function transitionAndScheduleAutoRetry(args: {
  id: string;
  fromStatuses: readonly RunRow['status'][];
  patch: Partial<RunRow>;
  now?: number;
}): TransitionAndRetryResult {
  const now = args.now ?? Date.now();
  // stale-runs.test.ts 等单元测试提供无 transaction 的 db double：
  // 运行时能力检测走非事务路径（生产 db 恒有 transaction，走下方原子分支）。
  if (typeof db.transaction !== 'function') {
    const changed = db
      .update(agentRuns)
      .set(args.patch)
      .where(
        and(
          eq(agentRuns.id, args.id),
          inArray(agentRuns.status, [...args.fromStatuses]),
        ),
      )
      .run();
    if ((changed.changes ?? 0) === 0) return { applied: false };
    const row = db.select().from(agentRuns).where(eq(agentRuns.id, args.id)).get();
    if (!row) return { applied: false };
    const retry = insertRetryChild(db, row, now);
    const escalation = retry ? null : insertEscalatedChild(db, row, now);
    const retryChild = retry ? publishScheduledRetry(row, retry) : null;
    const escChild = escalation ? publishEscalation(row, escalation) : null;
    return {
      applied: true,
      row,
      autoRetryChild: retryChild,
      escalatedChild: escChild,
    };
  }
  const result = db.transaction((tx) => {
    const changed = tx
      .update(agentRuns)
      .set(args.patch)
      .where(
        and(
          eq(agentRuns.id, args.id),
          inArray(agentRuns.status, [...args.fromStatuses]),
        ),
      )
      .run();
    if ((changed.changes ?? 0) === 0) return null;
    const row = tx.select().from(agentRuns).where(eq(agentRuns.id, args.id)).get();
    if (!row) return null;
    const retry = insertRetryChild(tx, row, now);
    const escalation = retry ? null : insertEscalatedChild(tx, row, now);
    return { row, retry, escalation };
  });
  if (!result) return { applied: false };
  const retryChild = result.retry ? publishScheduledRetry(result.row, result.retry) : null;
  const escChild = result.escalation
    ? publishEscalation(result.row, result.escalation)
    : null;
  return {
    applied: true,
    row: result.row,
    autoRetryChild: retryChild,
    escalatedChild: escChild,
  };
}

/** Whether an Issue Run currently has an active auto-retry child. */
export function hasActiveAutoRetryChild(runId: string): boolean {
  // 列存在性守卫：真 schema 恒存在；部分单元测试的 schema double 缺该列时
  // 视为无活跃 child（避免对 double 执行查询误判）
  if (!agentRuns.autoRetryOfRunId) return false;
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
