/**
 * W5 · run-worker 故障注入测试（原 run-worker.ts 807+ 行零测试 import）。
 *
 * 覆盖：claim 竞争 / prepare-lease 过期协作 / cancel 竞争（spawn 前终态复核）/
 * 心跳 touch / wall timeout / 完成路径。
 *
 * 模式：真实迁移 DB（createTestDb + seedTestFixtures），getBackend 换可控 fake
 * backend，tick() 直接驱动（W5 已导出）。生产入口 startRunWorker 不动。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import {
  activityLogs,
  agents,
  agentRuns,
  chatMessages,
  chatThreads,
  comments,
  runMessages,
  workspaces,
} from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { cancelRunById } from './run-service.js';
import { failStalePrepareLeaseRuns } from './stale-runs.js';
import type { ExecutionResult } from '../runtime/types.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
  // fake backend：每次测试可配置 execute 行为
  executeImpl: null as ((input: unknown, onEvent: (e: unknown) => void) => Promise<ExecutionResult>) | null,
  recordExecutionOwnership: vi.fn((..._args: unknown[]) => ({ recorded: true })),
  clearExecutionOwnership: vi.fn((..._args: unknown[]) => undefined),
  eventPublish: vi.fn<(event: unknown) => void>(),
  parseAndDispatchSubagents: vi.fn<(parentRunId: string, text: string) => Promise<void>>(async () => undefined),
  memorySyncRunCompleted: vi.fn<(input: unknown) => void>(),
  backendId: 'opencode' as string,
  supportsThinkingLevel: undefined as boolean | undefined,
}));

// Intentionally synthetic format-only fixtures; none are usable credentials.
const fakeBearer = 'g8_bearer_fixture_1234567890';
const fakeAssigned = 'g8_assigned_fixture_1234567890';

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
  eventBus: {
    publish: (event: unknown) => state.eventPublish(event),
    on: vi.fn(),
  },
}));

// fake backend：claim 后 execute 由测试注入行为
vi.mock('../runtime/registry.js', () => ({
  getBackend: () => ({
    id: state.backendId,
    supportsThinkingLevel: state.supportsThinkingLevel,
    async execute(input: unknown, onEvent: (e: unknown) => void) {
      if (!state.executeImpl) {
        return { finalText: '', exitReason: 'failed', error: 'no executeImpl' };
      }
      return state.executeImpl(input, onEvent);
    },
  }),
}));

vi.mock('../runtime/prompt.js', () => ({
  resolveRunPrompt: () => 'test prompt',
}));

vi.mock('../runtime/resolve-run-cwd.js', () => ({
  resolveRunCwd: () => ({ path: process.cwd(), mode: 'env' as const, exists: true, error: null }),
}));

vi.mock('../runtime/session-resume.js', () => ({
  runtimeSupportsSessionResume: () => false,
  sessionResumeCapabilityMatrix: () => [],
  isSessionPoisonText: () => false,
  resolvePriorSession: () => ({
    resumeSessionId: null,
    status: 'fresh',
    reason: 'test',
    sourceRunId: null,
  }),
  finalizeSessionFields: (opts: { exitReason?: string | null }) => ({
    resumedSessionId: null,
    sessionResumeStatus: null,
    exitReason: opts.exitReason ?? null,
    errorText: null,
  }),
}));

vi.mock('../memory/manager.js', () => ({
  memoryManager: {
    syncRunCompleted: (input: unknown) => state.memorySyncRunCompleted(input),
    ambientCapture: vi.fn(),
    getStatus: vi.fn(),
  },
}));

vi.mock('../orchestration/inbox-writer.js', () => ({
  notifyCommentCreated: vi.fn(),
  notifyRunTerminal: vi.fn(),
  notifyEnqueueSkipped: vi.fn(),
}));

vi.mock('../orchestration/comment-trigger.js', () => ({
  triggerFromComment: () => [],
}));

vi.mock('../orchestration/subagent-dispatch.js', () => ({
  parseAndDispatchSubagents: (parentRunId: string, text: string) => (
    state.parseAndDispatchSubagents(parentRunId, text)
  ),
}));

vi.mock('./execution-ownership.js', () => ({
  recordExecutionOwnership: (runId: string, pid: number, cwdPath: string | null) => (
    state.recordExecutionOwnership(runId, pid, cwdPath)
  ),
  clearExecutionOwnership: (runId: string) => state.clearExecutionOwnership(runId),
}));

vi.mock('../process-health.js', () => ({
  markWorkerStarted: vi.fn(),
  markWorkerStopped: vi.fn(),
  noteWorkerTick: vi.fn(),
}));

import { tick } from './run-worker.js';

function insertQueuedRun(id: string, agentId = 'agt-test-1', priority = 'none'): void {
  const now = Date.now();
  state.db!.insert(agentRuns)
    .values({
      id,
      issueId: 'iss-test-1',
      agentId,
      runtime: 'opencode',
      status: 'queued',
      kind: 'issue',
      priority: priority as 'urgent' | 'high' | 'medium' | 'low' | 'none',
      createdAt: now,
    })
    .run();
}

function insertQueuedChatRun(id: string, threadId = 'thr-secret'): void {
  const now = Date.now();
  state.db!.insert(chatThreads)
    .values({
      id: threadId,
      agentId: 'agt-test-1',
      title: 'Secret scrub fixture',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  state.db!.insert(agentRuns)
    .values({
      id,
      issueId: null,
      agentId: 'agt-test-1',
      runtime: 'opencode',
      status: 'queued',
      kind: 'chat',
      priority: 'none',
      chatThreadId: threadId,
      createdAt: now,
    })
    .run();
}

function runRow(id: string): { status: string; lastHeartbeatAt: number | null; finishedAt: number | null; error: string | null } {
  return state.db!.select().from(agentRuns).where(eq(agentRuns.id, id)).get() as any;
}

const flush = () => new Promise((r) => setTimeout(r, 20));

describe('W5 run-worker fault injection', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    state.executeImpl = null;
    state.backendId = 'opencode';
    state.supportsThinkingLevel = undefined;
    state.recordExecutionOwnership.mockClear();
    state.clearExecutionOwnership.mockClear();
    state.eventPublish.mockClear();
    state.parseAndDispatchSubagents.mockClear();
    state.memorySyncRunCompleted.mockClear();
    process.env.MA_ISSUE_TIMEOUT_MS = '0';
  });

  afterEach(async () => {
    // executeRun 是 fire-and-forget：等其异步尾巴（activity/评论/memory 写入）飞完，
    // 否则清理 DB 时会触发 unhandled rejection（db down）
    await new Promise((r) => setTimeout(r, 300));
    delete process.env.MA_ISSUE_TIMEOUT_MS;
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('claim race: two concurrent ticks claim a queued run exactly once', async () => {
    insertQueuedRun('run-race');
    let executeCalls = 0;
    state.executeImpl = async () => {
      executeCalls += 1;
      return { finalText: 'ok', exitReason: 'completed' };
    };
    await Promise.all([tick(), tick()]);
    await flush();
    expect(executeCalls).toBe(1);
    expect(runRow('run-race').status).toBe('completed');
  });

  it('follow-up queued after running completes can be claimed', async () => {
    const now = Date.now();
    state.db!.insert(agentRuns)
      .values({
        id: 'run-current',
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'completed',
        kind: 'issue',
        startedAt: now - 1_000,
        finishedAt: now,
        createdAt: now - 1_000,
      })
      .run();
    insertQueuedRun('run-followup');
    state.executeImpl = async () => ({ finalText: 'ok', exitReason: 'completed' });
    await tick();
    await flush();
    expect(runRow('run-followup').status).toBe('completed');
  });

  it('G6-1 priority claim: urgent run is claimed before an earlier low-priority run', async () => {
    // low 先入队（createdAt 更早），urgent 后入队 → 认领顺序应 urgent 先
    const now = Date.now();
    state.db!.insert(agentRuns)
      .values({
        id: 'run-low',
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'queued',
        kind: 'issue',
        priority: 'low',
        createdAt: now - 1_000,
      })
      .run();
    insertQueuedRun('run-urgent', 'agt-test-1', 'urgent');
    const claimedOrder: string[] = [];
    state.executeImpl = async (input) => {
      claimedOrder.push((input as { runId: string }).runId);
      return { finalText: 'ok', exitReason: 'completed' };
    };
    await tick();
    // executeRun 首段含 await import（stale-runs 动态加载），全量负载下首次
    // 转译可能 >20ms；用 vi.waitFor 等两条 execute 链收敛（顺序仍由微任务
    // FIFO 保证 = claim 顺序投影）
    await vi.waitFor(
      () => {
        expect(claimedOrder).toEqual(['run-urgent', 'run-low']);
      },
      { timeout: 5000, interval: 50 },
    );
    expect(runRow('run-urgent').status).toBe('completed');
    expect(runRow('run-low').status).toBe('completed');
  });

  it('G6-1 priority tie: same priority keeps FCFS by createdAt', async () => {
    const now = Date.now();
    state.db!.insert(agentRuns)
      .values({
        id: 'run-tie-early',
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'queued',
        kind: 'issue',
        priority: 'medium',
        createdAt: now - 1_000, // 更早入队
      })
      .run();
    state.db!.insert(agentRuns)
      .values({
        id: 'run-tie-late',
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'queued',
        kind: 'issue',
        priority: 'medium',
        createdAt: now,
      })
      .run();
    const claimedOrder: string[] = [];
    state.executeImpl = async (input) => {
      claimedOrder.push((input as { runId: string }).runId);
      return { finalText: 'ok', exitReason: 'completed' };
    };
    await tick();
    await vi.waitFor(
      () => {
        expect(claimedOrder).toEqual(['run-tie-early', 'run-tie-late']);
      },
      { timeout: 5000, interval: 50 },
    );
  });

  it('prepare-lease expiry: half-claimed run is swept to failed and tick does not touch it', async () => {
    // 半 claim 态：running + 过期 prepare lease（claim 后 execute 前被 sweeper 抢终态的场景）
    const now = Date.now();
    state.db!.insert(agentRuns)
      .values({
        id: 'run-half',
        issueId: 'iss-test-1',
        agentId: 'agt-test-1',
        runtime: 'opencode',
        status: 'running',
        kind: 'issue',
        prepareLeaseExpiresAt: now - 5_000,
        lastHeartbeatAt: now,
        createdAt: now,
      })
      .run();
    let executeCalls = 0;
    state.executeImpl = async () => {
      executeCalls += 1;
      return { finalText: 'x', exitReason: 'completed' };
    };
    const failed = failStalePrepareLeaseRuns();
    expect(failed).toBe(1);
    expect(runRow('run-half').status).toBe('failed');
    await tick();
    await flush();
    expect(executeCalls).toBe(0); // 终态复核：failed 不再被 spawn
  });

  it('cancel race: run cancelled while executing does not fake-success', async () => {
    insertQueuedRun('run-cancel');
    let release: (r: ExecutionResult) => void = () => {};
    state.executeImpl = () => new Promise((resolve) => { release = resolve; });
    void tick();
    await flush();
    // 已 claim 且 execute 挂起 → cancel
    const cancel = cancelRunById('run-cancel');
    expect(cancel.ok).toBe(true);
    release({ finalText: 'late result', exitReason: 'completed' });
    // 等 executeRun 的异步尾巴（activity/评论写入）飞完，避免 afterEach 清库时 unhandled
    await new Promise((r) => setTimeout(r, 200));
    const row = runRow('run-cancel');
    expect(row.status).toBe('cancelled'); // 不伪成功
    const msgs = state.db!.select().from(runMessages).where(eq(runMessages.runId, 'run-cancel')).all();
    expect(msgs.length).toBe(0); // 取消后不落消息副作用
  });

  it('heartbeat: events during execution touch lastHeartbeatAt', async () => {
    insertQueuedRun('run-hb');
    const before = Date.now();
    let release: (r: ExecutionResult) => void = () => {};
    state.executeImpl = (_, onEvent) => {
      // 模拟执行中产生事件（触发 onEvent → touchRunHeartbeat）
      setTimeout(() => {
        (onEvent as (e: { type: string; text: string }) => void)({ type: 'log', text: 'working...' });
        release({ finalText: 'done', exitReason: 'completed' });
      }, 30);
      return new Promise((resolve) => { release = resolve; });
    };
    await tick();
    await new Promise((r) => setTimeout(r, 80)); // 等 fake 的 30ms 事件 + 完成
    expect(runRow('run-hb').status).toBe('completed');
    expect(runRow('run-hb').lastHeartbeatAt).not.toBeNull();
    expect(runRow('run-hb').lastHeartbeatAt!).toBeGreaterThanOrEqual(before);
  });

  it('wall timeout: issue run exceeding MA_ISSUE_TIMEOUT_MS fails instead of hanging', async () => {
    process.env.MA_ISSUE_TIMEOUT_MS = '120';
    insertQueuedRun('run-timeout');
    state.executeImpl = async (input) => {
      const timeoutMs = (input as { timeoutMs: number | null }).timeoutMs;
      expect(timeoutMs).toBe(120); // 预算正确传入 backend
      await new Promise((r) => setTimeout(r, 200)); // 模拟 CLI 超时不返回
      return { finalText: '', exitReason: 'failed', error: 'wall timeout exceeded' };
    };
    await tick();
    await new Promise((r) => setTimeout(r, 300)); // 等 fake 的 200ms 超时返回
    const row = runRow('run-timeout');
    expect(row.status).toBe('failed');
    expect(row.error).toContain('wall timeout');
  });

  it('completion path: message events land in run_message and run completes', async () => {
    insertQueuedRun('run-ok');
    state.executeImpl = async (_, onEvent) => {
      (onEvent as (e: { type: string; role?: string; text: string }) => void)({
        type: 'message',
        role: 'assistant',
        text: 'hello from fake',
      });
      return { finalText: 'hello from fake', exitReason: 'completed' };
    };
    await tick();
    await flush();
    expect(runRow('run-ok').status).toBe('completed');
    const msgs = state.db!.select().from(runMessages).where(eq(runMessages.runId, 'run-ok')).all();
    // 至少含 fake 发的 assistant 消息；完成路径还会追加 system 消息（如自动沉淀记忆），条数不锁死
    expect(msgs.some((m) => m.kind === 'assistant' && m.body.includes('hello from fake'))).toBe(true);
  });

  it('G8-5 scrubs messages, tool events, streams, final fan-out, and replay API before persistence or publish', async () => {
    insertQueuedRun('run-secret-transcript');
    const rawToolArgs = { api_key: fakeAssigned, nested: { Authorization: `Bearer ${fakeBearer}` } };
    state.executeImpl = async (_, onEvent) => {
      const emit = onEvent as (e: any) => void;
      emit({ type: 'message', role: 'assistant', text: `message api_key=${fakeAssigned}` });
      emit({ type: 'tool_start', name: 'fixture_tool', args: rawToolArgs });
      emit({ type: 'tool_end', name: 'fixture_tool', result: `access_token=${fakeAssigned}` });
      // Deliberately split prefix/body/terminator over three deltas.
      emit({ type: 'message_delta', text: 'live Bear' });
      emit({ type: 'message_delta', text: `er ${fakeBearer}` });
      emit({ type: 'message_delta', text: '\nvisible text' });
      emit({ type: 'log', text: 'log access_' });
      emit({ type: 'log', text: `token=${fakeAssigned}` });
      emit({ type: 'log', text: '\nlog visible' });
      return { finalText: `final Bearer ${fakeBearer}`, exitReason: 'completed' };
    };

    await tick();
    await vi.waitFor(() => {
      expect(runRow('run-secret-transcript').status).toBe('completed');
    });

    // Runtime-owned input must not be mutated while the published / persisted
    // clone is redacted.
    expect(rawToolArgs.api_key).toBe(fakeAssigned);
    expect(rawToolArgs.nested.Authorization).toBe(`Bearer ${fakeBearer}`);

    const messages = state.db!
      .select()
      .from(runMessages)
      .where(eq(runMessages.runId, 'run-secret-transcript'))
      .all();
    const comment = state.db!
      .select()
      .from(comments)
      .where(eq(comments.issueId, 'iss-test-1'))
      .orderBy(comments.createdAt)
      .all()
      .find((row) => row.authorType === 'agent');
    const persisted = JSON.stringify({ messages, comment });
    expect(persisted).not.toContain(fakeBearer);
    expect(persisted).not.toContain(fakeAssigned);
    expect(persisted).toContain('[redacted]');

    const published = state.eventPublish.mock.calls.map(([event]) => event as { type?: string });
    const eventPayload = JSON.stringify(published);
    expect(eventPayload).not.toContain(fakeBearer);
    expect(eventPayload).not.toContain(fakeAssigned);
    expect(published.some((event) => event.type === 'run:message')).toBe(true);
    expect(published.some((event) => event.type === 'runtime:event')).toBe(true);
    expect(published.some((event) => event.type === 'run:progress')).toBe(true);
    expect(published.some((event) => event.type === 'run:stream_chunk')).toBe(true);

    // finalText goes to subagent parsing and memory even when no adapter emits a
    // matching message event; both must see the same safe value.
    expect(JSON.stringify(state.parseAndDispatchSubagents.mock.calls)).not.toContain(fakeBearer);
    expect(JSON.stringify(state.memorySyncRunCompleted.mock.calls)).not.toContain(fakeBearer);
    expect(state.parseAndDispatchSubagents).toHaveBeenCalledWith(
      'run-secret-transcript',
      `final ${'[redacted]'}`,
    );

    const { buildApp } = await import('../app.js');
    const app = await buildApp();
    try {
      const replay = await app.inject({
        method: 'GET',
        url: '/api/runs/run-secret-transcript/messages?afterSeq=0&limit=100',
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.body).not.toContain(fakeBearer);
      expect(replay.body).not.toContain(fakeAssigned);
      expect(replay.body).toContain('[redacted]');
    } finally {
      await app.close();
    }
  });

  it('G8-5 scrubs CLI / child-result error before activity, agent_runs, and run:failed fan-out', async () => {
    insertQueuedRun('run-secret-failed');
    state.executeImpl = async () => ({
      finalText: '',
      exitReason: 'failed',
      error: `access_token=${fakeAssigned}`,
    });

    await tick();
    await vi.waitFor(() => {
      expect(runRow('run-secret-failed').status).toBe('failed');
    });

    const row = state.db!.select().from(agentRuns).where(eq(agentRuns.id, 'run-secret-failed')).get()!;
    const activities = state.db!
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.issueId, 'iss-test-1'))
      .all();
    const domainEvents = state.eventPublish.mock.calls.map(([event]) => event as { type?: string });
    const serialized = JSON.stringify({ row, activities, domainEvents });
    expect(serialized).not.toContain(fakeAssigned);
    expect(serialized).toContain('[redacted]');
    expect(domainEvents.some((event) => event.type === 'run:failed')).toBe(true);
  });

  it('G8-5 sends a redacted terminal chat error instead of raw child stderr', async () => {
    insertQueuedChatRun('run-secret-chat');
    state.executeImpl = async () => ({
      finalText: '',
      exitReason: 'failed',
      error: `Bearer ${fakeBearer}`,
    });

    await tick();
    await vi.waitFor(() => {
      expect(runRow('run-secret-chat').status).toBe('failed');
    });

    const row = state.db!.select().from(agentRuns).where(eq(agentRuns.id, 'run-secret-chat')).get()!;
    const chat = state.db!
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.runId, 'run-secret-chat'))
      .all();
    const serialized = JSON.stringify({ row, chat, events: state.eventPublish.mock.calls });
    expect(serialized).not.toContain(fakeBearer);
    expect(serialized).toContain('[redacted]');
    expect(chat).toHaveLength(1);
  });

  it('G8-2 persists the backend PID after spawn and clears ownership after settle', async () => {
    insertQueuedRun('run-owner');
    state.executeImpl = async (input) => {
      const onProcessStarted = (input as { onProcessStarted?: (pid: number) => void }).onProcessStarted;
      expect(onProcessStarted).toBeTypeOf('function');
      onProcessStarted!(4242);
      return { finalText: 'ok', exitReason: 'completed' };
    };

    await tick();
    await vi.waitFor(() => {
      expect(runRow('run-owner').status).toBe('completed');
    });

    expect(state.recordExecutionOwnership).toHaveBeenCalledWith('run-owner', 4242, process.cwd());
    expect(state.clearExecutionOwnership).toHaveBeenCalledWith('run-owner');
  });

  it('G8-3 missing sensitive Agent envRef fails before backend execute', async () => {
    state.db!
      .update(agents)
      .set({
        envVars: JSON.stringify([
          { key: 'API_TOKEN', value: '', envRef: 'MA_G8_WORKER_MISSING_TOKEN' },
        ]),
      })
      .where(eq(agents.id, 'agt-test-1'))
      .run();
    delete process.env.MA_G8_WORKER_MISSING_TOKEN;
    insertQueuedRun('run-missing-agent-env');
    let executeCalls = 0;
    state.executeImpl = async () => {
      executeCalls += 1;
      return { finalText: 'should not run', exitReason: 'completed' };
    };

    await tick();
    await vi.waitFor(() => {
      const row = runRow('run-missing-agent-env') as any;
      expect(row.status).toBe('failed');
      expect(row.failureReason).toBe('missing_required_env_ref');
      expect(row.error).toContain('宿主环境缺少 MA_G8_WORKER_MISSING_TOKEN');
    });
    expect(executeCalls).toBe(0);
  });

  it('G8-3 missing sensitive MCP envRef fails before backend writes/executes config', async () => {
    state.db!
      .update(agents)
      .set({
        mcpServers: JSON.stringify({
          github: { headers: { Authorization: '${env:MA_G8_WORKER_MISSING_MCP}' } },
        }),
      })
      .where(eq(agents.id, 'agt-test-1'))
      .run();
    delete process.env.MA_G8_WORKER_MISSING_MCP;
    insertQueuedRun('run-missing-mcp-env');
    let executeCalls = 0;
    state.executeImpl = async () => {
      executeCalls += 1;
      return { finalText: 'should not run', exitReason: 'completed' };
    };

    await tick();
    await vi.waitFor(() => {
      const row = runRow('run-missing-mcp-env') as any;
      expect(row.status).toBe('failed');
      expect(row.failureReason).toBe('missing_required_env_ref');
      expect(row.error).toContain('宿主环境缺少 MA_G8_WORKER_MISSING_MCP');
    });
    expect(executeCalls).toBe(0);
  });

  // —— G2-5：workspace 全局在途并发配额（只拦 claim，不拦 enqueue）——
  function setGlobalQuota(n: number | null): void {
    state.db!
      .update(workspaces)
      .set({ maxConcurrentRuns: n })
      .where(eq(workspaces.id, 'ws-local'))
      .run();
  }

  function insertRunningRun(id: string, agentId = 'agt-test-1'): void {
    const now = Date.now();
    state.db!.insert(agentRuns)
      .values({
        id,
        issueId: 'iss-test-1',
        agentId,
        runtime: 'opencode',
        status: 'running',
        kind: 'issue',
        startedAt: now,
        lastHeartbeatAt: now,
        createdAt: now,
      })
      .run();
  }

  it('G2-5 global quota: running 已达上限时 queued 不 claim（保持排队）', async () => {
    setGlobalQuota(1);
    insertRunningRun('run-global-holder'); // 全局 running=1 = 配额
    insertQueuedRun('run-global-blocked');
    let executeCalls = 0;
    state.executeImpl = async () => {
      executeCalls += 1;
      return { finalText: 'ok', exitReason: 'completed' };
    };
    await tick();
    await flush();
    expect(executeCalls).toBe(0);
    expect(runRow('run-global-blocked').status).toBe('queued');
  });

  it('G2-5 global quota: 同一 tick 内不超发（配额 1 + 两条 queued → 仅 claim 1 条）', async () => {
    setGlobalQuota(1);
    insertQueuedRun('run-gq-a');
    insertQueuedRun('run-gq-b');
    let executeCalls = 0;
    let release: (r: ExecutionResult) => void = () => {};
    state.executeImpl = () => {
      executeCalls += 1;
      return new Promise((resolve) => {
        release = resolve;
      });
    };
    await tick();
    await flush();
    expect(executeCalls).toBe(1); // 本 tick 只 claim 1 条
    expect(runRow('run-gq-a').status).toBe('running');
    expect(runRow('run-gq-b').status).toBe('queued'); // 未超发，余量留给下一 tick
    release({ finalText: 'ok', exitReason: 'completed' });
    await new Promise((r) => setTimeout(r, 100));
  });

  it('G2-5 global quota: 配额 null = 不限（两条 queued 均 claim）', async () => {
    setGlobalQuota(null);
    insertQueuedRun('run-gq-null-a');
    insertQueuedRun('run-gq-null-b');
    let executeCalls = 0;
    state.executeImpl = async () => {
      executeCalls += 1;
      return { finalText: 'ok', exitReason: 'completed' };
    };
    await tick();
    await flush();
    expect(executeCalls).toBe(2);
    expect(runRow('run-gq-null-a').status).toBe('completed');
    expect(runRow('run-gq-null-b').status).toBe('completed');
  });

  it('Pi / undeclared runtime: thinkingLevel 不写 [thinking] 假 log', async () => {
    state.backendId = 'pi';
    state.supportsThinkingLevel = undefined;
    state.db!.update(agents).set({ thinkingLevel: 'high' }).where(eq(agents.id, 'agt-test-1')).run();
    insertQueuedRun('run-pi-thinking');
    state.executeImpl = async () => ({ finalText: 'ok', exitReason: 'completed' });
    await tick();
    await flush();
    expect(runRow('run-pi-thinking').status).toBe('completed');
    const published = JSON.stringify(state.eventPublish.mock.calls);
    expect(published).not.toContain('[thinking]');
  });

  it('claude/grok: supportsThinkingLevel + 非空 thinkingLevel 才写 [thinking] log', async () => {
    state.backendId = 'claude-code';
    state.supportsThinkingLevel = true;
    state.db!.update(agents).set({ thinkingLevel: 'high' }).where(eq(agents.id, 'agt-test-1')).run();
    insertQueuedRun('run-claude-thinking');
    state.executeImpl = async () => ({ finalText: 'ok', exitReason: 'completed' });
    await tick();
    await flush();
    expect(runRow('run-claude-thinking').status).toBe('completed');
    const published = JSON.stringify(state.eventPublish.mock.calls);
    expect(published).toContain('[thinking] high');
  });
});
