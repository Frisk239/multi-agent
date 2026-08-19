import { describe, expect, it, vi } from 'vitest';
import { allBackends } from './registry.js';
import {
  evaluateRuntimePreflight,
  getCachedRuntimePreflightOutcome,
} from './preflight.js';
import type { RuntimeBackend, RuntimePreflightContext } from './types.js';

function fakeBackend(preflight?: RuntimeBackend['preflight']): RuntimeBackend {
  return {
    id: 'pi',
    label: 'Fake Pi',
    detect: async () => ({ installed: true, version: '1.0.0', path: '/bin/pi' }),
    preflight,
    execute: async () => ({ finalText: '', exitReason: 'failed' }),
  };
}

describe('runtime preflight contract', () => {
  it('G8-4a production adapters do not register an unproven probe', () => {
    expect(allBackends().every((backend) => backend.preflight === undefined)).toBe(true);
  });

  it('absent preflight stays not_available / unverified', async () => {
    const backend = fakeBackend();
    await expect(evaluateRuntimePreflight(backend)).resolves.toMatchObject({
      preflightStatus: 'not_available',
      runtimeVerification: 'unverified',
      detail: null,
    });
    expect(getCachedRuntimePreflightOutcome(backend)).toMatchObject({
      preflightStatus: 'not_available',
      runtimeVerification: 'unverified',
    });
  });

  it('only a passed safe preflight yields verified, with a narrow context', async () => {
    const preflight = vi.fn(async (context: RuntimePreflightContext) => {
      expect(Object.keys(context).sort()).toEqual(['signal', 'timeoutMs']);
      expect(context.signal.aborted).toBe(false);
      expect(context.timeoutMs).toBeGreaterThan(0);
      return { status: 'passed' as const };
    });
    const backend = fakeBackend(preflight);

    await expect(evaluateRuntimePreflight(backend)).resolves.toMatchObject({
      preflightStatus: 'passed',
      runtimeVerification: 'verified',
      detail: null,
    });
    expect(preflight).toHaveBeenCalledTimes(1);
  });

  it('a classified failure is cached as an unverified, fixed safe explanation', async () => {
    const backend = fakeBackend(async () => ({
      status: 'failed',
      reason: 'configuration_invalid',
    }));

    const outcome = await evaluateRuntimePreflight(backend);
    expect(outcome).toEqual({
      preflightStatus: 'failed',
      runtimeVerification: 'unverified',
      detail: '运行时安全预检未通过：请检查本机 CLI 的运行时配置后重试。',
    });
    expect(getCachedRuntimePreflightOutcome(backend)).toEqual(outcome);
  });
});
