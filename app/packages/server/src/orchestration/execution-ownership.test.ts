import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  values: vi.fn(),
  conflict: vi.fn(),
  where: vi.fn(),
  run: vi.fn(() => ({ changes: 1 })),
}));

vi.mock('../db/client.js', () => ({
  db: {
    insert: () => ({
      values: (values: unknown) => {
        mocks.values(values);
        return {
          onConflictDoUpdate: (config: unknown) => {
            mocks.conflict(config);
            return { run: mocks.run };
          },
        };
      },
    }),
    delete: () => ({
      where: (condition: unknown) => {
        mocks.where(condition);
        return { run: mocks.run };
      },
    }),
  },
}));

vi.mock('../db/schema.js', () => ({
  runExecutionOwners: { runId: 'runId' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => args,
}));

import {
  clearExecutionOwnership,
  recordExecutionOwnership,
  verifyExecutionOwnership,
} from './execution-ownership.js';

describe('execution ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.run.mockReturnValue({ changes: 1 });
  });

  it('persists only PID + non-secret start fingerprint while the run is active', () => {
    const result = recordExecutionOwnership(
      'run-1',
      4242,
      'D:/code/project',
      123,
      () => ({ pid: 4242, platform: 'win32', fingerprint: 'hash-only', canKillTree: true }),
    );

    expect(result).toEqual({ recorded: true });
    expect(mocks.values).toHaveBeenCalledWith({
      runId: 'run-1',
      pid: 4242,
      fingerprint: 'hash-only',
      cwdPath: 'D:/code/project',
      recordedAt: 123,
    });
  });

  it('does not write a PID when no OS identity can be sampled', () => {
    const result = recordExecutionOwnership('run-1', 4242, 'D:/code/project', 123, () => null);
    expect(result).toEqual({ recorded: false, reason: 'identity_unavailable' });
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it('deletes active ownership when an executor settles normally', () => {
    clearExecutionOwnership('run-1');
    expect(mocks.where).toHaveBeenCalled();
  });

  it('will only verify a complete owner whose live fingerprint matches', () => {
    const row = {
      pid: 4242,
      fingerprint: 'expected',
    };
    expect(verifyExecutionOwnership(row, () => ({
      pid: 4242,
      platform: 'win32',
      fingerprint: 'expected',
      canKillTree: true,
    }))).toEqual({ verified: true, pid: 4242 });
    expect(verifyExecutionOwnership(row, () => ({
      pid: 4242,
      platform: 'win32',
      fingerprint: 'reused-pid',
      canKillTree: true,
    }))).toEqual({
      verified: false,
      reason: 'fingerprint_mismatch',
      pid: 4242,
    });
    expect(verifyExecutionOwnership({ ...row, pid: null })).toEqual({
      verified: false,
      reason: 'missing_owner',
      pid: null,
    });
  });
});
