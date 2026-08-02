import { describe, it, expect, vi } from 'vitest';
import { parseOpencodeLine, buildOpencodeArgs } from './opencode';
import { parseCursorLine, buildCursorArgs } from './cursor';
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

    it('buildOpencodeArgs injects Multica --session for resume', () => {
      const args = buildOpencodeArgs({
        prompt: 'continue work',
        model: 'claude-sonnet',
        thinkingLevel: 'medium',
        resumeSessionId: 'oc-sess-abc',
      });
      expect(args.slice(0, 2)).toEqual(['run', '--format']);
      expect(args).toContain('--model');
      expect(args).toContain('claude-sonnet');
      expect(args).toContain('--variant');
      expect(args).toContain('medium');
      const sessionIdx = args.indexOf('--session');
      expect(sessionIdx).toBeGreaterThanOrEqual(0);
      expect(args[sessionIdx + 1]).toBe('oc-sess-abc');
      expect(args[args.length - 1]).toBe('continue work');
    });

    it('buildOpencodeArgs omits --session when resume empty', () => {
      const args = buildOpencodeArgs({
        prompt: 'fresh',
        resumeSessionId: '  ',
      });
      expect(args).not.toContain('--session');
      expect(args).toContain('fresh');
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

    it('buildCursorArgs injects Multica --resume for resumeSessionId', () => {
      const args = buildCursorArgs({
        prompt: 'keep going',
        model: 'gpt-5',
        thinkingLevel: 'high',
        resumeSessionId: 'cur-sess-xyz',
      });
      expect(args[0]).toBe('-p');
      expect(args[1]).toBe('keep going');
      expect(args).toContain('--model');
      expect(args).toContain('gpt-5');
      const resumeIdx = args.indexOf('--resume');
      expect(resumeIdx).toBeGreaterThanOrEqual(0);
      expect(args[resumeIdx + 1]).toBe('cur-sess-xyz');
    });

    it('buildCursorArgs omits --resume when no session', () => {
      const args = buildCursorArgs({ prompt: 'start', resumeSessionId: null });
      expect(args).not.toContain('--resume');
    });
  });

  describe('Grok Line Parsing & Args', () => {
    it('buildsGrokAgentArgs 顶层形态（G1-2 fail-closed：-p/model/effort 顶层，不注入 --resume）', () => {
      const args = buildGrokAgentArgs(
        {
          prompt: 'do work',
          model: 'grok-3',
          thinkingLevel: 'high',
          resumeSessionId: 'grok-sess-456',
        },
        { print: true }
      );

      expect(args[0]).toBe('--no-auto-update');
      // `-p` 是 `--single <PROMPT>` 别名：prompt 紧跟 -p 作为其值（实测 0.2.118）
      expect(args[1]).toBe('-p');
      expect(args[2]).toBe('do work');
      expect(args).toContain('--model');
      expect(args).toContain('grok-3');
      expect(args).toContain('--effort');
      expect(args).toContain('high');
      // 诚实性：resumeSessionId 存在也不注入 --resume（ACP 未实现）
      expect(args).not.toContain('--resume');
      expect(args).not.toContain('grok-sess-456');
      // 不再使用 agent 子命令（0.2.118 不接受子命令后位置 prompt）
      expect(args).not.toContain('agent');
    });

    it('parseGrokLine 纯文本行 → assistant message（G1-2：产出可观测，不丢在 log）', () => {
      const events: unknown[] = [];
      parseGrokLine('跑通了', (e) => events.push(e));
      expect(events).toEqual([{ type: 'message', role: 'assistant', text: '跑通了' }]);
    });
  });
});
