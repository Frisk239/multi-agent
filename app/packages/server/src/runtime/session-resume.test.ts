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
  it('only claude-code declares supportsSessionResume=true', () => {
    const matrix = sessionResumeCapabilityMatrix();
    expect(matrix).toEqual([
      { runtime: 'claude-code', supportsSessionResume: true },
      { runtime: 'opencode', supportsSessionResume: false },
      { runtime: 'cursor', supportsSessionResume: false },
      { runtime: 'grok', supportsSessionResume: false },
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

  it('non-claude resolvePriorSession is unsupported without DB', () => {
    for (const runtime of ['opencode', 'cursor', 'grok', 'pi'] as RuntimeId[]) {
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

  it('forceFresh on unsupported runtime still force_fresh (matrix unchanged)', () => {
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
    // 能力矩阵仍 false
    expect(runtimeSupportsSessionResume('opencode')).toBe(false);
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
