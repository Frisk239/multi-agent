import { describe, it, expect } from 'vitest';
import {
  finalizeSessionFields,
  isSessionPoisonText,
  resolvePriorSession,
  runtimeSupportsSessionResume,
  sessionResumeCapabilityMatrix,
} from './session-resume';
import { getBackend, allBackends } from './registry';
import type { RuntimeId } from '@ma/shared';

describe('Slice 50 session resume capability matrix', () => {
  it('claude-code, opencode, and cursor declare supportsSessionResume=true', () => {
    const matrix = sessionResumeCapabilityMatrix();
    expect(matrix).toEqual([
      { runtime: 'claude-code', supportsSessionResume: true },
      { runtime: 'opencode', supportsSessionResume: true },
      { runtime: 'cursor', supportsSessionResume: true },
      { runtime: 'grok', supportsSessionResume: true },
      { runtime: 'pi', supportsSessionResume: false },
    ]);
  });

  it('getBackend.supportsSessionResume matches matrix', () => {
    for (const row of sessionResumeCapabilityMatrix()) {
      const b = getBackend(row.runtime);
      expect(b.supportsSessionResume === true).toBe(row.supportsSessionResume);
      expect(runtimeSupportsSessionResume(row.runtime)).toBe(row.supportsSessionResume);
    }
    for (const b of allBackends()) {
      expect(typeof b.supportsSessionResume === 'boolean' || b.supportsSessionResume === undefined).toBe(
        true,
      );
    }
  });

  it('unknown runtime is not resumable', () => {
    expect(runtimeSupportsSessionResume('unknown-runtime')).toBe(false);
  });

  // A9（2026-07-30）：grok 转为 supportsSessionResume=true，已不属于 unsupported。
  // 只剩 pi（执行未实现）走 capability gate 短路，不查 DB。
  it('unsupported runtimes resolvePriorSession without DB', () => {
    for (const runtime of ['pi'] as RuntimeId[]) {
      const d = resolvePriorSession({
        id: `run-${runtime}`,
        runtime,
        agentId: 'ag-x',
        issueId: 'iss-x',
        kind: 'issue',
      });
      expect(d.status).toBe('unsupported');
      expect(d.resumeSessionId).toBeNull();
      expect(d.reason).toMatch(/不支持真 session resume/);
    }
  });

  it('opencode/cursor are no longer blocked as unsupported by capability gate', () => {
    expect(runtimeSupportsSessionResume('opencode')).toBe(true);
    expect(runtimeSupportsSessionResume('cursor')).toBe(true);
    // forceFresh path exercises resolvePriorSession without depending on prior rows.
    for (const runtime of ['opencode', 'cursor'] as RuntimeId[]) {
      const d = resolvePriorSession({
        id: `run-ff-${runtime}`,
        runtime,
        agentId: 'ag-x',
        issueId: 'iss-x',
        kind: 'issue',
        forceFresh: true,
      });
      expect(d.status).toBe('force_fresh');
      expect(d.resumeSessionId).toBeNull();
      expect(d.reason).toMatch(/force_fresh|强制/);
    }
  });

  it('finalize keeps unsupported status', () => {
    const fin = finalizeSessionFields({
      planned: {
        resumeSessionId: null,
        status: 'unsupported',
        reason: 'no',
        sourceRunId: null,
      },
      emittedSessionId: 'whatever',
      exitReason: 'completed',
    });
    expect(fin.sessionResumeStatus).toBe('unsupported');
    expect(fin.resumedSessionId).toBeNull();
  });

  it('finalize resume_miss path still works for supported runtimes', () => {
    const miss = finalizeSessionFields({
      planned: {
        resumeSessionId: 'sess-old',
        status: 'resumed',
        reason: 'test',
        sourceRunId: 'r0',
      },
      emittedSessionId: 'sess-new',
      exitReason: 'failed',
      errorText: 'boom',
    });
    expect(miss.sessionResumeStatus).toBe('resume_miss');
    expect(miss.providerSessionId).toBeNull();
  });

  it('poison heuristics unchanged', () => {
    expect(isSessionPoisonText('Error: prompt is too long')).toBe(true);
    expect(isSessionPoisonText('network timeout')).toBe(false);
  });

  // Slice 67
  it('forceFresh skips resume binding even for claude-code', () => {
    const d = resolvePriorSession({
      id: 'run-ff',
      runtime: 'claude-code',
      agentId: 'ag-x',
      issueId: 'iss-x',
      kind: 'issue',
      forceFresh: true,
      rerunOfRunId: 'run-src',
    });
    expect(d.resumeSessionId).toBeNull();
    expect(d.status).toBe('force_fresh');
    expect(d.reason).toMatch(/force_fresh|强制/);
    expect(d.sourceRunId).toBeNull();
  });

  it('sessionResumeStatus=force_fresh same as forceFresh flag', () => {
    const d = resolvePriorSession({
      id: 'run-ff2',
      runtime: 'claude-code',
      agentId: 'ag-x',
      issueId: 'iss-x',
      kind: 'issue',
      sessionResumeStatus: 'force_fresh',
    });
    expect(d.resumeSessionId).toBeNull();
    expect(d.status).toBe('force_fresh');
  });

  it('forceFresh on opencode still force_fresh (capability true, skip binding)', () => {
    const d = resolvePriorSession({
      id: 'run-ff-op',
      runtime: 'opencode',
      agentId: 'ag-x',
      issueId: 'iss-x',
      kind: 'issue',
      forceFresh: true,
    });
    expect(d.resumeSessionId).toBeNull();
    expect(d.status).toBe('force_fresh');
    expect(runtimeSupportsSessionResume('opencode')).toBe(true);
  });

  it('finalize keeps force_fresh status', () => {
    const fin = finalizeSessionFields({
      planned: {
        resumeSessionId: null,
        status: 'force_fresh',
        reason: 'user',
        sourceRunId: null,
      },
      emittedSessionId: 'sess-new',
      exitReason: 'completed',
    });
    expect(fin.sessionResumeStatus).toBe('force_fresh');
    expect(fin.resumedSessionId).toBeNull();
    expect(fin.providerSessionId).toBe('sess-new');
  });
});
