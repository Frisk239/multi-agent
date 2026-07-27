import { describe, it, expect, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import {
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

    const agentRun = colNames(sqlite, 'agent_run');
    expect(agentRun.has('parent_run_id')).toBe(true);

    const issue = colNames(sqlite, 'issue');
    expect(issue.has('custom_fields')).toBe(true);

    const automationRule = colNames(sqlite, 'automation_rule');
    expect(automationRule.has('cron_expression')).toBe(true);

    const memoryItem = colNames(sqlite, 'memory_item');
    expect(memoryItem.has('valid_at')).toBe(true);
    expect(memoryItem.has('invalid_at')).toBe(true);

    // 0035 已在 journal
    const wikiJob = colNames(sqlite, 'wiki_ingest_job');
    expect(wikiJob.has('next_attempt_at')).toBe(true);
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

    const agent = db.select().from(agents).where(eq(agents.id, 'agt-gap-1')).get();
    expect(agent?.allowedPaths).toBe('["/tmp"]');

    const issue = db.select().from(issues).where(eq(issues.id, 'iss-gap-1')).get();
    expect(issue?.customFields).toEqual({ k: 'v' });

    const rule = db.select().from(automationRules).where(eq(automationRules.id, 'rule-gap-1')).get();
    expect(rule?.cronExpression).toBe('*/5 * * * *');

    const mem = db.select().from(memoryItems).where(eq(memoryItems.id, 'mem-gap-1')).get();
    expect(mem?.validAt).toBe(now);
  });
});
