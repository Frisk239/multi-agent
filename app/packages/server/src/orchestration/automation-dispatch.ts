import { and, eq } from 'drizzle-orm';
import {
  renderAutomationTemplate,
  type AutomationExecutionMode,
  type AutomationRun,
  type AutomationRunSource,
} from '@ma/shared';
import { CronExpressionParser } from 'cron-parser';
import { db } from '../db/client.js';
import { agentRuns, agents, automationRules, automationRuns, squads } from '../db/schema.js';
import { toAgentRun, toObservedAgentRun, toAutomationRun } from '../db/reshape.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { createIssueCore } from './issue-create.js';
import { eventBus } from './event-bus.js';
import { computeAgentReadiness } from './readiness.js';
import { wakeRunWorker } from './run-worker.js';

type RuleRow = typeof automationRules.$inferSelect;

export function automationStatusForEnqueue(
  status: 'queued' | 'skipped' | 'not_applicable' | undefined,
): 'issue_created' | 'pending_dispatch' {
  return status === 'skipped' ? 'pending_dispatch' : 'issue_created';
}

/** Multica autopilot execution_mode; unknown/null → create_issue. */
export function resolveAutomationExecutionMode(
  mode: string | null | undefined,
): AutomationExecutionMode {
  return mode === 'run_only' ? 'run_only' : 'create_issue';
}

/**
 * Pure prompt for run_only (no Issue card). Title + body + automation footer.
 */
export function buildAutomationRunOnlyPrompt(opts: {
  title: string;
  body: string;
  ruleName: string;
  source: string;
  plannedAt: number;
}): string {
  const body = opts.body.trim();
  const head = body ? `${opts.title}\n\n${body}` : opts.title;
  const footer = `\n\n---\n由自动化规则「${opts.ruleName}」run_only 派发（source=${opts.source}, planned_at=${new Date(opts.plannedAt).toISOString()}）`;
  return `${head}${footer}`;
}

function allowNotReadyEnqueue(): boolean {
  const v = process.env.MA_ENQUEUE_ALLOW_NOT_READY;
  return v === '1' || v === 'true';
}

/** @deprecated 请用 @ma/shared renderAutomationTemplate；保留 re-export 兼容 */
export function renderTemplate(
  tpl: string,
  ctx: { plannedAt: number; ruleName: string },
): string {
  return renderAutomationTemplate(tpl, ctx);
}

/** latest_only：interval 对齐当前 grid；daily_at 取今日 HH:mm（本地时区）。 */
export function computeDuePlannedAt(rule: RuleRow, now: number): number | null {
  if (rule.scheduleKind === 'cron') {
    if (!rule.cronExpression) return null;
    try {
      const interval = CronExpressionParser.parse(rule.cronExpression, { currentDate: new Date(now) });
      return interval.prev().getTime();
    } catch {
      return null;
    }
  }

  if (rule.scheduleKind === 'interval_minutes') {
    const n = rule.intervalMinutes;
    if (n == null || n <= 0) return null;
    const grid = n * 60_000;
    return Math.floor(now / grid) * grid;
  }

  if (rule.scheduleKind === 'daily_at') {
    const daily = rule.dailyTime;
    if (!daily || !/^\d{2}:\d{2}$/.test(daily)) return null;
    const [hh, mm] = daily.split(':').map(Number);
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    const planned = d.getTime();
    if (now < planned) return null;
    return planned;
  }

  return null;
}

/**
 * 可读「下次计划」：
 * - disabled → null
 * - interval：当前 grid 的下一拍（strictly after now）
 * - daily_at：今日 HH:mm 若未到，否则明日同刻
 */
