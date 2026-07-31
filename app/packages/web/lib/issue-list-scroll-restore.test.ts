import { describe, expect, it } from 'vitest';
import {
  clearListViewState,
  makeListViewKey,
  readListViewState,
  resolveRestoreIndex,
  saveListViewState,
  type IssueListViewState,
  type SimpleStorage,
} from './issue-list-scroll-restore';

function memStorage(initial: Record<string, string> = {}): SimpleStorage & { dump: () => Record<string, string> } {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

const state: IssueListViewState = {
  pagesLoaded: 3,
  anchorIssueId: 'iss-80',
  anchorIndex: 79,
};

describe('makeListViewKey', () => {
  it('相同筛选组合产生相同键（键顺序无关）', () => {
    const a = makeListViewKey({ view: 'list', q: 'bug', priority: 'high' });
    const b = makeListViewKey({ priority: 'high', q: 'bug', view: 'list' });
    expect(a).toBe(b);
  });

  it('换了筛选条件就是不同视图，不复用旧位置', () => {
    const a = makeListViewKey({ view: 'list', q: 'bug' });
    const b = makeListViewKey({ view: 'list', q: 'perf' });
    expect(a).not.toBe(b);
  });

  it('null 与 undefined 与空串等价，避免同一视图产生两个键', () => {
    const a = makeListViewKey({ q: null, label: undefined });
    const b = makeListViewKey({ q: '', label: '' });
    expect(a).toBe(b);
  });
});

describe('save / read / clear', () => {
  it('存进去能原样读出来', () => {
    const s = memStorage();
    const key = makeListViewKey({ view: 'list' });
    saveListViewState(s, key, state);
    expect(readListViewState(s, key)).toEqual(state);
  });

  it('没存过返回 null', () => {
    expect(readListViewState(memStorage(), 'ma-issue-list-view:none')).toBeNull();
  });

  it('clear 后读不到', () => {
    const s = memStorage();
    const key = makeListViewKey({ view: 'list' });
    saveListViewState(s, key, state);
    clearListViewState(s, key);
    expect(readListViewState(s, key)).toBeNull();
  });

  it('storage 缺失时不抛（SSR / 隐私模式）', () => {
    expect(() => saveListViewState(null, 'k', state)).not.toThrow();
    expect(readListViewState(null, 'k')).toBeNull();
    expect(() => clearListViewState(undefined, 'k')).not.toThrow();
  });

  it('写入抛异常时静默，不把页面搞崩', () => {
    const boom: SimpleStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    };
    expect(() => saveListViewState(boom, 'k', state)).not.toThrow();
    expect(() => clearListViewState(boom, 'k')).not.toThrow();
  });

  it('损坏的 JSON 当作没保存过', () => {
    const s = memStorage({ 'ma-issue-list-view:x': '{not json' });
    expect(readListViewState(s, 'ma-issue-list-view:x')).toBeNull();
  });

  it('字段类型不对时回退到安全默认值', () => {
    const s = memStorage({
      'ma-issue-list-view:x': JSON.stringify({
        pagesLoaded: 'three',
        anchorIssueId: 42,
        anchorIndex: -9,
      }),
    });
    expect(readListViewState(s, 'ma-issue-list-view:x')).toEqual({
      pagesLoaded: 1,
      anchorIssueId: null,
      anchorIndex: 0,
    });
  });
});

describe('resolveRestoreIndex', () => {
  const ids = Array.from({ length: 100 }, (_, i) => `iss-${i + 1}`);

  it('按 issue id 命中，顺序变了也跟得上', () => {
    expect(resolveRestoreIndex(ids, state)).toBe(79);
    const reordered = ['iss-80', ...ids.filter((x) => x !== 'iss-80')];
    expect(resolveRestoreIndex(reordered, state)).toBeNull(); // 已在顶部，无需滚动
  });

  it('锚点 issue 已不在列表时退回 anchorIndex', () => {
    const without = ids.filter((x) => x !== 'iss-80');
    expect(resolveRestoreIndex(without, state)).toBe(79);
  });

  it('anchorIndex 超出当前列表长度时夹到末行', () => {
    const short = ids.slice(0, 10);
    expect(resolveRestoreIndex(short, { ...state, anchorIssueId: 'gone' })).toBe(9);
  });

  it('空列表 / 无保存状态时不滚动', () => {
    expect(resolveRestoreIndex([], state)).toBeNull();
    expect(resolveRestoreIndex(ids, null)).toBeNull();
    expect(resolveRestoreIndex(ids, undefined)).toBeNull();
  });

  it('锚点本来就在顶部时不滚动', () => {
    expect(
      resolveRestoreIndex(ids, { pagesLoaded: 1, anchorIssueId: 'iss-1', anchorIndex: 0 }),
    ).toBeNull();
  });
});
