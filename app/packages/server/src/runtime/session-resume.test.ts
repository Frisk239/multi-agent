import { describe, it, expect, vi } from 'vitest';
import {
  finalizeSessionFields,
  isSessionPoisonText,
  resolvePriorSession,
  runtimeSupportsSessionResume,
  sessionResumeCapabilityMatrix,
} from './session-resume';
import { getBackend, allBackends } from './registry';
import type { RuntimeId } from '@ma/shared';

// 全 runtime 均已过能力门：resolvePriorSession 会查 DB。
// 空链 mock：无 prior session 行 → fresh（不落真库文件）。
vi.mock('../db/client.js', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    all: () => [],
    get: () => undefined,
  };
  return {
    db: {
      select: () => chain,
    },
  };
});

describe('Slice 50 session resume capability matrix', () => {
  it('claude-code, opencode, cursor 支持真 resume；grok/pi 诚实 false（G1-2）', () => {
    const matrix = sessionResumeCapabilityMatrix();
    expect(matrix).toEqual([
      { runtime: 'claude-code', supportsSessionResume: true },
      { runtime: 'opencode', supportsSessionResume: true },
      { runtime: 'cursor', supportsSessionResume: true },
      { runtime: 'grok', supportsSessionResume: false },
      { runtime: 'pi', supportsSessionResume: true },
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

  // A9（2026-07-30）：grok 转 supportsSessionResume=true；pi 也已转真 backend。
  // 全 runtime 均过能力门；pi 在空 DB 下走完整决策链 → fresh。
  it('pi passes the capability gate and resolves fresh against empty DB', () => {
    expect(runtimeSupportsSessionResume('pi')).toBe(true);
    const d = resolvePriorSession({
      id: 'run-pi',
      runtime: 'pi',
      agentId: 'ag-x',
      issueId: 'iss-x',
      kind: 'issue',
    });
    expect(d.status).toBe('fresh');
    expect(d.resumeSessionId).toBeNull();
    expect(d.reason).toMatch(/无可 resume/);
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
