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
 * M4a：相邻 assistant 文本块合并（流式 chunk 语义）。
 * 同一 run 的流式 assistant 输出按 chunk 落库（「记住了42」→ 记/住了/42 三条），
 * 显示层把它们合并为连续段落；**中间有其他事件（tool/user/system）则不合并**
 * ——以事件边界判定真实分隔，不破坏 tool 事件前后的独立消息。
 * 合并消息沿用第一块的 id/seq/createdAt（渲染 key 与时间戳取流式起点）。
 */
export function mergeAdjacentAssistantChunks(messages: RunMessage[]): RunMessage[] {
  const out: RunMessage[] = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (m.kind === 'assistant' && last?.kind === 'assistant') {
      out[out.length - 1] = { ...last, body: (last.body ?? '') + (m.body ?? '') };
    } else {
      out.push(m);
    }
  }
  return out;
}

/**
 * G23：将相邻 tool_start + 匹配 tool_end 折成一组。
 * - 优先同工具名（LIFO）
 * - 无名时与最近未配对 start 配对
 * - 未配对的 start/end 保持单条
 * - 非 tool 事件不变
 * M4a：入口先合并相邻 assistant 块（显示层；原始落库消息不变）。
 */
export function pairRunToolEvents(messages: RunMessage[]): RunEventViewItem[] {
  const merged = mergeAdjacentAssistantChunks(messages);
  if (merged.length === 0) return [];

  const startIndexes: number[] = [];
  const pairEndByStart = new Map<number, number>();
  const pairedEnd = new Set<number>();

  for (let i = 0; i < merged.length; i++) {
    const m = merged[i]!;
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
        const sn = parseToolName(merged[si]!.body);
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
  for (let i = 0; i < merged.length; i++) {
    if (pairedEnd.has(i)) continue;
    const m = merged[i]!;
    const endIdx = pairEndByStart.get(i);
    if (m.kind === 'tool_start' && endIdx != null) {
      const end = merged[endIdx]!;
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

/**
 * Slice 73：折叠 header 一行 args 预览（优先 start.args）。
 * 空则回落 result / body，保证有内容可读。
 */
export function pairArgsLinePreview(
  start: RunMessage,
  end?: RunMessage,
  max = 90,
): string {
  const startP = parseToolPayload(start.body);
  if (startP.argsText) return previewBody(startP.argsText, max);
  if (startP.summary) return previewBody(startP.summary, max);
  if (end) {
    const endP = parseToolPayload(end.body);
    if (endP.resultText) return previewBody(endP.resultText, max);
    if (endP.summary) return previewBody(endP.summary, max);
  }
  return previewBody(start.body || end?.body || '', max);
}

/** kind 色条 class 后缀（tool / assistant / user / system） */
export function kindToneOf(kind: RunMessage['kind'] | 'tool_pair'): string {
  if (kind === 'tool_start' || kind === 'tool_pair') return 'tool';
  if (kind === 'tool_end') return 'tool-end';
  if (kind === 'assistant') return 'assistant';
  if (kind === 'user') return 'user';
  return 'system';
}

export function pairCollapsedPreview(
  start: RunMessage,
  end: RunMessage,
  max = 120,
): string {
  const startP = parseToolPayload(start.body);
  const endP = parseToolPayload(end.body);
  // 更密：args 一行优先；有 result 时用短箭头
  const args =
    startP.argsText
      ? previewBody(startP.argsText, max)
      : startP.summary
        ? previewBody(startP.summary, max)
        : null;
  const result =
    endP.resultText
      ? previewBody(endP.resultText, Math.min(64, max))
      : endP.summary
        ? previewBody(endP.summary, Math.min(64, max))
        : null;
  if (args && result) return `${args} → ${result}`;
  if (args) return args;
  if (result) return result;
  return previewBody(start.body || end.body || '', max);
}
