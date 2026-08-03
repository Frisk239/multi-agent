/**
 * G6-3：run-service enqueue 决策/熔断阈值边界直测（原 MAX_RUNS_PER_ISSUE 零测试）。
 * 真实迁移 DB + 真 checkAndEnqueue（readiness mock 放行），对齐 critical-path 模式。
 * 覆盖：熔断上限边界（14 可派 / 15 拒绝）/ quick_create 不计数 / per-(issue,agent) 去重。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { agentRuns, issues, comments } from '../db/schema.js';
import { enqueueAgentRun } from './run-service.js';

/** 与 run-service.ts:19 保持一致（非 export const，测试用字面量钉边界） */
const MAX_RUNS_PER_ISSUE = 15;

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  wakeRunWorker: vi.fn(),
  notifyEnqueueSkipped: vi.fn(),
  computeAgentReadiness: vi.fn(),
}));

const testState = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!testState.db) throw new Error('test db not ready');
    return testState.db;
  },
  resolveAssigneeLabel: () => 'test-assignee',
  resolveAuthorLabel: (type: string, id: string) =>
    type === 'member' && id === 'system' ? '系统' : id,
}));

vi.mock('./event-bus.js', () => ({
  eventBus: { publish: (...args: unknown[]) => mocks.publish(...args) },
}));

vi.mock('./run-worker.js', () => ({
  wakeRunWorker: (...args: unknown[]) => mocks.wakeRunWorker(...args),
}));

vi.mock('./readiness.js', () => ({
  computeAgentReadiness: (...args: unknown[]) => mocks.computeAgentReadiness(...args),
}));

vi.mock('./inbox-writer.js', () => ({
  notifyEnqueueSkipped: (...args: unknown[]) => mocks.notifyEnqueueSkipped(...args),
  notifyRunTerminal: vi.fn(),
  notifyCommentCreated: vi.fn(),
}));

function readyMock(): void {
  mocks.computeAgentReadiness.mockResolvedValue({
    agentId: 'agt-test-1',
    runtime: 'opencode',
    runtimeInstalled: true,
    runtimePath: '/bin/opencode',
    runtimeVersion: '1.0',
    concurrency: 2,
    runningCount: 0,
    slotsAvailable: 2,
    cwdConfigured: true,
    status: 'ready',
    detail: '',
  });
}

function insertIssueRun(id: string, status: 'completed' | 'running' = 'completed'): void {
  testState.db!.insert(agentRuns)
    .values({
      id,
      issueId: 'iss-test-1',
      agentId: 'agt-test-1',
      runtime: 'opencode',
      status,
      kind: 'issue',
      createdAt: Date.now(),
    })
    .run();
}

describe('G6-3 run-service enqueue 熔断边界', () => {
  beforeEach(() => {
    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    mocks.publish.mockReset();
    mocks.wakeRunWorker.mockReset();
    mocks.notifyEnqueueSkipped.mockReset();
    delete process.env.MA_ENQUEUE_ALLOW_NOT_READY;
    readyMock();
  });

  afterEach(() => {
    testState.cleanup?.();
    testState.db = null;
    testState.cleanup = null;
  });

  it(`边界：已有 ${MAX_RUNS_PER_ISSUE - 1} 个 issue run → 仍可派发（第 ${MAX_RUNS_PER_ISSUE} 个）`, async () => {
    for (let i = 0; i < MAX_RUNS_PER_ISSUE - 1; i++) {
      insertIssueRun(`run-edge-${i}`);
    }
    const res = await enqueueAgentRun('iss-test-1', 'agt-test-1');
    expect(res.skipped).toBe(false);
    expect(res.run?.status).toBe('queued');
    expect(mocks.wakeRunWorker).toHaveBeenCalled();
  });

  it(`熔断：已有 ${MAX_RUNS_PER_ISSUE} 个 issue run → 第 ${MAX_RUNS_PER_ISSUE + 1} 个 skipped('run_limit') + system comment + inbox`, async () => {
    for (let i = 0; i < MAX_RUNS_PER_ISSUE; i++) {
      insertIssueRun(`run-limit-${i}`);
    }
    const res = await enqueueAgentRun('iss-test-1', 'agt-test-1');
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('run_limit');
    expect(res.run).toBeNull();
    expect(mocks.wakeRunWorker).not.toHaveBeenCalled();
    expect(mocks.notifyEnqueueSkipped).toHaveBeenCalledWith(
      'iss-test-1',
      'agt-test-1',
      'run_limit',
      expect.stringContaining('上限'),
    );
    // system comment 落库（publishEnqueueBlockedComment）
    const sysComments = testState.db!
      .select()
      .from(comments)
      .where(eq(comments.issueId, 'iss-test-1'))
      .all()
      .filter((c) => c.body.includes('上限'));
    expect(sysComments.length).toBeGreaterThan(0);
    expect(sysComments[0]!.body).toMatch(/上限/);
  });

  it('quick_create run 不计入乒乓熔断（bu03 语义）', async () => {
    // 14 个 issue run（未达上限）+ 2 个 quick_create（总数 16 > 上限）→ 仍可派
    for (let i = 0; i < MAX_RUNS_PER_ISSUE - 1; i++) {
      insertIssueRun(`run-qc-${i}`);
    }
    for (let i = 0; i < 2; i++) {
      testState.db!.insert(agentRuns)
        .values({
          id: `run-qc-extra-${i}`,
          issueId: 'iss-test-1',
          agentId: 'agt-test-1',
          runtime: 'opencode',
          status: 'completed',
          kind: 'quick_create',
          quickPrompt: 'x',
          createdAt: Date.now(),
        })
        .run();
    }
    const res = await enqueueAgentRun('iss-test-1', 'agt-test-1');
    expect(res.skipped).toBe(false);
  });

  it('per-(issue,agent) 去重：已有 active issue run → skipped(already_active)', async () => {
    insertIssueRun('run-active-1', 'running');
    const res = await enqueueAgentRun('iss-test-1', 'agt-test-1');
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('already_active');
    expect(res.detail).toContain('已有进行中的 run');
    // 不同 agent 不受影响（multica 不误杀其他 agent）
    const res2 = await enqueueAgentRun('iss-test-1', 'agt-test-2');
    expect(res2.skipped).toBe(false);
  });
});
