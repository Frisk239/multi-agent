import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { CronExpressionParser } from 'cron-parser';
import type { AutomationRun } from '@ma/shared';
import {
  CreateAutomationRuleInput,
  UpdateAutomationRuleInput,
} from '@ma/shared';
import { db } from '../db/client.js';
import { automationRules, automationRuns } from '../db/schema.js';
import { toAutomationRule, toAutomationRun } from '../db/reshape.js';
import { dispatchAutomationRule } from '../orchestration/automation-dispatch.js';

function normalizeScheduleFields(input: {
  scheduleKind?: 'interval_minutes' | 'daily_at' | 'cron';
  intervalMinutes?: number | null;
  dailyTime?: string | null;
  cronExpression?: string | null;
}): {
  scheduleKind?: 'interval_minutes' | 'daily_at' | 'cron';
  intervalMinutes?: number | null;
  dailyTime?: string | null;
  cronExpression?: string | null;
} {
  if (!input.scheduleKind) return input;
  if (input.scheduleKind === 'interval_minutes') {
    return {
      scheduleKind: 'interval_minutes',
      intervalMinutes: input.intervalMinutes ?? null,
      dailyTime: null,
      cronExpression: null,
    };
  }
  if (input.scheduleKind === 'daily_at') {
    return {
      scheduleKind: 'daily_at',
      intervalMinutes: null,
      dailyTime: input.dailyTime ?? null,
      cronExpression: null,
    };
  }
  return {
    scheduleKind: 'cron',
    intervalMinutes: null,
    dailyTime: null,
    cronExpression: input.cronExpression ?? null,
  };
}


function loadRuleStats(ruleId: string): { failCount: number; lastRunStatus: AutomationRun['status'] | null } {
  const fails = db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.ruleId, ruleId), eq(automationRuns.status, 'failed')))
    .all();
  const last = db
    .select()
    .from(automationRuns)
    .where(eq(automationRuns.ruleId, ruleId))
    .orderBy(desc(automationRuns.createdAt))
    .limit(1)
    .all()[0];
  return {
    failCount: fails.length,
    lastRunStatus: last ? (last.status as AutomationRun['status']) : null,
  };
}

function ruleWithStats(row: typeof automationRules.$inferSelect) {
  return toAutomationRule(row, loadRuleStats(row.id));
}

