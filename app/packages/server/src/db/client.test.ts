import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock DB layer so real functions execute with controlled query results ---
const mocks = vi.hoisted(() => ({
  userSync: vi.fn(),
  agentSync: vi.fn(),
  squadSync: vi.fn(),
}));

vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      pragma() { /* no-op */ }
    },
  };
});

vi.mock('drizzle-orm/better-sqlite3', () => ({
  drizzle: vi.fn(() => ({
    query: {
      users: {
        findFirst: () => ({ sync: mocks.userSync }),
      },
      agents: {
        findFirst: () => ({ sync: mocks.agentSync }),
      },
      squads: {
        findFirst: () => ({ sync: mocks.squadSync }),
      },
    },
  })),
}));

vi.mock('./schema.js', () => ({}));

import { resolveAssigneeLabel, resolveAuthorLabel } from './client';

describe('client label resolvers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveAssigneeLabel', () => {
    it('returns null when type or id is null/missing', () => {
      expect(resolveAssigneeLabel(null, 'id-1')).toBeNull();
      expect(resolveAssigneeLabel('member', null)).toBeNull();
      expect(resolveAssigneeLabel(null, null)).toBeNull();
      // DB should not be called when null-guarded
      expect(mocks.userSync).not.toHaveBeenCalled();
      expect(mocks.agentSync).not.toHaveBeenCalled();
      expect(mocks.squadSync).not.toHaveBeenCalled();
    });

    it('returns user name for existing member', () => {
      mocks.userSync.mockReturnValue({ name: '张三' });
      expect(resolveAssigneeLabel('member', 'usr-1')).toBe('张三');
      expect(mocks.userSync).toHaveBeenCalledTimes(1);
    });

    it('returns fallback "未知成员" when member not found', () => {
      mocks.userSync.mockReturnValue(null);
      expect(resolveAssigneeLabel('member', 'usr-missing')).toBe('未知成员');
    });

    it('returns agent name for existing agent', () => {
      mocks.agentSync.mockReturnValue({ name: 'Claude' });
      expect(resolveAssigneeLabel('agent', 'agt-1')).toBe('Claude');
      expect(mocks.agentSync).toHaveBeenCalledTimes(1);
    });

    it('returns fallback "未知智能体" when agent not found', () => {
      mocks.agentSync.mockReturnValue(null);
      expect(resolveAssigneeLabel('agent', 'agt-missing')).toBe('未知智能体');
    });

    it('returns squad name for existing squad', () => {
      mocks.squadSync.mockReturnValue({ name: 'Alpha 小队' });
      expect(resolveAssigneeLabel('squad', 'sqd-1')).toBe('Alpha 小队');
      expect(mocks.squadSync).toHaveBeenCalledTimes(1);
    });

    it('returns fallback "未知小队" when squad not found', () => {
      mocks.squadSync.mockReturnValue(null);
      expect(resolveAssigneeLabel('squad', 'sqd-missing')).toBe('未知小队');
    });
  });

  describe('resolveAuthorLabel', () => {
    it('short-circuits system author to "系统"', () => {
      expect(resolveAuthorLabel('member', 'system')).toBe('系统');
      // Should not hit DB for system
      expect(mocks.userSync).not.toHaveBeenCalled();
    });

    it('returns member name for existing user', () => {
      mocks.userSync.mockReturnValue({ name: '李四' });
      expect(resolveAuthorLabel('member', 'usr-2')).toBe('李四');
    });

    it('returns raw id when member not found in DB', () => {
      mocks.userSync.mockReturnValue(null);
      expect(resolveAuthorLabel('member', 'unknown-user-id')).toBe('unknown-user-id');
    });

    it('returns agent name for existing agent', () => {
      mocks.agentSync.mockReturnValue({ name: 'Gemini' });
      expect(resolveAuthorLabel('agent', 'agt-3')).toBe('Gemini');
    });

    it('returns raw id when agent not found in DB', () => {
      mocks.agentSync.mockReturnValue(null);
      expect(resolveAuthorLabel('agent', 'unknown-agent-id')).toBe('unknown-agent-id');
    });
  });
});
