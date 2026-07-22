/**
 * D3：tool body JSON → name + args 摘要（与 RunEventTimeline 规则对齐）
 */
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

const start = JSON.stringify({
  name: 'Bash',
  args: { command: 'pnpm test', timeout: 120 },
});
const p = parseToolPayload(start);
assert(p.name === 'Bash', p.name ?? '');
assert(p.summary?.includes('pnpm test'), p.summary ?? '');
console.log('PASS tool_start summary', p);

const end = JSON.stringify({ name: 'Bash', result: 'ok\n'.repeat(50) });
const e = parseToolPayload(end);
assert(e.name === 'Bash', 'end name');
assert(e.summary && e.summary.length <= 120, 'trunc');
console.log('PASS tool_end summary');

const plain = parseToolPayload('not-json');
assert(plain.name == null, 'plain');
console.log('PASS non-json');

console.log('ALL PASS D3 tool narrative');
process.exit(0);
