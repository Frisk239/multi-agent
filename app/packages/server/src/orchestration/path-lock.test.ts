import { describe, it, expect } from 'vitest';
import { normalizePathLockKey } from './path-lock';

describe('path-lock', () => {
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
});
