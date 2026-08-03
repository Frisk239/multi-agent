import { describe, it, expect, vi } from 'vitest';
import { parseOpencodeLine, buildOpencodeArgs } from './opencode';
import { parseCursorLine, buildCursorArgs } from './cursor';
import { buildGrokAgentArgs } from './grok';
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

    // G3-4b：custom_args 插在 prompt 位置参数之前（opencode run prompt 是末尾位置参数）
    it('buildOpencodeArgs 注入 customArgs 且排在 prompt 前', () => {
      const args = buildOpencodeArgs({
        prompt: 'do work',
        resumeSessionId: null,
        customArgs: ['--dangerously-skip-permissions', '--models', 'gpt-5'],
      });
      const promptIdx = args.lastIndexOf('do work');
      expect(promptIdx).toBe(args.length - 1);
      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).toContain('--models');
      expect(args).toContain('gpt-5');
    });

    it('buildOpencodeArgs 无 customArgs 时 prompt 仍为末尾', () => {
      const args = buildOpencodeArgs({ prompt: 'solo', resumeSessionId: null });
      expect(args[args.length - 1]).toBe('solo');
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

    // G3-4b：custom_args 追加 argv 尾（cursor-agent flag 均可后置）
    it('buildCursorArgs 注入 customArgs 追加尾部', () => {
      const args = buildCursorArgs({
        prompt: 'go',
        resumeSessionId: null,
        customArgs: ['--experimental', '--no-use-server'],
      });
      expect(args.slice(-2)).toEqual(['--experimental', '--no-use-server']);
      expect(args).toContain('go');
    });
  });

  describe('Grok ACP Args（G1-2 收官，2026-08-03）', () => {
    it('buildsGrokAgentArgs ACP 形态：--no-auto-update agent --always-approve [--effort] stdio；model 不走 argv', () => {
      const args = buildGrokAgentArgs({ thinkingLevel: 'high', customArgs: null });

      expect(args).toEqual([
        '--no-auto-update',
        'agent',
        '--always-approve',
        '--effort',
        'high',
        'stdio',
      ]);
      // 对齐 multica grok.go：model 经 session/set_model，argv 不含 --model
      expect(args).not.toContain('--model');
    });

    it('customArgs 注入 stdio 之前；被锁 flag（--model/--resume/-p）过滤不破坏 ACP 契约', () => {
      const args = buildGrokAgentArgs({
        thinkingLevel: null,
        customArgs: ['--verbose', '--model', 'grok-3', '--resume', 'sess-x', '-p', 'print-it', '--yolo'],
      });
      // `-p`/`--yolo` 是 standalone 屏蔽（值透传，对齐 multica grokBlockedArgs）；
      // `--model <v>`/`--resume <v>` 带值屏蔽（连值一起吞）
      expect(args).toEqual([
        '--no-auto-update',
        'agent',
        '--always-approve',
        '--verbose',
        'print-it',
        'stdio',
      ]);
    });

    it('--effort 空则不注入；stdio 恒为最后一项', () => {
      const args = buildGrokAgentArgs({ thinkingLevel: null, customArgs: [] });
      expect(args).toEqual(['--no-auto-update', 'agent', '--always-approve', 'stdio']);
      expect(args[args.length - 1]).toBe('stdio');
    });
  });
});
