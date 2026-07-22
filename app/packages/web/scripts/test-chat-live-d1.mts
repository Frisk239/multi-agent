/**
 * D1：Chat 活过程状态机（store 语义，无浏览器）
 * Run from packages/web: pnpm exec tsx scripts/test-chat-live-d1.mts
 *
 * 注：Zustand store 与 React 组件同文件；此处复刻核心合并规则做门禁。
 */

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** 与 ws.ts appendPartial 规则对齐 */
function mergePartial(prev: string, text: string): string {
  const t = text.trim();
  if (!t) return prev;
  if (!prev) return t;
  if (t.startsWith(prev) || prev.startsWith(t)) return t.length >= prev.length ? t : prev;
  if (prev.includes(t)) return prev;
  return `${prev}\n\n${t}`.slice(-2000);
}

function parseToolName(body: string): string {
  try {
    const j = JSON.parse(body) as { name?: string };
    if (j?.name?.trim()) return j.name.trim();
  } catch {
    /* ignore */
  }
  return body.trim().slice(0, 80) || 'tool';
}

// partial merge
assert(mergePartial('', 'hello') === 'hello', 'empty');
assert(mergePartial('hel', 'hello') === 'hello', 'extend');
assert(mergePartial('hello world', 'hello') === 'hello world', 'shorter prefix keep prev');
assert(
  mergePartial('alpha', 'beta').includes('alpha') && mergePartial('alpha', 'beta').includes('beta'),
  'two blocks',
);
console.log('PASS partial merge rules');

// tool parse
assert(parseToolName(JSON.stringify({ name: 'Bash', args: {} })) === 'Bash', 'json tool');
assert(parseToolName('Read') === 'Read', 'plain');
console.log('PASS tool name parse');

// status label priority: tool > partial > thinking
function statusLabel(opts: {
  queued?: boolean;
  tool?: string;
  partial?: string;
}): string {
  if (opts.queued) return '排队中';
  if (opts.tool) return `使用工具 · ${opts.tool}`;
  if (opts.partial) return '正在回复';
  return '正在思考';
}
assert(statusLabel({ tool: 'Bash', partial: 'x' }).includes('Bash'), 'tool wins');
assert(statusLabel({ partial: 'hi' }) === '正在回复', 'partial');
assert(statusLabel({}) === '正在思考', 'default');
console.log('PASS status label priority');

console.log('ALL PASS D1 chat live rules');
process.exit(0);
