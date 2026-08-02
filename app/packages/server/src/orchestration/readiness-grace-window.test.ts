import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DetectResult, RuntimeBackend } from '../runtime/types.js';

const mocks = vi.hoisted(() => {
  const agents = { id: 'id', __table: 'agents' as const };
  const agentRuns = {
    agentId: 'agentId',
    status: 'status',
    __table: 'agentRuns' as const,
  };
  return {
    agents,
    agentRuns,
    agentRow: null as null | {
      id: string;
      runtime: string;
      concurrency: number;
    },
    runningCount: 0,
    resolveWorkspaceCwd: vi.fn(),
  };
});

vi.mock('../db/schema.js', () => ({
  agents: mocks.agents,
  agentRuns: mocks.agentRuns,
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: (_cols?: unknown) => ({
      from: (table: unknown) => ({
        where: () => ({
          get: () => {
            if (table === mocks.agents) return mocks.agentRow;
            if (table === mocks.agentRuns) return { cnt: mocks.runningCount };
            return null;
          },
        }),
      }),
    }),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  sql: Object.assign((..._args: unknown[]) => 'COUNT', { raw: vi.fn() }),
}));

vi.mock('../workspace-cwd.js', () => ({
  resolveWorkspaceCwd: mocks.resolveWorkspaceCwd,
}));

// 不 mock runtime/registry：走真实 backend 类（pi / claude-code），即 G1-3 验收的
// 「至少一个 runtime 的回归」——真实 class + 真实 computeAgentReadiness 路径。
import { computeAgentReadiness } from './readiness.js';
import { getBackend } from '../runtime/registry.js';

const SUCCESS: DetectResult = { installed: true, path: '/bin/pi', version: '1.0.0' };
const MISSING: DetectResult = { installed: false, path: null, version: null };

const T0 = new Date('2026-08-02T00:00:00Z');