export function computeNextPlannedAt(
  rule: {
    enabled: number | boolean;
    scheduleKind: 'interval_minutes' | 'daily_at' | 'cron';
    intervalMinutes: number | null;
    dailyTime: string | null;
    cronExpression?: string | null;
  },
  now: number = Date.now(),
): number | null {
  const on = rule.enabled === true || rule.enabled === 1;
  if (!on) return null;

  if (rule.scheduleKind === 'cron') {
    if (!rule.cronExpression) return null;
    try {
      const interval = CronExpressionParser.parse(rule.cronExpression, { currentDate: new Date(now) });
      return interval.next().getTime();
    } catch {
      return null;
    }
  }

  if (rule.scheduleKind === 'interval_minutes') {
    const n = rule.intervalMinutes;
    if (n == null || n <= 0) return null;
    const grid = n * 60_000;
    return Math.floor(now / grid) * grid + grid;
  }

  if (rule.scheduleKind === 'daily_at') {
    const daily = rule.dailyTime;
    if (!daily || !/^\d{2}:\d{2}$/.test(daily)) return null;
    const [hh, mm] = daily.split(':').map(Number);
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    const today = d.getTime();
    if (now < today) return today;
    d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  return null;
}

function isUniqueConflict(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') return true;
  const msg = e.message ?? '';
  return (
    msg.includes('UNIQUE constraint failed') ||
    msg.includes('uq_automation_run_rule_planned')
  );
}

function loadExistingRun(ruleId: string, plannedAt: number): AutomationRun | null {
  const row = db
    .select()
    .from(automationRuns)
    .where(
      and(eq(automationRuns.ruleId, ruleId), eq(automationRuns.plannedAt, plannedAt)),
    )
    .get();
  return row ? toAutomationRun(row) : null;
}

/**
 * G6-2：派发中断（进程重启等）占位行的超龄阈值 —— 超过即视为孤儿，
 * 诚实升级 failed（不再重发同 plannedAt，同 plannedAt 只发一次的语义保持）。
 */
const DISPATCH_STALE_MS = 60_000;

/**
 * 阶段 1：原子占位（学 multica tryClaim「先占位后 Handler」）。
 * UNIQUE(rule_id, planned_at) 判定赢家：insert 成功 = 赢家（拿回占位行）；
 * unique conflict = 输家（返回 null，调用方直接返回已有行，绝不再执行副作用）。
 */
function insertDispatchPlaceholder(
  ruleId: string,
  plannedAt: number,
  source: AutomationRunSource,
): AutomationRun | null {
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  try {
    db.insert(automationRuns)
      .values({
        id,
        ruleId,
        plannedAt,
        source,
        status: 'dispatching',
        issueId: null,
        linkedRunId: null,
        error: null,
        createdAt,
        updatedAt: createdAt,
      })
      .run();
  } catch (e) {
    if (isUniqueConflict(e)) return null;
    throw e;
  }
  const row = db.select().from(automationRuns).where(eq(automationRuns.id, id)).get()!;
  return toAutomationRun(row);
}

/**
 * 阶段 2 完成：条件 UPDATE（仅 dispatching 占位态可写终态）。
 * 赢家是唯一持有占位行的执行者；写终态即释放占位。
 */
function finishAutomationRun(
  id: string,
  patch: {
    status: 'issue_created' | 'pending_dispatch' | 'failed' | 'skipped';
    issueId?: string | null;
    linkedRunId?: string | null;
    error?: string | null;
  },
): AutomationRun {
  db.update(automationRuns)
    .set({ ...patch, updatedAt: Date.now() })
    .where(and(eq(automationRuns.id, id), eq(automationRuns.status, 'dispatching')))
    .run();
  const row = db.select().from(automationRuns).where(eq(automationRuns.id, id)).get()!;
  return toAutomationRun(row);
}

/**
 * 派发前预检：已有行（含占位）→ 直接返回不干活；
 * 超龄 dispatching（派发中断残留）→ 升级 failed（诚实展示，不静默重发）。
 */
function preflightExistingRun(ruleId: string, plannedAt: number): AutomationRun | null {
  const existing = loadExistingRun(ruleId, plannedAt);
  if (!existing) return null;
  if (existing.status === 'dispatching') {
    const createdAtMs = Date.parse(existing.createdAt);
    if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs > DISPATCH_STALE_MS) {
      return finishAutomationRun(existing.id, {
        status: 'failed',
        error: '派发中断（占位超龄，可能进程重启）',
      });
    }
  }
  return existing;
}

function validateAssignee(rule: RuleRow): string | null {
  if (rule.assigneeType === 'agent') {
    const agent = db.select().from(agents).where(eq(agents.id, rule.assigneeId)).get();
    if (!agent) return `agent 不存在: ${rule.assigneeId}`;
    return null;
  }
  if (rule.assigneeType === 'squad') {
    const squad = db.select().from(squads).where(eq(squads.id, rule.assigneeId)).get();
    if (!squad) return `squad 不存在: ${rule.assigneeId}`;
    const detail = loadSquadDetail(rule.assigneeId);
    if (!detail?.leaderId) return `squad 无 leader: ${rule.assigneeId}`;
    return null;
  }
  return `非法 assigneeType: ${rule.assigneeType}`;
}

