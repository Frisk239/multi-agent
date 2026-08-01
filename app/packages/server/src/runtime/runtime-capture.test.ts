import { describe, it, expect } from 'vitest';
import { parseOpencodeLine } from './opencode';
import { parseCursorLine, parseCursorToolCallEnvelope } from './cursor';
import { parseGrokLine } from './grok';
import {
  extractOpencodeStepTokens,
  extractTokenUsage,
  hasTokenSignal,
  parseUsageFromResultLine,
} from './usage-parse';
import { runtimeCaptureCapabilityMatrix } from './runtime-capture';
import { sessionResumeCapabilityMatrix } from './session-resume';
import type { LineContext } from './spawn-line';
import type { AgentEvent } from './types';

function emptyCtx(): LineContext {
  return { resultText: null, usage: null, providerSessionId: null };
}

describe('Slice 60 runtime capture matrix', () => {
  it('documents usage/tool/session capture and current resume matrix', () => {
    const capture = runtimeCaptureCapabilityMatrix();
    expect(capture.find((r) => r.runtime === 'opencode')).toMatchObject({
      usage: true,
      tool: true,
      providerSessionId: true,
    });
    expect(capture.find((r) => r.runtime === 'cursor')).toMatchObject({
      usage: true,
      tool: true,
      providerSessionId: true,
    });
    expect(capture.find((r) => r.runtime === 'pi')).toMatchObject({
      usage: true,
      tool: true,
      providerSessionId: true,
    });

    // A9 2026-07-30: Grok now true (resume + --resume injection); pi also true (real RPC backend)
    const resume = sessionResumeCapabilityMatrix();
    for (const id of ['claude-code', 'opencode', 'cursor', 'grok', 'pi'] as const) {
      expect(resume.find((r) => r.runtime === id)?.supportsSessionResume).toBe(true);
    }
  });
});

describe('Slice 60 opencode Multica fixtures', () => {
  it('parses sessionID + text + tool_use + step_finish tokens', () => {
    const events: AgentEvent[] = [];
    const ctx = emptyCtx();

    parseOpencodeLine(
      JSON.stringify({
        type: 'step_start',
        sessionID: 'ses_abc',
        timestamp: 1,
      }),
      (e) => events.push(e),
      ctx,
    );
    expect(ctx.providerSessionId).toBe('ses_abc');

    parseOpencodeLine(
      JSON.stringify({
        type: 'text',
        sessionID: 'ses_abc',
        part: { type: 'text', text: 'hello from opencode', sessionID: 'ses_abc' },
      }),
      (e) => events.push(e),
      ctx,
    );

    // Real Multica fixture shape
    parseOpencodeLine(
      `{"type":"tool_use","timestamp":1775117187163,"sessionID":"ses_abc","part":{"id":"prt_123","messageID":"msg_456","sessionID":"ses_abc","type":"tool","tool":"bash","callID":"call_BHA1","state":{"status":"completed","input":{"command":"pwd","description":"Prints cwd"},"output":"/tmp/multica\\n","metadata":{"exit":0},"time":{"start":1,"end":2}}}}`,
      (e) => events.push(e),
      ctx,
    );

    parseOpencodeLine(
      `{"type":"step_finish","timestamp":1775116676180,"sessionID":"ses_abc","part":{"id":"prt_789","reason":"stop","messageID":"msg_456","sessionID":"ses_abc","type":"step-finish","tokens":{"total":14674,"input":14585,"output":89,"reasoning":82,"cache":{"write":0,"read":12}},"cost":0}}`,
      (e) => events.push(e),
      ctx,
    );

    expect(ctx.providerSessionId).toBe('ses_abc');
    expect(ctx.usage).toEqual({
      input: 14585,
      output: 89,
      cacheRead: 12,
      cacheWrite: 0,
    });
    expect(hasTokenSignal(ctx.usage)).toBe(true);

    const toolsStart = events.filter((e) => e.type === 'tool_start');
    const toolsEnd = events.filter((e) => e.type === 'tool_end');
    expect(toolsStart.some((e) => e.type === 'tool_start' && e.name === 'bash')).toBe(true);
    expect(toolsEnd.some((e) => e.type === 'tool_end' && e.name === 'bash')).toBe(true);
    expect(events.some((e) => e.type === 'message' && e.text.includes('hello'))).toBe(true);
  });

  it('accumulates multiple step_finish token rows', () => {
    const ctx = emptyCtx();
    const noop = () => {};
    parseOpencodeLine(
      JSON.stringify({
        type: 'step_finish',
        sessionID: 'ses_x',
        part: { tokens: { input: 100, output: 10, cache: { read: 1, write: 2 } } },
      }),
      noop,
      ctx,
    );
    parseOpencodeLine(
      JSON.stringify({
        type: 'step_finish',
        sessionID: 'ses_x',
        part: { tokens: { input: 50, output: 5, cache: { read: 0, write: 0 } } },
      }),
      noop,
      ctx,
    );
    expect(ctx.usage).toEqual({
      input: 150,
      output: 15,
      cacheRead: 1,
      cacheWrite: 2,
    });
  });
});

