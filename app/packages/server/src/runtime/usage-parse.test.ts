import { describe, it, expect } from 'vitest';
import { extractTokenUsage, parseUsageFromResultLine } from './usage-parse';

describe('usage-parse', () => {
  describe('extractTokenUsage', () => {
    it('extracts snake_case token properties', () => {
      const blob = {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 10,
      };
      const usage = extractTokenUsage(blob);
      expect(usage).toEqual({
        input: 100,
        output: 50,
        cacheRead: 20,
        cacheWrite: 10,
      });
    });

    it('extracts camelCase token properties', () => {
      const blob = {
        inputTokens: 200,
        outputTokens: 80,
        cacheReadTokens: 15,
        cacheWriteTokens: 5,
      };
      const usage = extractTokenUsage(blob);
      expect(usage).toEqual({
        input: 200,
        output: 80,
        cacheRead: 15,
        cacheWrite: 5,
      });
    });

    it('extracts prompt_tokens and completion_tokens aliases', () => {
      const blob = {
        prompt_tokens: 300,
        completion_tokens: 120,
      };
      const usage = extractTokenUsage(blob);
      expect(usage).toEqual({
        input: 300,
        output: 120,
        cacheRead: null,
        cacheWrite: null,
      });
    });

    it('returns null for non-object or null input', () => {
      expect(extractTokenUsage(null)).toBeNull();
      expect(extractTokenUsage(undefined)).toBeNull();
      expect(extractTokenUsage('string')).toBeNull();
      expect(extractTokenUsage(123)).toBeNull();
    });

    it('returns null if object has no token fields', () => {
      expect(extractTokenUsage({ foo: 'bar' })).toBeNull();
    });

    it('parses numeric strings correctly', () => {
      const blob = {
        input_tokens: '150',
        output_tokens: '75',
      };
      const usage = extractTokenUsage(blob);
      expect(usage).toEqual({
        input: 150,
        output: 75,
        cacheRead: null,
        cacheWrite: null,
      });
    });
  });

  describe('parseUsageFromResultLine', () => {
    it('parses top-level usage object', () => {
      const line = {
        type: 'result',
        usage: {
          input_tokens: 500,
          output_tokens: 250,
        },
      };
      const usage = parseUsageFromResultLine(line);
      expect(usage).toEqual({
        input: 500,
        output: 250,
        cacheRead: null,
        cacheWrite: null,
      });
    });

    it('aggregates modelUsage map if present', () => {
      const line = {
        type: 'result',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        modelUsage: {
          'claude-3-5-sonnet': {
            input_tokens: 200,
            output_tokens: 100,
          },
          'gpt-4o': {
            input_tokens: 300,
            output_tokens: 150,
          },
        },
      };
      const usage = parseUsageFromResultLine(line);
      expect(usage).toEqual({
        input: 600,
        output: 300,
        cacheRead: null,
        cacheWrite: null,
      });
    });

    it('returns null if no usage information present', () => {
      expect(parseUsageFromResultLine({})).toBeNull();
    });
  });
});