async function resolveDispatchAgent(rule: RuleRow): Promise<
  | { ok: true; agentId: string; isLeader: boolean; squadId: string | null }
  | { ok: false; error: string }
> {
  if (rule.assigneeType === 'agent') {
    const agent = db.select().from(agents).where(eq(agents.id, rule.assigneeId)).get();
    if (!agent) return { ok: false, error: `agent 不存在: ${rule.assigneeId}` };
    return { ok: true, agentId: agent.id, isLeader: false, squadId: null };
  }
  if (rule.assigneeType === 'squad') {
    const detail = loadSquadDetail(rule.assigneeId);
    if (!detail) return { ok: false, error: `squad 不存在: ${rule.assigneeId}` };
    if (!detail.leaderId) return { ok: false, error: `squad 无 leader: ${rule.assigneeId}` };
    return {
      ok: true,
      agentId: detail.leaderId,
      isLeader: true,
      squadId: detail.id,
    };
  }
  return { ok: false, error: `非法 assigneeType: ${rule.assigneeType}` };
}

/**
 * Multica run_only: enqueue quick_create agent run without Issue card.
 * Readiness hard-gate aligns with quick-runs (unless MA_ENQUEUE_ALLOW_NOT_READY).
 * G6-2：由赢家（占位行持有者）执行；所有终态经 finishAutomationRun 写占位行。
 */
async function dispatchRunOnly(
  rule: RuleRow,
  plannedAt: number,
  source: AutomationRunSource,
  placeholderId: string,
): Promise<AutomationRun> {
  const resolved = await resolveDispatchAgent(rule);
  if (!resolved.ok) {
    // 规则已过 validateAssignee 准入，此处失败 = 竞态（agent/squad 被删/归档）→ skipped（学 multica errDispatchSkipped）
    return finishAutomationRun(placeholderId, {
      status: 'skipped',
      error: resolved.error,
    });
  }

  const title = renderAutomationTemplate(rule.titleTemplate, {
    plannedAt,
    ruleName: rule.name,
  });
  const bodyBase = renderAutomationTemplate(rule.bodyTemplate ?? '', {
    plannedAt,
    ruleName: rule.name,
  });
  const prompt = buildAutomationRunOnlyPrompt({
    title,
    body: bodyBase,
    ruleName: rule.name,
    source,
    plannedAt,
  });

  if (!allowNotReadyEnqueue()) {
    const rd = await computeAgentReadiness(resolved.agentId);
    if (!rd) {
      return finishAutomationRun(placeholderId, {
        status: 'skipped',
        error: 'agent 不存在',
      });
    }
    if (rd.status === 'cwd_missing' || rd.status === 'runtime_missing' || rd.status === 'error') {
      // G2-2：离线/不可派活 → skipped（瞬态，下次计划照常），不落 failed 死任务
      return finishAutomationRun(placeholderId, {
        status: 'skipped',
        error: `run_only 跳过（agent 离线）：${rd.detail ?? rd.status}`,
      });
    }
  }

  const agent = db.select().from(agents).where(eq(agents.id, resolved.agentId)).get();
  if (!agent) {
    return finishAutomationRun(placeholderId, {
      status: 'skipped',
      error: `agent 不存在: ${resolved.agentId}`,
    });
  }

  const linkedRunId = crypto.randomUUID();
  const createdAt = Date.now();
  db.insert(agentRuns)
    .values({
      id: linkedRunId,
      issueId: null,
      agentId: agent.id,
      runtime: agent.runtime,
      status: 'queued',
      kind: 'quick_create',
      quickPrompt: prompt,
      isLeader: resolved.isLeader ? 1 : 0,
      squadId: resolved.squadId,
      projectId: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      lastHeartbeatAt: null,
      createdAt,
    })
    .run();

  const agentRow = db.select().from(agentRuns).where(eq(agentRuns.id, linkedRunId)).get()!;
  eventBus.publish({ type: 'run:queued', run: toObservedAgentRun(agentRow) });
  wakeRunWorker();

  return finishAutomationRun(placeholderId, {
    // Reuse open status bucket (UI: 已触发); no issueId for run_only.
    status: 'issue_created',
    linkedRunId,
  });
}

/**
 * G6-2 幂等派发：两阶段（学 multica tryClaim「先占位后 Handler」）。
 * 阶段 1 原子占位（UNIQUE(rule_id, planned_at) 判定赢家）→ 阶段 2 仅赢家执行副作用
 * （建卡/enqueue/直派 run）→ finishAutomationRun 写终态。输家/已有行直接返回，绝无重复副作用。
 * 非法 assignee → failed run，不建卡。
 * create_issue：建卡 + enqueue；run_only：无 Issue 直派 quick_create（学 Multica）。
 * B3：enqueue 跳过时 error 字段写明原因（不装作已开工）。
 */
