/**
 * Automation webhook trigger（学 multica autopilot_webhook.go:343：
 * token → 事件过滤 → delivery 落库 → 复用 dispatch 核心）。
 *
 * 公开端点 POST /api/webhooks/:token 不走 X-MA-Token 门闩（local-token 放行该前缀）：
 * URL 中的随机 token 本身即凭证；错 token 404 且不泄漏规则存在性。
 * 管理 API（生成/轮换/过滤配置/deliveries）挂在既有 /api/automation/rules 下，受既有鉴权。
 */
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import {
  DEFAULT_WEBHOOK_RATE_PER_MIN,
  UpdateAutomationWebhookEventsInput,
  UpdateAutomationWebhookRateInput,
  WebhookTriggerInput,
  type AutomationRun,
} from '@ma/shared';
import { db } from '../db/client.js';
import { automationRules, automationWebhookDeliveries } from '../db/schema.js';
import {
  toWebhookDelivery,
  normalizeWebhookEventsInput,
  parseWebhookEvents,
} from '../db/reshape.js';
import {
  dispatchAutomationRule,
  isAutomationRuleArchivedError,
} from '../orchestration/automation-dispatch.js';

/** 48-hex 随机 token（≥32 hex 要求；token 是功能凭证，存 DB 不违 ADR 0003） */
export function generateWebhookToken(): string {
  return randomBytes(24).toString('hex');
}

type DeliveryStatus = 'dispatched' | 'filtered' | 'error' | 'rate_limited';

/**
 * 一次 POST 恰一条 delivery（ping 除外）：dispatch 完成后一次写入（含结果），
 * 避免「派前占位 + 终态更新」的两段复杂度。
 */
function insertWebhookDelivery(ruleId: string, delivery: {
  event: string;
  status: DeliveryStatus;
  payloadJson: string | null;
  automationRunId: string | null;
  error: string | null;
}): string {
  const id = crypto.randomUUID();
  db.insert(automationWebhookDeliveries)
    .values({
      id,
      ruleId,
      event: delivery.event,
      status: delivery.status,
      payloadJson: delivery.payloadJson,
      automationRunId: delivery.automationRunId,
      error: delivery.error,
      createdAt: Date.now(),
    })
    .run();
  return id;
}

/** run 终态的诚实审计提示：dispatched delivery 也带 run 侧 error（如 skipped 原因） */
function runAuditError(run: AutomationRun): string | null {
  if (run.status === 'failed' || run.status === 'skipped') {
    return run.error ?? `run 终态 ${run.status}`;
  }
  return null;
}

function serializePayload(payload: unknown): string | null {
  if (payload === undefined || payload === null) return null;
  try {
    return JSON.stringify(payload ?? null);
  } catch {
    return null;
  }
}

/**
 * webhook-rate-limit：滑动窗口（60s）内该规则 `dispatched` delivery 计数。
 * 只有真实触发占额：filtered / rate_limited / error 均不占，避免审计行自我挤压。
 */
function countDispatchedInWindow(ruleId: string, now: number): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(automationWebhookDeliveries)
    .where(
      and(
        eq(automationWebhookDeliveries.ruleId, ruleId),
        eq(automationWebhookDeliveries.status, 'dispatched'),
        gte(automationWebhookDeliveries.createdAt, now - 60_000),
      ),
    )
    .get();
  return row?.n ?? 0;
}

