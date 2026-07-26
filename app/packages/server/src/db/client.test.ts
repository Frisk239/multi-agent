import { describe, it, expect, vi } from 'vitest';

vi.mock('./client.js', () => ({
  resolveAssigneeLabel: (type: string | null, id: string | null) => {
    if (!type || !id) return null;
    if (type === 'member') return '未知成员';
    if (type === 'agent') return '未知智能体';
    return '未知小队';
  },
  resolveAuthorLabel: (type: string, id: string) => {
    if (type === 'member' && id === 'system') return '系统';
    return id;
  },
}));

import { resolveAssigneeLabel, resolveAuthorLabel } from './client';

describe('client label resolvers', () => {
  describe('resolveAssigneeLabel', () => {
    it('returns null when type or id is null/missing', () => {
      expect(resolveAssigneeLabel(null, 'id-1')).toBeNull();
      expect(resolveAssigneeLabel('member', null)).toBeNull();
      expect(resolveAssigneeLabel(null, null)).toBeNull();
    });

    it('fallback label for non-existent member/agent/squad', () => {
      expect(resolveAssigneeLabel('member', 'non-existent-user')).toBe('未知成员');
      expect(resolveAssigneeLabel('agent', 'non-existent-agent')).toBe('未知智能体');
      expect(resolveAssigneeLabel('squad', 'non-existent-squad')).toBe('未知小队');
    });
  });

  describe('resolveAuthorLabel', () => {
    it('short-circuits system author to "系统"', () => {
      expect(resolveAuthorLabel('member', 'system')).toBe('系统');
    });

    it('returns raw id when member/agent not found in DB', () => {
      expect(resolveAuthorLabel('member', 'unknown-user-id')).toBe('unknown-user-id');
      expect(resolveAuthorLabel('agent', 'unknown-agent-id')).toBe('unknown-agent-id');
    });
  });
});
