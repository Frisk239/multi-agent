import { describe, it, expect } from 'vitest';
import {
  parseToolPayload,
  parseToolName,
  previewBody,
  pairRunToolEvents,
  filterRunEventView,
} from './run-event-pairs';
import type { RunMessage } from '@ma/shared';

describe('run-event-pairs', () => {
  describe('parseToolPayload', () => {
    it('parses valid JSON body containing name and args', () => {
      const body = JSON.stringify({
        name: 'read_file',
        args: { path: '/tmp/test.txt' },
      });
      const res = parseToolPayload(body);
      expect(res.name).toBe('read_file');
      expect(res.argsText).toBe('{"path":"/tmp/test.txt"}');
    });

    it('parses valid JSON body containing name and result', () => {
      const body = JSON.stringify({
        name: 'read_file',
        result: 'file content here',
      });
      const res = parseToolPayload(body);
      expect(res.name).toBe('read_file');
      expect(res.resultText).toBe('file content here');
    });

    it('falls back to regex matching for non-JSON strings', () => {
      const body = 'tool_name: write_to_file';
      const res = parseToolPayload(body);
      expect(res.name).toBe('write_to_file');
    });

    it('returns null fields for empty or invalid input', () => {
      const res = parseToolPayload('');
      expect(res.name).toBeNull();
      expect(res.summary).toBeNull();
    });
  });

  describe('parseToolName', () => {
    it('extracts tool name from JSON payload', () => {
      const body = JSON.stringify({ name: 'grep_search' });
      expect(parseToolName(body)).toBe('grep_search');
    });
  });

  describe('previewBody', () => {
    it('collapses whitespace and truncates string beyond max length', () => {
      const longString = '  hello   world  ' + 'a'.repeat(300);
      const prev = previewBody(longString, 50);
      expect(prev.length).toBeLessThanOrEqual(53);
      expect(prev.startsWith('hello world')).toBe(true);
    });

    it('returns short string unmodified', () => {
      expect(previewBody('  short text  ')).toBe('short text');
    });
  });

  describe('pairRunToolEvents', () => {
    it('pairs matching tool_start and tool_end events', () => {
      const messages: RunMessage[] = [
        {
          id: 'msg-1',
          runId: 'run-1',
          seq: 1,
          kind: 'tool_start',
          body: JSON.stringify({ name: 'exec', args: { cmd: 'ls' } }),
          createdAt: new Date(1000).toISOString(),
        },
        {
          id: 'msg-2',
          runId: 'run-1',
          seq: 2,
          kind: 'tool_end',
          body: JSON.stringify({ name: 'exec', result: 'file1 file2' }),
          createdAt: new Date(1200).toISOString(),
        },
      ];

      const items = pairRunToolEvents(messages);
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('pair');
      if (items[0].type === 'pair') {
        expect(items[0].toolName).toBe('exec');
        expect(items[0].start.id).toBe('msg-1');
        expect(items[0].end?.id).toBe('msg-2');
      }
    });

    it('handles unpaired tool_start events', () => {
      const messages: RunMessage[] = [
        {
          id: 'msg-1',
          runId: 'run-1',
          seq: 1,
          kind: 'tool_start',
          body: JSON.stringify({ name: 'long_task' }),
          createdAt: new Date(1000).toISOString(),
        },
      ];

      const items = pairRunToolEvents(messages);
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('single');
    });

    it('preserves assistant and system messages as single items', () => {
      const messages: RunMessage[] = [
        {
          id: 'msg-1',
          runId: 'run-1',
          seq: 1,
          kind: 'assistant',
          body: 'Hello user',
          createdAt: new Date(1000).toISOString(),
        },
      ];

      const items = pairRunToolEvents(messages);
      expect(items.length).toBe(1);
      expect(items[0].type).toBe('single');
    });
  });

  describe('filterRunEventView', () => {
    it('filters items by filter mode', () => {
      const messages: RunMessage[] = [
        { id: 'm1', runId: 'r1', seq: 1, kind: 'assistant', body: 'hi', createdAt: new Date(1000).toISOString() },
        { id: 'm2', runId: 'r1', seq: 2, kind: 'tool_start', body: JSON.stringify({ name: 'read' }), createdAt: new Date(2000).toISOString() },
      ];
      const items = pairRunToolEvents(messages);

      const all = filterRunEventView(items, 'all');
      expect(all.length).toBe(2);

      const assistantOnly = filterRunEventView(items, 'assistant');
      expect(assistantOnly.length).toBe(1);
      if (assistantOnly[0].type === 'single') {
        expect(assistantOnly[0].message.kind).toBe('assistant');
      }

      const toolOnly = filterRunEventView(items, 'tool');
      expect(toolOnly.length).toBe(1);
    });
  });
});
