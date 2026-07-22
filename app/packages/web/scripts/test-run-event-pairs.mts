/**
 * G23：tool_start + tool_end pair-fold（与 lib/run-event-pairs 对齐）
 */
import type { RunMessage } from '@ma/shared';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function previewBody(body: string, max = 280): string {
  const t = body.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function parseToolPayload(body: string): {
  name: string | null;
  summary: string | null;
} {
  const raw = body.trim();
  if (!raw) return { name: null, summary: null };
  try {
    const j = JSON.parse(raw) as {
      name?: unknown;
      args?: unknown;
      result?: unknown;
    };
    const name =
      typeof j.name === 'string' && j.name.trim() ? j.name.trim() : null;
    let summary: string | null = null;
    if (j.args != null) {
      const s = typeof j.args === 'string' ? j.args : JSON.stringify(j.args);
      summary = previewBody(s, 100);
    } else if (j.result != null) {
      const s =
        typeof j.result === 'string' ? j.result : JSON.stringify(j.result);
      summary = previewBody(s, 100);
    }
    if (name || summary) return { name, summary };
  } catch {
    /* not JSON */
  }
  return { name: null, summary: null };
}

function parseToolName(body: string): string | null {
  return parseToolPayload(body).name;
}

type RunEventViewItem =
  | { type: 'pair'; start: RunMessage; end: RunMessage; toolName: string | null }
  | { type: 'single'; message: RunMessage };

function pairRunToolEvents(messages: RunMessage[]): RunEventViewItem[] {
  if (messages.length === 0) return [];

  const startIndexes: number[] = [];
  const pairEndByStart = new Map<number, number>();
  const pairedEnd = new Set<number>();

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.kind === 'tool_start') {
      startIndexes.push(i);
      continue;
    }
    if (m.kind !== 'tool_end' || startIndexes.length === 0) continue;

    const endName = parseToolName(m.body);
    let startIdx = -1;
    if (endName) {
      for (let s = startIndexes.length - 1; s >= 0; s--) {
        const si = startIndexes[s]!;
        const sn = parseToolName(messages[si]!.body);
        if (sn == null || sn === endName) {
          startIdx = si;
          startIndexes.splice(s, 1);
          break;
        }
      }
    }
    if (startIdx < 0) {
      startIdx = startIndexes.pop()!;
    }
    pairEndByStart.set(startIdx, i);
    pairedEnd.add(i);
  }

  const out: RunEventViewItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (pairedEnd.has(i)) continue;
    const m = messages[i]!;
    const endIdx = pairEndByStart.get(i);
    if (m.kind === 'tool_start' && endIdx != null) {
      const end = messages[endIdx]!;
      const toolName =
        parseToolName(m.body) ?? parseToolName(end.body) ?? null;
      out.push({ type: 'pair', start: m, end, toolName });
      continue;
    }
    out.push({ type: 'single', message: m });
  }
  return out;
}

function msg(
  id: string,
  seq: number,
  kind: RunMessage['kind'],
  body: string,
): RunMessage {
  return {
    id,
    runId: 'r1',
    seq,
    kind,
    body,
    createdAt: new Date(0).toISOString(),
  } as RunMessage;
}

const nested = pairRunToolEvents([
  msg('a', 1, 'assistant', 'hi'),
  msg('s1', 2, 'tool_start', JSON.stringify({ name: 'Bash', args: { c: 'ls' } })),
  msg('s2', 3, 'tool_start', JSON.stringify({ name: 'Read', args: { p: 'a.ts' } })),
  msg('e2', 4, 'tool_end', JSON.stringify({ name: 'Read', result: 'ok' })),
  msg('e1', 5, 'tool_end', JSON.stringify({ name: 'Bash', result: 'files' })),
  msg('u', 6, 'user', 'go'),
]);

assert(nested.length === 4, `nested len ${nested.length}`);
assert(nested[0]!.type === 'single' && nested[0]!.message.kind === 'assistant', 'asst');
assert(nested[1]!.type === 'pair' && nested[1]!.toolName === 'Bash', 'bash pair');
assert(nested[2]!.type === 'pair' && nested[2]!.toolName === 'Read', 'read pair');
assert(nested[3]!.type === 'single' && nested[3]!.message.kind === 'user', 'user');
console.log('PASS nested LIFO name match');

const unpaired = pairRunToolEvents([
  msg('s', 1, 'tool_start', JSON.stringify({ name: 'Bash', args: {} })),
  msg('a', 2, 'assistant', 'still running'),
  msg('e', 3, 'tool_end', JSON.stringify({ name: 'Other', result: 'x' })),
]);
assert(unpaired.length === 3, `unpaired ${unpaired.length}`);
assert(unpaired[0]!.type === 'pair' && unpaired[0]!.toolName === 'Bash', 'fallback pair');
assert(unpaired[1]!.type === 'single' && unpaired[1]!.message.kind === 'assistant', 'mid asst');
assert(unpaired[2]!.type === 'single' && unpaired[2]!.message.kind === 'tool_end', 'orphan end');
console.log('PASS unmatched end stays single when name conflict emptied stack');

const simple = pairRunToolEvents([
  msg('s', 1, 'tool_start', JSON.stringify({ name: 'Write', args: { f: 1 } })),
  msg('e', 2, 'tool_end', JSON.stringify({ name: 'Write', result: 'done' })),
]);
assert(simple.length === 1 && simple[0]!.type === 'pair', 'simple pair');
console.log('PASS adjacent pair');

console.log('ALL PASS G23 pair-fold');
process.exit(0);
