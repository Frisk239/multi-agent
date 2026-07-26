import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock DB layer: control query results without mocking the functions under test ---
const mocks = vi.hoisted(() => ({
  selectGet: vi.fn(),
  selectAll: vi.fn(),
}));

vi.mock('./client.js', () => {
  const selectChain = () => ({
    from: () => ({
      where: () => ({
        get: mocks.selectGet,
      }),
      innerJoin: () => ({
        where: () => ({
          all: mocks.selectAll,
        }),
      }),
    }),
  });
  return {
    db: {
      select: selectChain,
    },
  };
});

vi.mock('./schema.js', () => ({
  squads: { id: 'id' },
  squadMembers: { agentId: 'agentId', squadId: 'squadId' },
  agents: { id: 'id', name: 'name' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

import { loadSquadDetail, getSquadLeaderId } from './squad-loader';

describe('squad-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadSquadDetail', () => {
    it('returns null when squad does not exist', () => {
      mocks.selectGet.mockReturnValue(null);
      expect(loadSquadDetail('non-existent-squad')).toBeNull();
    });

    it('returns full squad detail with members when squad exists', () => {
      mocks.selectGet.mockReturnValue({
        id: 'sqd-1',
        name: 'Alpha 小队',
        leaderId: 'agt-leader',
        operatingProtocol: '协作',
        missionDirective: '完成任务',
      });
      mocks.selectAll.mockReturnValue([
        { agentId: 'agt-1', name: 'Agent A' },
        { agentId: 'agt-2', name: 'Agent B' },
      ]);

      const result = loadSquadDetail('sqd-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('sqd-1');
      expect(result!.name).toBe('Alpha 小队');
      expect(result!.leaderId).toBe('agt-leader');
      expect(result!.members).toEqual([
        { agentId: 'agt-1', name: 'Agent A' },
        { agentId: 'agt-2', name: 'Agent B' },
      ]);
    });

    it('returns leaderId=null when squad has no leader (B3)', () => {
      mocks.selectGet.mockReturnValue({
        id: 'sqd-2',
        name: 'No Leader Squad',
        leaderId: undefined,  // DB returns undefined for nullable column
        operatingProtocol: null,
        missionDirective: null,
      });
      mocks.selectAll.mockReturnValue([]);

      const result = loadSquadDetail('sqd-2');
      expect(result).not.toBeNull();
      expect(result!.leaderId).toBeNull();
      expect(result!.members).toEqual([]);
    });
  });

  describe('getSquadLeaderId', () => {
    it('returns null when squad does not exist', () => {
      mocks.selectGet.mockReturnValue(null);
      expect(getSquadLeaderId('non-existent-squad')).toBeNull();
    });

    it('returns leaderId when squad exists', () => {
      mocks.selectGet.mockReturnValue({ leaderId: 'agt-leader-1' });
      expect(getSquadLeaderId('sqd-1')).toBe('agt-leader-1');
    });

    it('returns null when squad exists but has no leader', () => {
      mocks.selectGet.mockReturnValue({ leaderId: undefined });
      expect(getSquadLeaderId('sqd-no-leader')).toBeNull();
    });
  });
});
