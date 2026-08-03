/**
 * G1-5 · settings memory health：pgvector 启动降级标记（degraded）的透出与诊断分支。
 *
 * 模式：mock db client（链式空结果）+ mock memoryManager.getStatus 受控返回
 * （对齐 ops.test.ts），直接驱动 buildMemoryHealth / buildSettingsStatus。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const memoryStatus = vi.hoisted(() => ({
  getStatus: vi.fn(),
}));

vi.mock('../db/client.js', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    all: () => [],
    get: () => undefined,
  };
  return {
    db: { select: () => chain },
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
  };
});

vi.mock('../memory/manager.js', () => ({
  memoryManager: {
    getStatus: () => memoryStatus.getStatus(),
  },
}));

vi.mock('../runtime/registry.js', () => ({
  allBackends: () => [],
}));

import { buildMemoryHealth, buildSettingsStatus } from './settings.js';

function baseStatus(overrides: Record<string, unknown> = {}) {
  return {
    provider: 'sqlite-text',
    available: true,
    backend: 'sqlite',
    perProject: false,
    note: 'test',
    breakerOpen: false,
    breakerFailures: 0,
    breakerOpenUntil: null,
    degraded: false,
    ...overrides,
  };
}

describe('G1-5 settings memory health (degraded passthrough)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildMemoryHealth: degraded 状态与原因透出；未降级时为 false/undefined', () => {
    memoryStatus.getStatus.mockReturnValue(
      baseStatus({ degraded: true, degradedNote: 'pgvector 初始化失败：conn refused' }),
    );
    const health = buildMemoryHealth();
    expect(health.degraded).toBe(true);
    expect(health.degradedNote).toBe('pgvector 初始化失败：conn refused');

    memoryStatus.getStatus.mockReturnValue(baseStatus());
    const clean = buildMemoryHealth();
    expect(clean.degraded).toBe(false);
    expect(clean.degradedNote).toBeUndefined();
  });

  it('buildSettingsStatus: degraded → memory 检查 warn + 固定 detail', async () => {
    memoryStatus.getStatus.mockReturnValue(
      baseStatus({
        provider: 'sqlite-text',
        backend: 'sqlite',
        degraded: true,
        degradedNote: 'pgvector 初始化失败：boom',
      }),
    );
    const res = await buildSettingsStatus();
    const memCheck = res.checks.find((c) => c.id === 'memory');
    expect(memCheck).toBeDefined();
    expect(memCheck!.status).toBe('warn');
    expect(memCheck!.detail).toBe('MEMORY_PROVIDER=pgvector 初始化失败，已回退 sqlite-text');
  });

  it('buildSettingsStatus: 未降级 → memory 检查 ok', async () => {
    memoryStatus.getStatus.mockReturnValue(baseStatus());
    const res = await buildSettingsStatus();
    const memCheck = res.checks.find((c) => c.id === 'memory');
    expect(memCheck!.status).toBe('ok');
    expect(memCheck!.detail).toBe('provider=sqlite-text');
  });
});