export async function automationRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/automation/rules
  app.get('/api/automation/rules', async () => {
    const rows = db
      .select()
      .from(automationRules)
      .orderBy(desc(automationRules.createdAt))
      .all();
    return rows.map(ruleWithStats);
  });

  // GET /api/automation/preview-cron
  app.get('/api/automation/preview-cron', async (req, reply) => {
    const { expression } = req.query as { expression?: string };
    if (!expression) return reply.status(400).send({ success: false, error: 'expression required' });
    try {
      const interval = CronExpressionParser.parse(expression, { currentDate: new Date() });
      const nextRuns = [];
      for (let i = 0; i < 5; i++) {
        nextRuns.push(interval.next().getTime());
      }
      return { success: true, nextRuns };
    } catch (e) {
      return reply.status(400).send({ success: false, error: 'invalid cron expression' });
    }
  });

  // POST /api/automation/rules
  app.post('/api/automation/rules', async (req, reply) => {
    const parsed = CreateAutomationRuleInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const input = parsed.data;
    const sched = normalizeScheduleFields(input);
    const now = Date.now();
    const id = crypto.randomUUID();

    db.insert(automationRules)
      .values({
        id,
        name: input.name,
        enabled: input.enabled === false ? 0 : 1,
        scheduleKind: sched.scheduleKind!,
        intervalMinutes: sched.intervalMinutes ?? null,
        dailyTime: sched.dailyTime ?? null,
        cronExpression: sched.cronExpression ?? null,
        assigneeType: input.assigneeType,
        assigneeId: input.assigneeId,
        titleTemplate: input.titleTemplate,
        bodyTemplate: input.bodyTemplate ?? '',
        lastPlannedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(automationRules).where(eq(automationRules.id, id)).get()!;
    return reply.status(201).send(ruleWithStats(row));
  });

  // GET /api/automation/rules/:id
  app.get('/api/automation/rules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    if (!row) return reply.status(404).send({ success: false, error: 'automation rule 不存在'  });
    return ruleWithStats(row);
  });

  // PATCH /api/automation/rules/:id
  app.patch('/api/automation/rules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateAutomationRuleInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const prev = db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    if (!prev) return reply.status(404).send({ success: false, error: 'automation rule 不存在'  });

    const patch = parsed.data;
    // 合并后校验 schedule 完整性
    const mergedKind = patch.scheduleKind ?? prev.scheduleKind;
    const mergedInterval =
      patch.intervalMinutes !== undefined ? patch.intervalMinutes : prev.intervalMinutes;
    const mergedDaily =
      patch.dailyTime !== undefined ? patch.dailyTime : prev.dailyTime;
    const mergedCron =
      patch.cronExpression !== undefined ? patch.cronExpression : prev.cronExpression;

    if (mergedKind === 'interval_minutes') {
      if (mergedInterval == null || ![5, 15, 30, 60].includes(mergedInterval)) {
        return reply.status(400).send({ success: false, error: 'interval_minutes 必须为 5/15/30/60',
        });
      }
    } else if (mergedKind === 'daily_at') {
      if (!mergedDaily || !/^\d{2}:\d{2}$/.test(mergedDaily)) {
        return reply.status(400).send({ success: false, error: 'dailyTime 必须为 HH:mm'  });
      }
    } else if (mergedKind === 'cron') {
      if (!mergedCron) {
        return reply.status(400).send({ success: false, error: 'cronExpression 不能为空' });
      }
      try {
        CronExpressionParser.parse(mergedCron);
      } catch {
        return reply.status(400).send({ success: false, error: '无效的 cron 表达式' });
      }
    }

    const updates: Partial<typeof automationRules.$inferInsert> = {
      updatedAt: Date.now(),
    };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.enabled !== undefined) updates.enabled = patch.enabled ? 1 : 0;
    if (patch.assigneeType !== undefined) updates.assigneeType = patch.assigneeType;
    if (patch.assigneeId !== undefined) updates.assigneeId = patch.assigneeId;
    if (patch.titleTemplate !== undefined) updates.titleTemplate = patch.titleTemplate;
    if (patch.bodyTemplate !== undefined) updates.bodyTemplate = patch.bodyTemplate;

    if (
      patch.scheduleKind !== undefined ||
      patch.intervalMinutes !== undefined ||
      patch.dailyTime !== undefined ||
      patch.cronExpression !== undefined
    ) {
      const sched = normalizeScheduleFields({
        scheduleKind: mergedKind,
        intervalMinutes: mergedInterval,
        dailyTime: mergedDaily,
        cronExpression: mergedCron,
      });
      updates.scheduleKind = sched.scheduleKind!;
      updates.intervalMinutes = sched.intervalMinutes ?? null;
      updates.dailyTime = sched.dailyTime ?? null;
      updates.cronExpression = sched.cronExpression ?? null;
    }

    db.update(automationRules).set(updates).where(eq(automationRules.id, id)).run();
    const row = db.select().from(automationRules).where(eq(automationRules.id, id)).get()!;
    return ruleWithStats(row);
  });

  // DELETE /api/automation/rules/:id
  app.delete('/api/automation/rules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const prev = db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    if (!prev) return reply.status(404).send({ success: false, error: 'automation rule 不存在'  });
    db.delete(automationRules).where(eq(automationRules.id, id)).run();
    return reply.status(204).send();
  });

  // POST /api/automation/rules/:id/run-now —— disabled 也可；201 + AutomationRun
  app.post('/api/automation/rules/:id/run-now', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rule = db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    if (!rule) return reply.status(404).send({ success: false, error: 'automation rule 不存在'  });

    const plannedAt = Date.now();
    try {
      const run = await dispatchAutomationRule(id, plannedAt, 'manual');
      return reply.status(201).send(run);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return reply.status(500).send({ success: false, error: msg  });
    }
  });

  // GET /api/automation/rules/:id/runs?limit=
  app.get('/api/automation/rules/:id/runs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rule = db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    if (!rule) return reply.status(404).send({ success: false, error: 'automation rule 不存在'  });

    const q = req.query as { limit?: string };
    let limit = Number(q.limit ?? 20);
    if (!Number.isFinite(limit) || limit <= 0) limit = 20;
    if (limit > 100) limit = 100;

    const rows = db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.ruleId, id))
      .orderBy(desc(automationRuns.createdAt))
      .limit(limit)
      .all();
    return rows.map(toAutomationRun);
  });
}