describe('G1-3 CLI 探测失败宽限窗（学 hermes _check_fn_cached，registry.py:145）', () => {
  beforeEach(() => {
    // 仅伪造 Date：本模块用 Date.now() 判断宽限窗，其余计时器保持真实
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    delete process.env.MA_ISSUE_USE_WORKSPACE_CWD;
    mocks.runningCount = 0;
    mocks.agentRow = { id: 'agt-pi-1', runtime: 'pi', concurrency: 1 };
    mocks.resolveWorkspaceCwd.mockReturnValue({
      configured: false,
      exists: false,
      path: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('成功探测后 60s 内 installed=false 抖动 → serve 上次成功，不误报 runtime 缺失（pi 回归）', async () => {
    const backend = getBackend('pi') as RuntimeBackend;
    let installed = true;
    const spy = vi
      .spyOn(backend, 'detect')
      .mockImplementation(async () => (installed ? SUCCESS : MISSING));

    const rd1 = await computeAgentReadiness('agt-g1-3-flake-pi');
    expect(rd1!.status).toBe('ready');
    expect(rd1!.runtimeInstalled).toBe(true);

    installed = false; // CLI 瞬态失败（如 PATH 抖动 / 进程崩溃）
    const rd2 = await computeAgentReadiness('agt-g1-3-flake-pi');
    expect(rd2!.status).toBe('ready');
    expect(rd2!.runtimeInstalled).toBe(true);
    expect(rd2!.status).not.toBe('runtime_missing');
    // 失败不缓存：宽限窗内每次调用仍全量重探（而不是短路 serve 缓存）
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('成功探测后 60s 内 detect 抛错 → serve 上次成功，不产生 error 状态（claude-code 回归）', async () => {
    mocks.agentRow = { id: 'agt-cc-1', runtime: 'claude-code', concurrency: 1 };
    const backend = getBackend('claude-code') as RuntimeBackend;
    let throwNow = false;
    vi.spyOn(backend, 'detect').mockImplementation(async () => {
      if (throwNow) throw new Error('probe crashed: ENOENT spawn claude');
      return SUCCESS;
    });

    const rd1 = await computeAgentReadiness('agt-g1-3-throw-cc');
    expect(rd1!.status).toBe('ready');

    throwNow = true;
    const rd2 = await computeAgentReadiness('agt-g1-3-throw-cc');
    expect(rd2!.status).toBe('ready');
    expect(rd2!.status).not.toBe('error');
    expect(rd2!.runtimeInstalled).toBe(true);
  });

  it('宽限窗过期后 installed=false → 如实报 runtime_missing', async () => {
    const backend = getBackend('pi') as RuntimeBackend;
    let installed = true;
    vi.spyOn(backend, 'detect').mockImplementation(async () =>
      installed ? SUCCESS : MISSING,
    );

    const rd1 = await computeAgentReadiness('agt-g1-3-expired');
    expect(rd1!.status).toBe('ready');

    installed = false;
    vi.setSystemTime(new Date(T0.getTime() + 61_000));
    const rd2 = await computeAgentReadiness('agt-g1-3-expired');
    expect(rd2!.status).toBe('runtime_missing');
    expect(rd2!.runtimeInstalled).toBe(false);
  });

  it('宽限窗过期后 detect 抛错 → 如实报 status=error', async () => {
    const backend = getBackend('pi') as RuntimeBackend;
    let throwNow = false;
    vi.spyOn(backend, 'detect').mockImplementation(async () => {
      if (throwNow) throw new Error('probe crashed: ENOENT spawn pi');
      return SUCCESS;
    });

    const rd1 = await computeAgentReadiness('agt-g1-3-expired-throw');
    expect(rd1!.status).toBe('ready');

    throwNow = true;
    vi.setSystemTime(new Date(T0.getTime() + 61_000));
    const rd2 = await computeAgentReadiness('agt-g1-3-expired-throw');
    expect(rd2!.status).toBe('error');
    expect(rd2!.detail).toMatch(/probe crashed/);
  });

  it('无成功先例 → 失败立即如实上报，不 serve 任何缓存', async () => {
    const backend = getBackend('pi') as RuntimeBackend;
    vi.spyOn(backend, 'detect').mockImplementation(async () => MISSING);
    const rd = await computeAgentReadiness('agt-g1-3-fresh-missing');
    expect(rd!.status).toBe('runtime_missing');

    vi.spyOn(backend, 'detect').mockImplementation(async () => {
      throw new Error('probe crashed');
    });
    const rdErr = await computeAgentReadiness('agt-g1-3-fresh-throw');
    expect(rdErr!.status).toBe('error');
  });

  it('最近一次成功刷新宽限窗（窗口锚点 = 最新成功，非首次成功）', async () => {
    const backend = getBackend('pi') as RuntimeBackend;
    let installed = true;
    vi.spyOn(backend, 'detect').mockImplementation(async () =>
      installed ? SUCCESS : MISSING,
    );

    const rd1 = await computeAgentReadiness('agt-g1-3-refresh');
    expect(rd1!.status).toBe('ready'); // t0 成功，窗口锚点 t0

    vi.setSystemTime(new Date(T0.getTime() + 30_000));
    installed = false;
    const rd2 = await computeAgentReadiness('agt-g1-3-refresh');
    expect(rd2!.status).toBe('ready'); // 30s 内抖动 → serve

    vi.setSystemTime(new Date(T0.getTime() + 70_000));
    installed = true;
    const rd3 = await computeAgentReadiness('agt-g1-3-refresh');
    expect(rd3!.status).toBe('ready'); // t0+70s 再成功 → 窗口锚点刷新为 t0+70s

    vi.setSystemTime(new Date(T0.getTime() + 100_000));
    installed = false;
    const rd4 = await computeAgentReadiness('agt-g1-3-refresh');
    expect(rd4!.status).toBe('ready'); // t0+100s 距最新成功 30s → 仍在宽限内
    expect(rd4!.runtimeInstalled).toBe(true);
  });
});
