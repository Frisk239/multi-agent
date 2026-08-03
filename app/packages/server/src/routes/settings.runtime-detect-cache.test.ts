/**
 * M3 · settings runtime detect 并发 + TTL 缓存。
 * /api/settings/status 被每页布局层调用；5 个 CLI 顺序 spawn 探测在 Windows 实测 3s+。
 * 修复 = Promise.all 并发 + 30s TTL 缓存（detectRuntimeCached）。
 * 断言：同 TTL 内多次 buildSettingsStatus 只探测一次；并发不放大调用数。
 */
import { describe, it, expect, vi } from 'vitest';

const detect = vi.hoisted(() => ({
  counts: {} as Record<string, number>,
  bump: (id: string) => {
    detect.counts[id] = (detect.counts[id] ?? 0) + 1;
  },
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
    getStatus: () => ({
      provider: 'sqlite-text',
      available: true,
      backend: 'sqlite',
      perProject: false,
      note: 'test',
      breakerOpen: false,
      breakerFailures: 0,
      breakerOpenUntil: null,
      degraded: false,
    }),
  },
}));

vi.mock('../runtime/registry.js', () => ({
  allBackends: () => [
    {
      id: 'fake-a',
      label: 'Fake A',
      detect: async () => {
        detect.bump('a');
        return { installed: true, version: '1.0', path: '/x/a' };
      },
    },
    {
      id: 'fake-b',
      label: 'Fake B',
      detect: async () => {
        detect.bump('b');
        return { installed: false, version: null, path: null };
      },
    },
  ],
}));

import { buildSettingsStatus } from './settings.js';

describe('M3 runtime detect 并发 + TTL 缓存（buildSettingsStatus）', () => {
  it('同 TTL 内多次调用只探测一次（缓存命中），且并发调用数不放大', async () => {
    detect.counts = {};
    const r1 = await buildSettingsStatus();
    const r2 = await buildSettingsStatus();
    const r3 = await buildSettingsStatus();

    // 三次调用累计只探测 2 个 backend 各一次
    expect(detect.counts).toEqual({ a: 1, b: 1 });

    // 检查项存在且结果稳定（两次返回同结构）
    expect(r1.checks.find((c) => c.id === 'runtime:fake-a')!.status).toBe('ok');
    expect(r2.checks.find((c) => c.id === 'runtime:fake-a')!.status).toBe('ok');
    expect(r3.checks.find((c) => c.id === 'runtime:fake-b')!.status).toBe('error');
  });
});
