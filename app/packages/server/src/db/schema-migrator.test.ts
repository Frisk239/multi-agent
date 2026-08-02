import { describe, it, expect, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import {
  activityLogs,
  agents,
  agentRuns,
  automationRules,
  issues,
  memoryItems,
  workspaces,
} from './schema.js';

/**
 * Slice 41 漂移门禁：migrator-only 空库必须具备当前 schema 关键列。
 * 若 schema.ts 加列但未写 drizzle SQL，本测会失败。
 */
describe('schema migrator drift gate (Slice 41)', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  function colNames(sqlite: ReturnType<typeof createTestDb>['sqlite'], table: string): Set<string> {
    const info = sqlite.pragma(`table_info(${table})`) as Array<{ name: string }>;
    return new Set(info.map((c) => c.name));
  }

  it('migrator-only empty DB has Slice 41 gap columns (no inline ALTER)', () => {
    const t = createTestDb();
    cleanup = t.cleanup;
    const { sqlite } = t;

    const agent = colNames(sqlite, 'agent');
    expect(agent.has('allowed_paths')).toBe(true);
    // P2-4：显式 fallback agent（0045）
    expect(agent.has('fallback_agent_id')).toBe(true);

    const agentRun = colNames(sqlite, 'agent_run');
    expect(agentRun.has('parent_run_id')).toBe(true);
    // Slice 66 / 68
    expect(agentRun.has('waiting_local_entered_at')).toBe(true);
    expect(agentRun.has('prepare_lease_expires_at')).toBe(true);
    expect(agentRun.has('attempt')).toBe(true);
    expect(agentRun.has('max_attempts')).toBe(true);
    expect(agentRun.has('next_attempt_at')).toBe(true);
    expect(agentRun.has('auto_retry_of_run_id')).toBe(true);
    // P2-4：改派血缘（0045）
    expect(agentRun.has('escalated_from_run_id')).toBe(true);
    // G2-1：deferred 升级时刻（0048）
    expect(agentRun.has('fire_at')).toBe(true);
    const retryIndexes = sqlite.pragma('index_list(agent_run)') as Array<{ name: string }>;
    expect(retryIndexes.some((index) => index.name === 'uq_agent_run_auto_retry_of')).toBe(true);
    expect(retryIndexes.some((index) => index.name === 'uq_agent_run_escalated_from')).toBe(true);

    const issue = colNames(sqlite, 'issue');
    expect(issue.has('custom_fields')).toBe(true);

    // B5：squad updated_at（0047）
    const squad = colNames(sqlite, 'squad');
    expect(squad.has('updated_at')).toBe(true);

    const automationRule = colNames(sqlite, 'automation_rule');
    expect(automationRule.has('cron_expression')).toBe(true);
    const automationRun = colNames(sqlite, 'automation_run');
    expect(automationRun.has('linked_run_id')).toBe(true);
    expect(automationRun.has('updated_at')).toBe(true);

    const memoryItem = colNames(sqlite, 'memory_item');
    expect(memoryItem.has('valid_at')).toBe(true);
    expect(memoryItem.has('invalid_at')).toBe(true);

    // 0035 已在 journal
    const wikiJob = colNames(sqlite, 'wiki_ingest_job');
    expect(wikiJob.has('next_attempt_at')).toBe(true);

    // R4：fresh DB 必须可读取 activity timeline，而不是运行时 500 no such table。
    const activityLog = colNames(sqlite, 'activity_log');
    expect(activityLog).toEqual(
      new Set([
        'id',
        'issue_id',
        'actor_type',
        'actor_id',
        'actor_name',
        'event_type',
        'payload',
        'created_at',
      ]),
    );
    const activityIndexes = sqlite.pragma('index_list(activity_log)') as Array<{ name: string }>;
    expect(activityIndexes.some((index) => index.name === 'idx_activity_log_issue')).toBe(true);
    const activityFks = sqlite.pragma('foreign_key_list(activity_log)') as Array<{
      table: string;
      from: string;
      to: string;
      on_delete: string;
    }>;
    expect(activityFks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'issue',
          from: 'issue_id',
          to: 'id',
          on_delete: 'CASCADE',
        }),
      ]),
    );
  });

  it('can insert/read gap columns via drizzle without runtime ALTER', () => {
    const t = createTestDb();
    cleanup = t.cleanup;
    const { db } = t;
    const now = Date.now();

    db.insert(workspaces)
      .values({ id: 'ws-gap', name: 'Gap WS', createdAt: now })
      .run();

    db.insert(agents)
      .values({
        id: 'agt-gap-1',
        name: 'Gap Agent',
        runtime: 'opencode',
        concurrency: 1,
        instructions: '',
        allowedPaths: '["/tmp"]',
        createdAt: now,
      })
      .run();

    db.insert(issues)
      .values({
        id: 'iss-gap-1',
        workspaceId: 'ws-gap',
        identifier: 'FRI-9001',
        title: 'gap',
        status: 'backlog',
        priority: 'none',
        creatorType: 'member',
        creatorId: 'u1',
        position: 0,
        customFields: { k: 'v' },
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(agentRuns)
      .values({
        id: 'run-gap-1',
        issueId: 'iss-gap-1',
        agentId: 'agt-gap-1',
        runtime: 'opencode',
        status: 'queued',
        kind: 'issue',
        isLeader: 0,
        parentRunId: null,
        createdAt: now,
      })
      .run();

    db.insert(automationRules)
      .values({
        id: 'rule-gap-1',
        name: 'cron rule',
        enabled: 1,
        scheduleKind: 'cron',
        cronExpression: '*/5 * * * *',
        assigneeType: 'agent',
        assigneeId: 'agt-gap-1',
        titleTemplate: 't',
        bodyTemplate: '',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(memoryItems)
      .values({
        id: 'mem-gap-1',
        scope: 'workspace',
        text: 'hello',
        validAt: now,
        invalidAt: null,
        createdAt: now,
      })
      .run();

    db.insert(activityLogs)
      .values({
        id: 'act-gap-1',
        issueId: 'iss-gap-1',
        actorType: 'system',
        actorId: null,
        actorName: '系统',
        eventType: 'mention_delegated',
        payload: JSON.stringify({ runId: 'run-gap-1' }),
        createdAt: now,
      })
      .run();

    const agent = db.select().from(agents).where(eq(agents.id, 'agt-gap-1')).get();
    expect(agent?.allowedPaths).toBe('["/tmp"]');

    const issue = db.select().from(issues).where(eq(issues.id, 'iss-gap-1')).get();
    expect(issue?.customFields).toEqual({ k: 'v' });

    const rule = db.select().from(automationRules).where(eq(automationRules.id, 'rule-gap-1')).get();
    expect(rule?.cronExpression).toBe('*/5 * * * *');

    const mem = db.select().from(memoryItems).where(eq(memoryItems.id, 'mem-gap-1')).get();
    expect(mem?.validAt).toBe(now);

    const activity = db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.id, 'act-gap-1'))
      .get();
    expect(activity?.issueId).toBe('iss-gap-1');
    expect(activity?.eventType).toBe('mention_delegated');
  });
});