describe('Slice 60 cursor Multica fixtures', () => {
  it('captures session_id from system init', () => {
    const events: AgentEvent[] = [];
    const ctx = emptyCtx();
    parseCursorLine(
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'ebb521c2-404d-4a4e-8c2f-1f8bdb141043',
        model: 'Auto',
      }),
      (e) => events.push(e),
      ctx,
    );
    expect(ctx.providerSessionId).toBe('ebb521c2-404d-4a4e-8c2f-1f8bdb141043');
  });

  it('parses tool_call started/completed envelope (readToolCall)', () => {
    const events: AgentEvent[] = [];
    const ctx = emptyCtx();
    const sid = 'ebb521c2-404d-4a4e-8c2f-1f8bdb141043';

    parseCursorLine(
      JSON.stringify({
        type: 'tool_call',
        subtype: 'started',
        call_id: 'call-bb11656a\nfc_35bc3e26',
        session_id: sid,
        tool_call: {
          readToolCall: { args: { path: '/tmp/curcap/notes.txt' } },
          toolCallId: 'call-bb11656a\nfc_35bc3e26',
        },
      }),
      (e) => events.push(e),
      ctx,
    );

    parseCursorLine(
      JSON.stringify({
        type: 'tool_call',
        subtype: 'completed',
        call_id: 'call-bb11656a\nfc_35bc3e26',
        session_id: sid,
        tool_call: {
          readToolCall: {
            args: { path: '/tmp/curcap/notes.txt' },
            result: {
              success: { content: 'alpha\nbeta\ngamma\n', totalLines: 4 },
            },
          },
        },
      }),
      (e) => events.push(e),
      ctx,
    );

    expect(ctx.providerSessionId).toBe(sid);
    expect(events[0]).toMatchObject({ type: 'tool_start', name: 'read' });
    expect(events[1]).toMatchObject({ type: 'tool_end', name: 'read' });
    expect(String((events[1] as any).result)).toContain('alpha');
  });

  it('parses result usage camelCase (Multica cursor fixture)', () => {
    const events: AgentEvent[] = [];
    const ctx = emptyCtx();
    parseCursorLine(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'done',
        session_id: 'ebb521c2-404d-4a4e-8c2f-1f8bdb141043',
        usage: {
          inputTokens: 8830,
          outputTokens: 185,
          cacheReadTokens: 44800,
          cacheWriteTokens: 0,
        },
      }),
      (e) => events.push(e),
      ctx,
    );
    expect(ctx.resultText).toBe('done');
    expect(ctx.usage).toEqual({
      input: 8830,
      output: 185,
      cacheRead: 44800,
      cacheWrite: 0,
    });
    expect(hasTokenSignal(ctx.usage)).toBe(true);
  });

  it('parseCursorToolCallEnvelope names shellToolCall → shell', () => {
    const call = parseCursorToolCallEnvelope({
      type: 'tool_call',
      subtype: 'started',
      call_id: 'call-1',
      tool_call: {
        shellToolCall: { args: { command: 'wc -l notes.txt' } },
      },
    });
    expect(call.name).toBe('shell');
    expect(call.input).toEqual({ command: 'wc -l notes.txt' });
  });
});

describe('Slice 60 usage-parse extensions', () => {
  it('extractOpencodeStepTokens nested cache', () => {
    expect(
      extractOpencodeStepTokens({
        total: 100,
        input: 80,
        output: 20,
        cache: { read: 5, write: 3 },
      }),
    ).toEqual({ input: 80, output: 20, cacheRead: 5, cacheWrite: 3 });
  });

  it('parseUsageFromResultLine accepts top-level camelCase without nested usage', () => {
    const u = parseUsageFromResultLine({
      type: 'result',
      inputTokens: 10,
      outputTokens: 4,
    });
    expect(u).toEqual({
      input: 10,
      output: 4,
      cacheRead: null,
      cacheWrite: null,
    });
  });

  it('hasTokenSignal false for empty', () => {
    expect(hasTokenSignal(null)).toBe(false);
    expect(hasTokenSignal(extractTokenUsage({ foo: 1 }))).toBe(false);
  });
});

describe('Slice 60 grok light capture', () => {
  it('captures session + usage from JSON when present', () => {
    const events: AgentEvent[] = [];
    const ctx = emptyCtx();
    parseGrokLine(
      JSON.stringify({
        session_id: 'grok-sess-001',
        usage: { input_tokens: 11, output_tokens: 3 },
        method: 'session/update',
        params: { text: 'hi grok' },
      }),
      (e) => events.push(e),
      ctx,
    );
    expect(ctx.providerSessionId).toBe('grok-sess-001');
    expect(ctx.usage?.input).toBe(11);
    expect(ctx.usage?.output).toBe(3);
    expect(events.some((e) => e.type === 'message')).toBe(true);
  });
});
