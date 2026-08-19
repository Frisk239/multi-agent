import { describe, expect, it } from 'vitest';
import {
  messageWindowLimit,
  messageWindowNewestFirst,
  resolveRunMessagesWindow,
} from './run-messages-window.js';

describe('resolveRunMessagesWindow', () => {
  it('no query = full ASC', () => {
    expect(resolveRunMessagesWindow({})).toEqual({ mode: 'full' });
    expect(messageWindowNewestFirst({ mode: 'full' })).toBe(false);
    expect(messageWindowLimit({ mode: 'full' })).toBeUndefined();
  });

  it('limit only = tail', () => {
    const win = resolveRunMessagesWindow({ limit: 500 });
    expect(win).toEqual({ mode: 'tail', limit: 500 });
    expect(messageWindowNewestFirst(win)).toBe(true);
    expect(messageWindowLimit(win)).toBe(500);
  });

  it('afterSeq = forward ASC', () => {
    const win = resolveRunMessagesWindow({ afterSeq: 10, limit: 2 });
    expect(win).toEqual({ mode: 'after', afterSeq: 10, limit: 2 });
    expect(messageWindowNewestFirst(win)).toBe(false);
  });

  it('beforeSeq + limit = last N before cursor', () => {
    const win = resolveRunMessagesWindow({ beforeSeq: 20, limit: 3 });
    expect(win).toEqual({ mode: 'before', beforeSeq: 20, limit: 3 });
    expect(messageWindowNewestFirst(win)).toBe(true);
  });
});
