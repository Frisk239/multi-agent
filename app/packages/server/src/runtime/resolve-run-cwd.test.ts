import { describe, it, expect } from 'vitest';
import { normalizeProjectLocalPath, isUsableLocalDirectory } from './resolve-run-cwd';
import { resolve } from 'node:path';

describe('resolve-run-cwd helpers', () => {
  describe('normalizeProjectLocalPath', () => {
    it('returns empty string for empty input', () => {
      expect(normalizeProjectLocalPath('')).toBe('');
      expect(normalizeProjectLocalPath('   ')).toBe('');
    });

    it('returns normalized absolute path for valid path', () => {
      const input = resolve('.', 'test-folder');
      const normalized = normalizeProjectLocalPath(input);
      expect(normalized).toBe(input);
    });
  });

  describe('isUsableLocalDirectory', () => {
    it('returns true for existing directory', () => {
      expect(isUsableLocalDirectory(process.cwd())).toBe(true);
    });

    it('returns false for non-existent path', () => {
      expect(isUsableLocalDirectory('/non/existent/directory/path/12345')).toBe(false);
    });
  });
});
