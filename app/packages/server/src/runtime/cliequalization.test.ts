import { describe, it, expect, vi } from 'vitest';
import { parseOpencodeLine } from './opencode';
import { parseCursorLine } from './cursor';
import { parseGrokLine, buildGrokAgentArgs } from './grok';
import type { LineContext } from './spawn-line';
import type { AgentEvent } from './types';

describe('Slice 19 (S5): CLI Equalization Adapters', () => {
  describe('Opencode Line Parsing & Session Resume', () => {
    it('parses JSON stream with session_id and token usage', () => {
      const events: AgentEvent[] = [];
      const ctx: LineContext = { resultText: null, usage: null, providerSessionId: null };
      const line = JSON.stringify({
        type: 'message',
        text: 'hello opencode',
        session_id: 'sess-opencode-123',
        input_tokens: 120,
        output_tokens: 45,
      });

      parseOpencodeLine(line, (e) => events.push(e), ctx);

      expect(ctx.providerSessionId).toBe('sess-opencode-123');
      expect(ctx.usage).toEqual({ input: 120, output: 45, cacheRead: null, cacheWrite: null });
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ type: 'message', role: 'assistant', text: 'hello opencode' });
    });

    it('extracts token usage from plain text regex', () => {
      const events: AgentEvent[] = [];
      const ctx: LineContext = { resultText: null, usage: null, providerSessionId: null };

      parseOpencodeLine('Prompt tokens: 450, Completion tokens: 180', (e) => events.push(e), ctx);

      expect(ctx.usage).toEqual({ input: 450, output: 180 });
    });

    it('extracts session ID from text regex', () => {
      const events: AgentEvent[] = [];
      const ctx: LineContext = { resultText: null, usage: null, providerSessionId: null };

      parseOpencodeLine('Session ID: sess-text-99999', (e) => events.push(e), ctx);

      expect(ctx.providerSessionId).toBe('sess-text-99999');
    });
  });

  describe('Cursor Line Parsing & Session Resume', () => {
    it('captures providerSessionId from cursor stream-json', () => {
      const events: AgentEvent[] = [];
      const ctx: LineContext = { resultText: null, usage: null, providerSessionId: null };
      const line = JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'cursor-sess-abc',
      });

      parseCursorLine(line, (e) => events.push(e), ctx);

      expect(ctx.providerSessionId).toBe('cursor-sess-abc');
      expect(events[0]).toEqual({ type: 'log', text: '[cursor] init' });
    });

    it('captures result usage camelCase (Slice 60)', () => {
      const events: AgentEvent[] = [];
      const ctx: LineContext = { resultText: null, usage: null, providerSessionId: null };
      parseCursorLine(
        JSON.stringify({
          type: 'result',
          result: 'ok',
          session_id: 'cursor-sess-usage',
          usage: { inputTokens: 9, outputTokens: 2, cacheReadTokens: 1, cacheWriteTokens: 0 },
        }),
        (e) => events.push(e),
        ctx,
      );
      expect(ctx.providerSessionId).toBe('cursor-sess-usage');
      expect(ctx.usage).toEqual({
        input: 9,
        output: 2,
        cacheRead: 1,
        cacheWrite: 0,
      });
    });
  });

  describe('Grok Line Parsing & Args', () => {
    it('buildsGrokAgentArgs ignores resumeSessionId (Slice 50: supportsSessionResume=false)', () => {
      const args = buildGrokAgentArgs(
        {
          prompt: 'do work',
          model: 'grok-3',
          thinkingLevel: 'high',
          resumeSessionId: 'grok-sess-456',
        },
        { print: true }
      );

      expect(args).toContain('-p');
      expect(args).toContain('--model');
      expect(args).toContain('grok-3');
      expect(args).toContain('--effort');
      expect(args).toContain('high');
      // Slice 50：不装会 — 忽略 resume，不传假 --resume
      expect(args).not.toContain('--resume');
      expect(args).not.toContain('grok-sess-456');
    });
  });
});
