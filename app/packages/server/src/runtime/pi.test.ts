import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionInput } from './types.js';

const mocks = vi.hoisted(() => ({
  resolveCmd: vi.fn(),
  versionOf: vi.fn(),
}));

vi.mock('./detect-path.js', () => ({
  resolveCmd: mocks.resolveCmd,
  versionOf: mocks.versionOf,
}));

import {
  PiBackend,
  PI_NOT_INSTALLED_ERROR,
  PI_NOT_IMPLEMENTED_ERROR,
} from './pi.js';

const baseInput: ExecutionInput = {
  prompt: 'hello',
  cwd: '/tmp',
  issueId: null,
  agentId: 'agt-pi',
  runId: 'run-pi',
};

describe('PiBackend (Slice 44 honest fail)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks execution as not implemented', () => {
    const backend = new PiBackend();
    expect(backend.executionImplemented).toBe(false);
    expect(backend.id).toBe('pi');
  });

  it('detect reflects PATH via resolveCmd', async () => {
    mocks.resolveCmd.mockResolvedValue('/usr/bin/pi');
    mocks.versionOf.mockResolvedValue('pi 0.1.0');
    const det = await new PiBackend().detect();
    expect(det).toEqual({
      installed: true,
      path: '/usr/bin/pi',
      version: 'pi 0.1.0',
    });
    expect(mocks.resolveCmd).toHaveBeenCalledWith('PI_PATH', ['pi']);
  });

  it('execute fails when not installed (no fake completed)', async () => {
    mocks.resolveCmd.mockResolvedValue(null);
    const events: unknown[] = [];
    const result = await new PiBackend().execute(
      baseInput,
      (e) => events.push(e),
      new AbortController().signal,
    );
    expect(result.exitReason).toBe('failed');
    expect(result.error).toBe(PI_NOT_INSTALLED_ERROR);
    expect(result.finalText).toBe('');
    expect(result.error).toMatch(/未安装|PI_PATH/);
  });

  it('execute fails when installed but adapter not implemented (no fake completed)', async () => {
    mocks.resolveCmd.mockResolvedValue('/usr/bin/pi');
    mocks.versionOf.mockResolvedValue('0.9.0');
    const events: unknown[] = [];
    const result = await new PiBackend().execute(
      baseInput,
      (e) => events.push(e),
      new AbortController().signal,
    );
    expect(result.exitReason).toBe('failed');
    expect(result.error).toBe(PI_NOT_IMPLEMENTED_ERROR);
    expect(result.finalText).toBe('');
    expect(result.error).toMatch(/尚未实现|禁止假完成/);
    // must not emit misleading "starting" progress that implies real work
    expect(events).toEqual([]);
  });
});
