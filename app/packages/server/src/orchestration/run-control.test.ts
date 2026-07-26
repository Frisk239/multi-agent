import { describe, it, expect, afterEach } from 'vitest';
import { registerRunAbort, abortRun, hasRunAbort, clearRunAbort, listActiveRunIds } from './run-control';

describe('run-control', () => {
  afterEach(() => {
    // Clean up any registered runs to prevent state leakage
    for (const id of listActiveRunIds()) {
      clearRunAbort(id);
    }
  });

  it('registers and retrieves AbortSignal for a run', () => {
    const runId = 'run-ctrl-1';
    const signal = registerRunAbort(runId);

    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);
    expect(hasRunAbort(runId)).toBe(true);
    expect(listActiveRunIds()).toContain(runId);

    clearRunAbort(runId);
    expect(hasRunAbort(runId)).toBe(false);
  });

  it('aborts registered run controller when abortRun is called', () => {
    const runId = 'run-ctrl-2';
    const signal = registerRunAbort(runId);

    expect(abortRun(runId)).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(hasRunAbort(runId)).toBe(false);
  });

  it('returns false when abortRun is called on non-existent runId', () => {
    expect(abortRun('non-existent-run')).toBe(false);
  });
});
