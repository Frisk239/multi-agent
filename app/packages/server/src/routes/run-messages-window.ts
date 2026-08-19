export type RunMessagesWindow =
  | { mode: 'full' }
  | { mode: 'after'; afterSeq: number; limit?: number }
  | { mode: 'before'; beforeSeq: number; limit?: number }
  | { mode: 'tail'; limit: number };

export function resolveRunMessagesWindow(q: {
  afterSeq?: number;
  beforeSeq?: number;
  limit?: number;
}): RunMessagesWindow {
  if (q.afterSeq !== undefined) {
    return { mode: 'after', afterSeq: q.afterSeq, limit: q.limit };
  }
  if (q.beforeSeq !== undefined) {
    return { mode: 'before', beforeSeq: q.beforeSeq, limit: q.limit };
  }
  if (q.limit !== undefined) {
    return { mode: 'tail', limit: q.limit };
  }
  return { mode: 'full' };
}

export function messageWindowNewestFirst(win: RunMessagesWindow): boolean {
  return win.mode === 'tail' || (win.mode === 'before' && win.limit !== undefined);
}

export function messageWindowLimit(win: RunMessagesWindow): number | undefined {
  if (win.mode === 'full') return undefined;
  return win.limit;
}
