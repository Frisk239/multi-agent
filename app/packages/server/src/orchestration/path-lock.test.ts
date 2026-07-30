import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock DB and transitive deps to prevent SQLite connection ---
const mocks = vi.hoisted(() => ({
  selectAll: vi.fn(),
}));

vi.mock('../db/client.js', () => {
  const selectChain = () => ({
    from: () => ({
      where: () => ({
        all: mocks.selectAll,
      }),
    }),
  });
  return {
    db: { select: selectChain, update: vi.fn() },
    sqlite: {},
  };
});

vi.mock('../db/schema.js', () => ({
  agentRuns: { status: 'status', id: 'id' },
  chatThreads: {},
  issues: {},
  projects: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('../runtime/resolve-run-cwd.js', () => ({
  normalizeProjectLocalPath: (p: string) => p.trim() || '',
  isUsableLocalDirectory: () => true,
  resolveRunCwd: vi.fn(),
}));

import {
  normalizePathLockKey,
  findRunningProjectLocalHolder,
  matchRunningProjectLocalHolder,
  pathLockSelfCheck,
} from './path-lock';

describe('path-lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizePathLockKey', () => {
    it('normalizes slashes to forward slashes and converts to lowercase', () => {
      const input = 'D:\\Code\\Multi-Agent\\Project';
      const key = normalizePathLockKey(input);
      expect(key).toBe('d:/code/multi-agent/project');
    });

    it('trims leading/trailing whitespace', () => {
      const input = '  /usr/local/repo  ';
      const key = normalizePathLockKey(input);
      expect(key).toBe('/usr/local/repo');
    });

    it('returns empty string for empty input', () => {
      expect(normalizePathLockKey('')).toBe('');
      expect(normalizePathLockKey('   ')).toBe('');
    });
  });

  describe('findRunningProjectLocalHolder', () => {
    it('returns null for empty path', () => {
      expect(findRunningProjectLocalHolder('')).toBeNull();
    });

    it('returns null when no running project_local runs exist', () => {
      mocks.selectAll.mockReturnValue([]);
      expect(findRunningProjectLocalHolder('/repo/path')).toBeNull();
    });

    it('returns the matching holder when a running run occupies the same path', () => {
      mocks.selectAll.mockReturnValue([
        {
          id: 'run-1',
          cwdMode: 'project_local',
          cwdPath: '/repo/path',
          issueId: 'iss-1',
          agentId: 'agt-1',
        },
      ]);
      const holder = findRunningProjectLocalHolder('/repo/path');
      expect(holder).not.toBeNull();
      expect(holder!.id).toBe('run-1');
      expect(holder!.issueId).toBe('iss-1');
      expect(holder!.agentId).toBe('agt-1');
    });

    it('excludes the specified run from matching', () => {
      mocks.selectAll.mockReturnValue([
        {
          id: 'run-self',
          cwdMode: 'project_local',
          cwdPath: '/repo/path',
          issueId: 'iss-1',
          agentId: 'agt-1',
        },
      ]);
      // Excluding 'run-self' should return null
      expect(findRunningProjectLocalHolder('/repo/path', 'run-self')).toBeNull();
    });

    it('skips runs without project_local cwdMode', () => {
      mocks.selectAll.mockReturnValue([
        {
          id: 'run-2',
          cwdMode: 'isolated',
          cwdPath: '/repo/path',
          issueId: null,
          agentId: 'agt-2',
        },
      ]);
      expect(findRunningProjectLocalHolder('/repo/path')).toBeNull();
    });

    it('skips runs with empty cwdPath', () => {
      mocks.selectAll.mockReturnValue([
        {
          id: 'run-3',
          cwdMode: 'project_local',
          cwdPath: '',
          issueId: null,
          agentId: 'agt-3',
        },
      ]);
      expect(findRunningProjectLocalHolder('/repo/path')).toBeNull();
    });
  });

  describe('matchRunningProjectLocalHolder', () => {
    it('matches Windows path variants without DB', () => {
      const holder = matchRunningProjectLocalHolder(
        'D:\\repo\\app',
        [
          {
            id: 'run-h',
            issueId: 'iss-1',
            agentId: 'ag-1',
            cwdPath: 'd:/repo/app',
          },
        ],
      );
      expect(holder?.id).toBe('run-h');
    });

    it('respects excludeRunId', () => {
      expect(
        matchRunningProjectLocalHolder(
          '/repo',
          [{ id: 'self', issueId: null, agentId: 'a', cwdPath: '/repo' }],
          'self',
        ),
      ).toBeNull();
    });
  });

  describe('pathLockSelfCheck', () => {
    it('detects same normalized path key', () => {
      const result = pathLockSelfCheck('/Repo/Path', '/repo/path');
      expect(result.sameKey).toBe(true);
      expect(result.keyA).toBe(result.keyB);
    });

    it('detects different path keys', () => {
      const result = pathLockSelfCheck('/repo/alpha', '/repo/beta');
      expect(result.sameKey).toBe(false);
      expect(result.keyA).not.toBe(result.keyB);
    });
  });
});
