import { and, eq } from 'drizzle-orm';
import {
  renderAutomationTemplate,
  type AutomationRun,
  type AutomationRunSource,
} from '@ma/shared';
import { db } from '../db/client.js';
import { agents, automationRules, automationRuns, squads } from '../db/schema.js';
import { toAutomationRun } from '../db/reshape.js';
import { loadSquadDetail } from '../db/squad-loader.js';
import { createIssueCore } from './issue-create.js';

type RuleRow = typeof automationRules.$inferSelect;

/** @deprecated 请用 @ma/shared renderAutomationTemplate；保留 re-export 兼容 */
export function renderTemplate(
  tpl: string,
  ctx: { plannedAt: number; ruleName: string },
): string {
  return renderAutomationTemplate(tpl, ctx);
}

/** latest_only：interval 对齐当前 grid；daily_at 取今日 HH:mm（本地时区）。 */
export function computeDuePlannedAt(rule: RuleRow, now: number): number | null {
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
    scheduleKind: 'interval_minutes' | 'daily_at';
    intervalMinutes: number | null;
    dailyTime: string | null;
  },
  now: number = Date.now(),
): number | null {
  const on = rule.enabled === true || rule.enabled === 1;
  if (!on) return null;

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

function insertFailedRun(
  ruleId: string,
  plannedAt: number,
  source: AutomationRunSource,
  error: string,
): AutomationRun {
  const existing = loadExistingRun(ruleId, plannedAt);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  try {
    db.insert(automationRuns)
      .values({
        id,
        ruleId,
        plannedAt,
        source,
        status: 'failed',
        issueId: null,
        error,
        createdAt,
      })
      .run();
  } catch (e) {
    if (isUniqueConflict(e)) {
      const again = loadExistingRun(ruleId, plannedAt);
      if (again) return again;
    }
    throw e;
  }
  const row = db.select().from(automationRuns).where(eq(automationRuns.id, id)).get()!;
  return toAutomationRun(row);
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

/**
 * 幂等派发：UNIQUE(rule_id, planned_at)；冲突静默返回已有 run。
 * 非法 assignee → failed run，不建卡。
 * issue 建成功即 success（enqueue 失败只打 log）。
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

  const existing = loadExistingRun(ruleId, plannedAt);
  if (existing) return existing;

  const assigneeErr = validateAssignee(rule);
  if (assigneeErr) {
    return insertFailedRun(ruleId, plannedAt, source, assigneeErr);
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
    return insertFailedRun(ruleId, plannedAt, source, `create issue failed: ${msg}`);
  }

  if (!created.ok) {
    return insertFailedRun(
      ruleId,
      plannedAt,
      source,
      created.error || 'create issue failed',
    );
  }

  const runId = crypto.randomUUID();
  const createdAt = Date.now();
  try {
    db.insert(automationRuns)
      .values({
        id: runId,
        ruleId,
        plannedAt,
        source,
        status: 'success',
        issueId: created.issue.id,
        error: null,
        createdAt,
      })
      .run();
  } catch (e) {
    if (isUniqueConflict(e)) {
      const again = loadExistingRun(ruleId, plannedAt);
      if (again) return again;
    }
    throw e;
  }

  db.update(automationRules)
    .set({ lastPlannedAt: plannedAt, updatedAt: Date.now() })
    .where(eq(automationRules.id, ruleId))
    .run();

  const row = db.select().from(automationRuns).where(eq(automationRuns.id, runId)).get()!;
  return toAutomationRun(row);
}
