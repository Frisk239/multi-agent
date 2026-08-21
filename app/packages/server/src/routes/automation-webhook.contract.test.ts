/**
 * Automation webhook trigger contract（学 multica autopilot_webhook）。
 *
 * Drives the real Fastify routes over a migrator-created in-memory SQLite DB:
 * token 即凭证 → 频率限流（60s 滑窗，dispatched 才占额）→ 事件过滤 → delivery 审计
 * （一次 POST 恰一条）→ 复用 dispatch 核心（source='webhook'）。
 * 错 token 404 不泄漏存在性；disabled/archived 不产生 run；ping 不记 delivery。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import {
  agentRuns,
  automationRules,
  automationRuns,
  automationWebhookDeliveries,
  issues,
} from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('test db not ready');
    return state.db;
  },
  sqlite: {
    prepare: () => ({ get: () => ({ '1': 1 }) }),
  },
  getSqliteHardeningInfo: () => ({
    path: ':memory:',
    busyTimeoutMs: 5000,
    journalMode: 'memory',
    foreignKeys: true,
  }),
  resolveAssigneeLabel: () => 'Test Agent',
  resolveAuthorLabel: () => 'Test User',
}));

vi.mock('../orchestration/event-bus.js', () => ({
  eventBus: { publish: vi.fn(), on: vi.fn() },
}));
vi.mock('../orchestration/run-worker.js', () => ({ wakeRunWorker: vi.fn() }));

import { buildApp } from '../app.js';

function seedRule(overrides: Partial<typeof automationRules.$inferInsert> = {}) {
  const now = Date.now();
  const id = overrides.id ?? 'rule-webhook';
  state.db!
    .insert(automationRules)
    .values({
      id,
      name: 'webhook 规则',
      enabled: 1,
      archivedAt: null,
      scheduleKind: 'interval_minutes',
      intervalMinutes: 15,
      dailyTime: null,
      cronExpression: null,
      assigneeType: 'agent',
      assigneeId: 'agt-test-1',
      titleTemplate: 'webhook {{date}}',
      bodyTemplate: '触发',
      executionMode: 'create_issue',
      lastPlannedAt: null,
      webhookToken: 't'.repeat(48),
      webhookEvents: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return id;
}

function deliveriesFor(ruleId: string) {
  return state.db!
    .select()
    .from(automationWebhookDeliveries)
    .where(eq(automationWebhookDeliveries.ruleId, ruleId))
    .all();
}

function runsFor(ruleId: string) {
  return state.db!
    .select()
    .from(automationRuns)
    .where(eq(automationRuns.ruleId, ruleId))
    .all();
}

/** 直接落库 n 条 dispatched delivery（绕开 dispatch，专测滑窗计数） */
function seedDispatchedDeliveries(ruleId: string, count: number, createdAt = Date.now()) {
  for (let i = 0; i < count; i++) {
    state.db!
      .insert(automationWebhookDeliveries)
      .values({
        id: `dly-${ruleId}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        ruleId,
        event: 'push',
        status: 'dispatched',
        payloadJson: null,
        automationRunId: null,
        error: null,
        createdAt,
      })
      .run();
  }
}

async function postWebhook(app: App, token: string, body: unknown) {
  return app.inject({
    method: 'POST',
    url: `/api/webhooks/${token}`,
    headers: { 'content-type': 'application/json' },
    payload: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
type App = Awaited<ReturnType<typeof buildApp>>;

describe('automation webhook trigger', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    process.env.MA_ENQUEUE_ALLOW_NOT_READY = '1';
  });

  afterEach(async () => {
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('ping answers 200 without dispatching or recording a delivery', async () => {
    const ruleId = seedRule();
    const app = await buildApp();

    const res = await postWebhook(app, 't'.repeat(48), { event: 'ping' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(deliveriesFor(ruleId)).toHaveLength(0);
    expect(runsFor(ruleId)).toHaveLength(0);

    await app.close();
  });

  it('dispatches through the shared core with source=webhook and audits exactly one delivery', async () => {
    const ruleId = seedRule();
    const app = await buildApp();

    const res = await postWebhook(app, 't'.repeat(48), {
      event: 'push',
      payload: { ref: 'refs/heads/main' },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe('dispatched');
    expect(body.automationRunId).toEqual(expect.any(String));

    const deliveries = deliveriesFor(ruleId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      ruleId,
      event: 'push',
      status: 'dispatched',
      automationRunId: body.automationRunId,
    });
    expect(deliveries[0]!.payloadJson).toContain('refs/heads/main');

    const runs = runsFor(ruleId);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ source: 'webhook' });

    await app.close();
  });

  it('wrong or missing token answers a uniform 404 without leaking rule existence', async () => {
    seedRule();
    const app = await buildApp();

    const wrong = await postWebhook(app, 'x'.repeat(48), { event: 'push' });
    expect(wrong.statusCode).toBe(404);
    expect(wrong.json().error).toBe('not found');

    const noToken = await app.inject({
      method: 'POST',
      url: '/api/webhooks/',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ event: 'push' }),
    });
    expect(noToken.statusCode).toBe(404);

    await app.close();
  });

  it('invalid JSON body answers 400 and records nothing', async () => {
    const ruleId = seedRule();
    const app = await buildApp();

    const badJson = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${'t'.repeat(48)}`,
      headers: { 'content-type': 'application/json' },
      payload: '{"event": "broken"',
    });
    expect(badJson.statusCode).toBe(400);

    const noEvent = await postWebhook(app, 't'.repeat(48), { payload: {} });
    expect(noEvent.statusCode).toBe(400);

    expect(deliveriesFor(ruleId)).toHaveLength(0);
    expect(runsFor(ruleId)).toHaveLength(0);

    await app.close();
  });

  it('disabled rule is accepted (202) with an error delivery and no automation run', async () => {
    const ruleId = seedRule({ enabled: 0 });
    const app = await buildApp();

    const res = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('error');
    expect(res.json().error).toContain('停用');

    const deliveries = deliveriesFor(ruleId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ status: 'error' });
    expect(runsFor(ruleId)).toHaveLength(0);

    await app.close();
  });

  it('archived rule is accepted (202) with an error delivery and no automation run', async () => {
    const ruleId = seedRule({ archivedAt: Date.now() - 1000 });
    const app = await buildApp();

    const res = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('error');
    expect(res.json().error).toContain('归档');

    expect(deliveriesFor(ruleId)).toHaveLength(1);
    expect(deliveriesFor(ruleId)[0]).toMatchObject({ status: 'error' });
    expect(runsFor(ruleId)).toHaveLength(0);

    await app.close();
  });

  it('event filter: configured non-match is filtered (202) while a match dispatches', async () => {
    const ruleId = seedRule({ webhookEvents: 'push, tag_push' });
    const app = await buildApp();

    const rejected = await postWebhook(app, 't'.repeat(48), { event: 'issue_comment' });
    expect(rejected.statusCode).toBe(202);
    expect(rejected.json().status).toBe('filtered');
    expect(runsFor(ruleId)).toHaveLength(0);

    const allowed = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    expect(allowed.statusCode).toBe(202);
    expect(allowed.json().status).toBe('dispatched');
    expect(runsFor(ruleId)).toHaveLength(1);

    const deliveries = deliveriesFor(ruleId);
    expect(deliveries).toHaveLength(2);
    expect(deliveries.find((d) => d.status === 'filtered')?.event).toBe('issue_comment');
    expect(deliveries.find((d) => d.status === 'dispatched')?.event).toBe('push');

    await app.close();
  });

  it('token rotation invalidates the old URL immediately and returns a 48-hex token', async () => {
    const ruleId = seedRule();
    const app = await buildApp();

    const rotated = await app.inject({
      method: 'POST',
      url: `/api/automation/rules/${ruleId}/webhook/token`,
    });
    expect(rotated.statusCode).toBe(201);
    const { token } = rotated.json();
    expect(token).toMatch(/^[0-9a-f]{48}$/);

    const oldUrl = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    expect(oldUrl.statusCode).toBe(404);

    const fresh = await postWebhook(app, token, { event: 'push' });
    expect(fresh.statusCode).toBe(202);
    expect(fresh.json().status).toBe('dispatched');

    await app.close();
  });

  it('PUT events normalizes a comma list and empty input clears the filter', async () => {
    const ruleId = seedRule();
    const app = await buildApp();

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/automation/rules/${ruleId}/webhook/events`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ events: ' push , tag_push ,,' }),
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ webhookEvents: ['push', 'tag_push'] });
    const stored = state.db!
      .select({ webhookEvents: automationRules.webhookEvents })
      .from(automationRules)
      .where(eq(automationRules.id, ruleId))
      .get();
    expect(stored?.webhookEvents).toBe('push,tag_push');

    const cleared = await app.inject({
      method: 'PUT',
      url: `/api/automation/rules/${ruleId}/webhook/events`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ events: '' }),
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toEqual({ webhookEvents: null });

    await app.close();
  });

  it('GET deliveries returns the audited rows newest-first for the rule only', async () => {
    const ruleId = seedRule({ webhookEvents: 'push' });
    const otherId = seedRule({ id: 'rule-other', webhookToken: 'o'.repeat(48) });
    const app = await buildApp();

    await postWebhook(app, 't'.repeat(48), { event: 'push' });
    await postWebhook(app, 't'.repeat(48), { event: 'tag_push' }); // filtered
    await postWebhook(app, 'o'.repeat(48), { event: 'push' }); // other rule

    const res = await app.inject({
      method: 'GET',
      url: `/api/automation/rules/${ruleId}/webhook/deliveries?limit=20`,
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json();
    expect(rows).toHaveLength(2);
    expect(rows.every((r: { ruleId: string }) => r.ruleId === ruleId)).toBe(true);
    expect(rows.map((r: { status: string }) => r.status)).toEqual(['filtered', 'dispatched']);

    const missing = await app.inject({
      method: 'GET',
      url: '/api/automation/rules/rule-nope/webhook/deliveries',
    });
    expect(missing.statusCode).toBe(404);
    expect(otherId).toBe('rule-other');

    await app.close();
  });

  it('detail contract exposes webhook token and parsed event filter', async () => {
    const ruleId = seedRule({ webhookEvents: 'push,tag_push' });
    const app = await buildApp();

    const detail = await app.inject({ method: 'GET', url: `/api/automation/rules/${ruleId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      webhookToken: 't'.repeat(48),
      webhookEvents: ['push', 'tag_push'],
    });

    await app.close();
  });

  it('webhook trigger renders {{webhook.*}} placeholders into the created issue (create_issue)', async () => {
    const ruleId = seedRule({
      titleTemplate: '事件 {{webhook.event}} @ {{webhook.payload.ref}}',
      bodyTemplate: '提交人 {{webhook.payload.author}}\n完整 payload：\n{{webhook.payload}}',
    });
    const app = await buildApp();

    const res = await postWebhook(app, 't'.repeat(48), {
      event: 'push',
      payload: { ref: 'refs/heads/main', author: 'octo' },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('dispatched');

    const runs = runsFor(ruleId);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.issueId).toBeTruthy();
    const issue = state.db!
      .select()
      .from(issues)
      .where(eq(issues.id, runs[0]!.issueId!))
      .get();
    expect(issue!.title).toBe('事件 push @ refs/heads/main');
    expect(issue!.description).toContain('提交人 octo');
    expect(issue!.description).toContain('"ref": "refs/heads/main"');
    expect(issue!.description).not.toContain('{{webhook.');

    await app.close();
  });

  it('webhook trigger renders {{webhook.*}} placeholders into the run_only prompt', async () => {
    const ruleId = seedRule({
      executionMode: 'run_only',
      titleTemplate: '{{webhook.event}} 巡检',
      bodyTemplate: 'ref={{webhook.payload.ref}}',
    });
    const app = await buildApp();

    const res = await postWebhook(app, 't'.repeat(48), {
      event: 'push',
      payload: { ref: 'refs/heads/main' },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('dispatched');

    const runs = runsFor(ruleId);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.linkedRunId).toBeTruthy();
    const linked = state.db!
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, runs[0]!.linkedRunId!))
      .get();
    expect(linked!.quickPrompt).toContain('push 巡检');
    expect(linked!.quickPrompt).toContain('ref=refs/heads/main');
    expect(linked!.quickPrompt).not.toContain('{{webhook.');

    await app.close();
  });

  it('a dispatch that lands on a failed run still audits one dispatched delivery with the run error', async () => {
    // assignee 指向不存在的 agent → dispatch 核心 failed run（不建 Issue）
    const ruleId = seedRule({ assigneeId: 'agt-missing' });
    const app = await buildApp();

    const res = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe('dispatched');
    expect(body.runStatus).toBe('failed');
    expect(body.error).toEqual(expect.any(String));

    const deliveries = deliveriesFor(ruleId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      status: 'dispatched',
      automationRunId: body.automationRunId,
      error: expect.any(String),
    });
    expect(runsFor(ruleId)).toHaveLength(1);

    await app.close();
  });

  // —— webhook-rate-limit：60s 滑窗，dispatched 才占额 ——

  it('exceeding the default cap of 10/min answers 429 rate_limited with an audited delivery and no run', async () => {
    const ruleId = seedRule(); // webhookRatePerMin = null → 默认 10
    seedDispatchedDeliveries(ruleId, 10);
    const app = await buildApp();

    const res = await postWebhook(app, 't'.repeat(48), {
      event: 'push',
      payload: { ref: 'refs/heads/main' },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({
      success: false,
      status: 'rate_limited',
      error: '触发频率超限',
    });
    expect(res.headers['retry-after']).toBe('60');

    const deliveries = deliveriesFor(ruleId);
    expect(deliveries).toHaveLength(11);
    const limited = deliveries.find((d) => d.status === 'rate_limited')!;
    expect(limited).toMatchObject({ ruleId, event: 'push', automationRunId: null });
    // 审计保留原始 payload，供事后排查误打脚本
    expect(limited.payloadJson).toContain('refs/heads/main');
    expect(limited.error).toContain('触发频率超限');
    expect(runsFor(ruleId)).toHaveLength(0);

    await app.close();
  });

  it('the window slides: dispatched deliveries older than 60s no longer consume the quota', async () => {
    const ruleId = seedRule({ webhookRatePerMin: 1 });
    seedDispatchedDeliveries(ruleId, 1, Date.now() - 61_000);
    const app = await buildApp();

    const res = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('dispatched');
    expect(runsFor(ruleId)).toHaveLength(1);

    await app.close();
  });

  it('a custom cap takes effect: N dispatches pass, the next one is rate limited', async () => {
    const ruleId = seedRule({ webhookRatePerMin: 2 });
    const app = await buildApp();

    const first = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    const second = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    const third = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    expect(first.statusCode).toBe(202);
    expect(first.json().status).toBe('dispatched');
    expect(second.statusCode).toBe(202);
    expect(second.json().status).toBe('dispatched');
    expect(third.statusCode).toBe(429);
    expect(third.json().status).toBe('rate_limited');

    const statuses = deliveriesFor(ruleId).map((d) => d.status).sort();
    expect(statuses).toEqual(['dispatched', 'dispatched', 'rate_limited']);
    expect(runsFor(ruleId)).toHaveLength(2);

    await app.close();
  });

  it('filtered and rate_limited deliveries do not consume the quota (only dispatched counts)', async () => {
    const ruleId = seedRule({ webhookRatePerMin: 1, webhookEvents: 'push' });
    const app = await buildApp();

    const filtered = await postWebhook(app, 't'.repeat(48), { event: 'issue_comment' });
    expect(filtered.statusCode).toBe(202);
    expect(filtered.json().status).toBe('filtered');

    // 窗口内只有 filtered 审计，未占额 → push 仍可触发
    const allowed = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    expect(allowed.statusCode).toBe(202);
    expect(allowed.json().status).toBe('dispatched');

    // 这次 dispatched 占满额度 → 下一条才限流
    const blocked = await postWebhook(app, 't'.repeat(48), { event: 'push' });
    expect(blocked.statusCode).toBe(429);

    await app.close();
  });

  it('ping stays exempt from rate limiting and records no delivery', async () => {
    const ruleId = seedRule({ webhookRatePerMin: 1 });
    seedDispatchedDeliveries(ruleId, 1);
    const app = await buildApp();

    const ping = await postWebhook(app, 't'.repeat(48), { event: 'ping' });
    expect(ping.statusCode).toBe(200);
    expect(ping.json()).toEqual({ ok: true });
    expect(deliveriesFor(ruleId)).toHaveLength(1); // 只有预置那条

    await app.close();
  });

  it('PUT rate saves a custom cap, null restores the default, invalid values are 400', async () => {
    const ruleId = seedRule();
    const app = await buildApp();

    const saved = await app.inject({
      method: 'PUT',
      url: `/api/automation/rules/${ruleId}/webhook/rate`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ perMinute: 30 }),
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ webhookRatePerMin: 30 });
    const stored = state.db!
      .select({ rate: automationRules.webhookRatePerMin })
      .from(automationRules)
      .where(eq(automationRules.id, ruleId))
      .get();
    expect(stored?.rate).toBe(30);

    const reset = await app.inject({
      method: 'PUT',
      url: `/api/automation/rules/${ruleId}/webhook/rate`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ perMinute: null }),
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toEqual({ webhookRatePerMin: null });

    for (const bad of [0, -5, 1001, 1.5, '10']) {
      const rejected = await app.inject({
        method: 'PUT',
        url: `/api/automation/rules/${ruleId}/webhook/rate`,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ perMinute: bad }),
      });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().code).toBe('VALIDATION_ERROR');
    }

    const missing = await app.inject({
      method: 'PUT',
      url: '/api/automation/rules/rule-nope/webhook/rate',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ perMinute: 30 }),
    });
    expect(missing.statusCode).toBe(404);

    await app.close();
  });

  it('detail contract exposes webhookRatePerMin (custom and default null)', async () => {
    const ruleId = seedRule({ webhookRatePerMin: 25 });
    const defaultId = seedRule({ id: 'rule-default-rate', webhookToken: 'd'.repeat(48) });
    const app = await buildApp();

    const detail = await app.inject({ method: 'GET', url: `/api/automation/rules/${ruleId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ webhookRatePerMin: 25 });

    const fallback = await app.inject({
      method: 'GET',
      url: `/api/automation/rules/${defaultId}`,
    });
    expect(fallback.statusCode).toBe(200);
    expect(fallback.json()).toMatchObject({ webhookRatePerMin: null });

    await app.close();
  });
});
