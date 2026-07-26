import { describe, it, expect, vi } from 'vitest';

// Mock DB to prevent SQLite connection at import time
vi.mock('../db/client.js', () => ({
  db: { query: {}, select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  sqlite: {},
}));

import { readAgentsContextFromRoot } from './issue-prompt-context';

describe('issue-prompt-context', () => {
  describe('readAgentsContextFromRoot', () => {
    it('returns null for empty, null, or undefined root path', () => {
      expect(readAgentsContextFromRoot(null)).toBeNull();
      expect(readAgentsContextFromRoot(undefined)).toBeNull();
      expect(readAgentsContextFromRoot('')).toBeNull();
      expect(readAgentsContextFromRoot('   ')).toBeNull();
    });

    it('returns null for non-existent root path', () => {
      expect(readAgentsContextFromRoot('/non/existent/path/123')).toBeNull();
    });
  });
});
