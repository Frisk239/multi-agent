import type { RunMessage } from '@ma/shared';

/** D3 / G23：tool_start/end body 常为 JSON `{ name, args|result }` */
export function parseToolPayload(body: string): {
  name: string | null;
  summary: string | null;
  argsText: string | null;
  resultText: string | null;
} {
  const raw = body.trim();
  if (!raw) {
    return { name: null, summary: null, argsText: null, resultText: null };
  }
  try {
    const j = JSON.parse(raw) as {
      name?: unknown;
      args?: unknown;
      result?: unknown;
    };
    const name =
      typeof j.name === 'string' && j.name.trim() ? j.name.trim() : null;
    let argsText: string | null = null;
    let resultText: string | null = null;
    if (j.args != null) {
      argsText =
        typeof j.args === 'string' ? j.args : JSON.stringify(j.args);
    }
    if (j.result != null) {
      resultText =
        typeof j.result === 'string' ? j.result : JSON.stringify(j.result);
    }
    const summarySource = argsText ?? resultText;
    const summary = summarySource
      ? previewBody(summarySource, 100)
      : null;
    if (name || summary) {
      return { name, summary, argsText, resultText };
    }
  } catch {
    /* not JSON */
  }
  const m =
    raw.match(/^(?:tool[_ ]?name|name)\s*[:=]\s*["']?([\w./-]+)/i) ||
    raw.match(/^([A-Za-z][\w./-]{0,40})\s*[:(]/) ||
    raw.match(/"name"\s*:\s*"([^"]+)"/);
  return {
    name: m?.[1] ?? null,
    summary: null,
    argsText: null,
    resultText: null,
  };
}

export function parseToolName(body: string): string | null {
  return parseToolPayload(body).name;
}

export function previewBody(body: string, max = 280): string {
  const t = body.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export type RunEventViewItem =
  | { type: 'pair'; start: RunMessage; end: RunMessage; toolName: string | null }
  | { type: 'single'; message: RunMessage };

/**
 * G23：将相邻 tool_start + 匹配 tool_end 折成一组。
 * - 优先同工具名（LIFO）
 * - 无名时与最近未配对 start 配对
 * - 未配对的 start/end 保持单条
 * - 非 tool 事件不变
 */
export function pairRunToolEvents(messages: RunMessage[]): RunEventViewItem[] {
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

    const endNameRaw = parseToolName(m.body);
    const endName = endNameRaw?.toLowerCase() === 'tool' ? null : endNameRaw;
    let startIdx = -1;
    if (endName) {
      for (let s = startIndexes.length - 1; s >= 0; s--) {
        const si = startIndexes[s]!;
        const sn = parseToolName(messages[si]!.body);
        if (sn == null || sn.toLowerCase() === 'tool' || sn === endName) {
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
      let startName = parseToolName(m.body);
      let endNameParsed = parseToolName(end.body);
      if (endNameParsed?.toLowerCase() === 'tool') endNameParsed = null;
      if (startName?.toLowerCase() === 'tool') startName = null;
      const toolName = startName ?? endNameParsed ?? null;
      out.push({ type: 'pair', start: m, end, toolName });
      continue;
    }
    out.push({ type: 'single', message: m });
  }
  return out;
}

/** 抽屉筛：全部 / 工具（pair+unpaired tool）/ 助手 */
export type RunEventDrawerFilter = 'all' | 'tool' | 'assistant';

export function filterRunEventView(
  items: RunEventViewItem[],
  filter: RunEventDrawerFilter,
): RunEventViewItem[] {
  if (filter === 'all') return items;
  if (filter === 'tool') {
    return items.filter((it) => {
      if (it.type === 'pair') return true;
      const k = it.message.kind;
      return k === 'tool_start' || k === 'tool_end';
    });
  }
  return items.filter(
    (it) => it.type === 'single' && it.message.kind === 'assistant',
  );
}

export function pairCollapsedPreview(
  start: RunMessage,
  end: RunMessage,
  max = 120,
): string {
  const startP = parseToolPayload(start.body);
  const endP = parseToolPayload(end.body);
  const args = startP.summary ?? (startP.argsText ? previewBody(startP.argsText, max) : null);
  const result = endP.summary ?? (endP.resultText ? previewBody(endP.resultText, max) : null);
  if (args && result) return `${args} → ${previewBody(result, Math.min(80, max))}`;
  if (args) return args;
  if (result) return result;
  return previewBody(start.body || end.body || '', max);
}