export async function dispatchAutomationRule(
  ruleId: string,
  plannedAt: number,
  source: AutomationRunSource,
): Promise<AutomationRun> {
  const rule = db
    .select()
    .from(automationRules)
    .where(eq(automationRules.id, ruleId))
    .get();
  if (!rule) {
    // 规则不存在：不落 run（无 FK）；由路由层 404
    throw new Error(`automation rule not found: ${ruleId}`);
  }

  // 预检：已有行（含占位）→ 直接返回不干活；超龄占位升级 failed
  const existing = preflightExistingRun(ruleId, plannedAt);
  if (existing) return existing;

  // 阶段 1：原子占位；输家返回赢家行（占位或终态），不再执行任何副作用
  const placeholder = insertDispatchPlaceholder(ruleId, plannedAt, source);
  if (!placeholder) {
    const winner = loadExistingRun(ruleId, plannedAt);
    if (winner) return winner;
    // 理论不可达（冲突行必存在）；防御：直接报错
    throw new Error(`automation dispatch race lost without winner row: ${ruleId}@${plannedAt}`);
  }

  // 占位成功即视为本次 plannedAt 已处理（学 multica：claim 后更新规则指针）
  db.update(automationRules)
    .set({ lastPlannedAt: plannedAt, updatedAt: Date.now() })
    .where(eq(automationRules.id, rule.id))
    .run();

  // 阶段 2：仅赢家执行副作用；任何终态经 finishAutomationRun 写占位行
  try {
    const assigneeErr = validateAssignee(rule);
    if (assigneeErr) {
      return finishAutomationRun(placeholder.id, { status: 'failed', error: assigneeErr });
    }

    const mode = resolveAutomationExecutionMode(
      (rule as { executionMode?: string }).executionMode,
    );
    if (mode === 'run_only') {
      return dispatchRunOnly(rule, plannedAt, source, placeholder.id);
    }

    const title = renderAutomationTemplate(rule.titleTemplate, {
      plannedAt,
      ruleName: rule.name,
    });
    const bodyBase = renderAutomationTemplate(rule.bodyTemplate ?? '', {
      plannedAt,
      ruleName: rule.name,
    });
    const footer = `\n\n---\n由自动化规则「${rule.name}」创建（source=${source}, planned_at=${new Date(plannedAt).toISOString()}）`;
    const description = `${bodyBase}${footer}`;

    let created;
    try {
      created = await createIssueCore({
        title,
        description,
        priority: 'medium',
        assignee: {
          type: rule.assigneeType,
          id: rule.assigneeId,
        },
        originType: 'automation',
        originRuleId: rule.id,
        enqueue: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return finishAutomationRun(placeholder.id, {
        status: 'failed',
        error: `create issue failed: ${msg}`,
      });
    }

    if (!created.ok) {
      return finishAutomationRun(placeholder.id, {
        status: 'failed',
        error: created.error || 'create issue failed',
      });
    }

    // 建卡成功不等于执行成功：待派发/已排队均保持非终态。
    let enqueueNote: string | null = null;
    const enq = created.enqueue;
    if (enq?.status === 'skipped') {
      enqueueNote = `Issue 已建，但未开工：${enq.detail ?? enq.reason ?? '派发被跳过'}`;
      console.warn('[automation-dispatch] enqueue skipped', {
        ruleId,
        issueId: created.issue.id,
        reason: enq.reason,
        detail: enq.detail,
      });
    } else if (enq?.status === 'queued' && enq.runId) {
      enqueueNote = null;
    }

    return finishAutomationRun(placeholder.id, {
      status: automationStatusForEnqueue(enq?.status),
      issueId: created.issue.id,
      linkedRunId: enq?.runId ?? null,
      error: enqueueNote,
    });
  } catch (e) {
    // 兜底：未预期异常 → 占位不残留（诚实 failed），再上抛给调用方（worker 有 catch）
    const msg = e instanceof Error ? e.message : String(e);
    try {
      finishAutomationRun(placeholder.id, { status: 'failed', error: `dispatch aborted: ${msg}` });
    } catch {
      /* 写失败不掩盖原始异常 */
    }
    throw e;
  }
}
