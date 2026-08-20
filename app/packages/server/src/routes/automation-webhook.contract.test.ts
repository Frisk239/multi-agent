/**
 * Automation webhook trigger contract（学 multica autopilot_webhook）。
 *
 * Drives the real Fastify routes over a migrator-created in-memory SQLite DB:
 * token 即凭证 → 事件过滤 → delivery 审计（一次 POST 恰一条）→ 复用 dispatch 核心
 * （source='webhook'）。错 token 404 不泄漏存在性；disabled/archived 不产生 run。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import {
  automationRules,
  automationRuns,
  automationWebhookDeliveries,
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
});
