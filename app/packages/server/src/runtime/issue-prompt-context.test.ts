import { describe, it, expect } from 'vitest';
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
