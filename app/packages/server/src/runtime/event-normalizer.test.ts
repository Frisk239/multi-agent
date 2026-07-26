import { describe, it, expect } from 'vitest';
import { normalizeRuntimeEvent } from './event-normalizer';

describe('normalizeRuntimeEvent', () => {
  it('normalizes tool_use event', () => {
    const raw = {
      runId: 'run-1',
      type: 'tool_use',
      toolName: 'read_file',
      input: { path: '/tmp/test.txt' },
    };
    const evt = normalizeRuntimeEvent(raw);

    expect(evt.runId).toBe('run-1');
    expect(evt.kind).toBe('tool_use');
    expect(evt.title).toBe('工具调用: read_file');
    expect(evt.content).toContain('/tmp/test.txt');
    expect(evt.metadata).toEqual({ toolName: 'read_file', input: raw.input });
  });

  it('normalizes tool_result event', () => {
    const raw = {
      runId: 'run-1',
      type: 'tool_result',
      toolName: 'read_file',
      output: 'file content hello',
      duration: 120,
    };
    const evt = normalizeRuntimeEvent(raw);

    expect(evt.runId).toBe('run-1');
    expect(evt.kind).toBe('tool_result');
    expect(evt.title).toBe('工具输出: read_file');
    expect(evt.content).toBe('file content hello');
    expect(evt.metadata).toEqual({ toolName: 'read_file', output: 'file content hello', duration: 120 });
  });

  it('normalizes thinking event', () => {
    const raw = {
      runId: 'run-1',
      type: 'thinking',
      text: 'Analyzing the architecture...',
    };
    const evt = normalizeRuntimeEvent(raw);

    expect(evt.kind).toBe('thinking');
    expect(evt.title).toBe('思考过程');
    expect(evt.content).toBe('Analyzing the architecture...');
  });

  it('normalizes error event', () => {
    const raw = {
      runId: 'run-1',
      type: 'error',
      text: 'Command failed with exit code 1',
    };
    const evt = normalizeRuntimeEvent(raw);

    expect(evt.kind).toBe('error');
    expect(evt.title).toBe('错误信息');
    expect(evt.content).toBe('Command failed with exit code 1');
  });

  it('normalizes system_log event', () => {
    const raw = {
      runId: 'run-1',
      type: 'system',
      text: 'Worker started',
    };
    const evt = normalizeRuntimeEvent(raw);

    expect(evt.kind).toBe('system_log');
    expect(evt.title).toBe('系统日志');
  });

  it('defaults to text event when type is unrecognized', () => {
    const raw = {
      runId: 'run-1',
      text: 'Hello world',
    };
    const evt = normalizeRuntimeEvent(raw);

    expect(evt.kind).toBe('text');
    expect(evt.content).toBe('Hello world');
    expect(evt.id).toMatch(/^evt-/);
  });

  it('formats timestamp from numeric createdAt or uses current ISO time', () => {
    const epoch = 1700000000000;
    const raw = {
      runId: 'run-1',
      text: 'Time test',
      createdAt: epoch,
    };
    const evt = normalizeRuntimeEvent(raw);
    expect(evt.timestamp).toBe(new Date(epoch).toISOString());
  });
});