export async function automationWebhookRoutes(app: FastifyInstance): Promise<void> {
  // —— 公开端点（token 即凭证；guard 已放行 /api/webhooks/ 前缀）——
  app.post('/api/webhooks/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const parsed = WebhookTriggerInput.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ success: false, error: '请求体必须是 {event: string, payload?}' });
    }
    const { event, payload } = parsed.data;

    const rule = db
      .select()
      .from(automationRules)
      .where(eq(automationRules.webhookToken, token))
      .get();
    // 错 token 与不存在同形 404：不泄漏规则存在性
    if (!rule) {
      return reply.status(404).send({ success: false, error: 'not found' });
    }

    // ping 仅测连通：不触发、不记 delivery
    if (event === 'ping') {
      return reply.status(200).send({ ok: true });
    }

    const payloadJson = serializePayload(payload);

    // disabled / archived：受理（202）+ error 审计，不触发
    if (rule.archivedAt != null) {
      const deliveryId = insertWebhookDelivery(rule.id, {
        event,
        status: 'error',
        payloadJson,
        automationRunId: null,
        error: '规则已归档，不能触发',
      });
      return reply
        .status(202)
        .send({ status: 'error', deliveryId, error: '规则已归档，不能触发' });
    }
    if (rule.enabled !== 1) {
      const deliveryId = insertWebhookDelivery(rule.id, {
        event,
        status: 'error',
        payloadJson,
        automationRunId: null,
        error: '规则已停用，不能触发',
      });
      return reply
        .status(202)
        .send({ status: 'error', deliveryId, error: '规则已停用，不能触发' });
    }

    // webhook-rate-limit：事件过滤之前检查滑动窗口（disabled/archived 不会跑飞，不限流）
    const now = Date.now();
    const ratePerMin = rule.webhookRatePerMin ?? DEFAULT_WEBHOOK_RATE_PER_MIN;
    if (countDispatchedInWindow(rule.id, now) >= ratePerMin) {
      insertWebhookDelivery(rule.id, {
        event,
        status: 'rate_limited',
        payloadJson,
        automationRunId: null,
        error: `触发频率超限：滑动窗口 60s 内已 dispatched ${ratePerMin} 次（上限 ${ratePerMin}/分钟）`,
      });
      // 固定 hint（精确计算属 Out）：窗口 60s，等满即可
      return reply
        .status(429)
        .header('retry-after', 60)
        .send({ success: false, status: 'rate_limited', error: '触发频率超限' });
    }

    // 事件过滤：配置非空且 event 不在列表 → filtered，不触发
    const allowed = parseWebhookEvents(rule.webhookEvents);
    if (allowed && !allowed.includes(event)) {
      const deliveryId = insertWebhookDelivery(rule.id, {
        event,
        status: 'filtered',
        payloadJson,
        automationRunId: null,
        error: `事件 ${event} 不在过滤列表（${allowed.join(', ')}）`,
      });
      return reply
        .status(202)
        .send({ status: 'filtered', deliveryId, error: `事件 ${event} 未命中过滤列表` });
    }

    // 通过 → 复用 dispatch 核心（与 run-now 同一入口，source='webhook' 可观测）；
    // 事件上下文透传给模板渲染（{{webhook.*}} 占位符），schedule/manual 调用点不传即渲染空串
    try {
      const run = await dispatchAutomationRule(rule.id, Date.now(), 'webhook', {
        event,
        payload,
      });
      const auditError = runAuditError(run);
      const deliveryId = insertWebhookDelivery(rule.id, {
        event,
        status: 'dispatched',
        payloadJson,
        automationRunId: run.id,
        error: auditError,
      });
      return reply.status(202).send({
        status: 'dispatched',
        deliveryId,
        automationRunId: run.id,
        runStatus: run.status,
        error: auditError,
      });
    } catch (e) {
      // dispatch 内部失败（如归档竞态）：记 error delivery，仍 202（webhook 已受理）
      const msg = e instanceof Error ? e.message : String(e);
      const deliveryId = insertWebhookDelivery(rule.id, {
        event,
        status: 'error',
        payloadJson,
        automationRunId: null,
        error: msg,
      });
      return reply.status(202).send({ status: 'error', deliveryId, error: msg });
    }
  });

  // —— 管理 API（受既有 /api/* 鉴权保护）——

  // POST /api/automation/rules/:id/webhook/token —— 生成或轮换（旧 token 立即失效）
  app.post('/api/automation/rules/:id/webhook/token', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rule = db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    if (!rule) return reply.status(404).send({ success: false, error: 'automation rule 不存在' });
    if (rule.archivedAt != null) {
      return reply.status(409).send({ success: false, error: 'automation rule 已归档，不能生成 webhook' });
    }
    const token = generateWebhookToken();
    db.update(automationRules)
      .set({ webhookToken: token, updatedAt: Date.now() })
      .where(eq(automationRules.id, id))
      .run();
    return reply.status(201).send({ token });
  });

  // PUT /api/automation/rules/:id/webhook/events —— 事件过滤（空串/null = 全部放行）
  app.put('/api/automation/rules/:id/webhook/events', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rule = db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    if (!rule) return reply.status(404).send({ success: false, error: 'automation rule 不存在' });
    if (rule.archivedAt != null) {
      return reply.status(409).send({ success: false, error: 'automation rule 已归档，不能编辑 webhook' });
    }
    const parsed = UpdateAutomationWebhookEventsInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }
    db.update(automationRules)
      .set({
        webhookEvents: normalizeWebhookEventsInput(parsed.data.events),
        updatedAt: Date.now(),
      })
      .where(eq(automationRules.id, id))
      .run();
    const row = db.select().from(automationRules).where(eq(automationRules.id, id)).get()!;
    return { webhookEvents: parseWebhookEvents(row.webhookEvents) };
  });

  // PUT /api/automation/rules/:id/webhook/rate —— 每分钟触发上限（null = 恢复默认）
  app.put('/api/automation/rules/:id/webhook/rate', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rule = db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    if (!rule) return reply.status(404).send({ success: false, error: 'automation rule 不存在' });
    if (rule.archivedAt != null) {
      return reply.status(409).send({ success: false, error: 'automation rule 已归档，不能编辑 webhook' });
    }
    const parsed = UpdateAutomationWebhookRateInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }
    db.update(automationRules)
      .set({ webhookRatePerMin: parsed.data.perMinute, updatedAt: Date.now() })
      .where(eq(automationRules.id, id))
      .run();
    return { webhookRatePerMin: parsed.data.perMinute };
  });

  // GET /api/automation/rules/:id/webhook/deliveries?limit=20
  app.get('/api/automation/rules/:id/webhook/deliveries', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rule = db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    if (!rule) return reply.status(404).send({ success: false, error: 'automation rule 不存在' });

    const q = req.query as { limit?: string };
    let limit = Number(q.limit ?? 20);
    if (!Number.isFinite(limit) || limit <= 0) limit = 20;
    if (limit > 100) limit = 100;

    const rows = db
      .select()
      .from(automationWebhookDeliveries)
      .where(eq(automationWebhookDeliveries.ruleId, id))
      .orderBy(desc(automationWebhookDeliveries.createdAt))
      .limit(limit)
      .all();
    return rows.map(toWebhookDelivery);
  });
}
