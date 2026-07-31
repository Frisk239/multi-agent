import { describe, expect, it } from 'vitest';
import {
  RECENT_LIMIT,
  clearRecentVisits,
  mergeVisit,
  readRecentVisits,
  recordVisit,
  type RecentVisit,
  type SimpleStorage,
} from './recent-visits';

function memStorage(initial: Record<string, string> = {}): SimpleStorage {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const visit = (key: string, at: number, label = key): RecentVisit => ({
  key,
  label,
  visitedAt: at,
});

describe('mergeVisit', () => {
  it('新访问排在最前', () => {
    const r = mergeVisit([visit('a', 100)], visit('b', 200));
    expect(r.map((v) => v.key)).toEqual(['b', 'a']);
  });

  // 去重：同一个 issue 反复打开不该刷屏
  it('同 key 去重，保留最新一次', () => {
    const r = mergeVisit([visit('a', 100), visit('b', 90)], visit('a', 300));
    expect(r.map((v) => v.key)).toEqual(['a', 'b']);
    expect(r[0]!.visitedAt).toBe(300);
  });

  it('同 key 时 label 会被更新（标题改过）', () => {
    const r = mergeVisit([visit('a', 100, '旧标题')], visit('a', 200, '新标题'));
    expect(r[0]!.label).toBe('新标题');
    expect(r).toHaveLength(1);
  });

  it('超过上限时截断', () => {
    const many = Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => visit(`k${i}`, i));
    const r = mergeVisit(many, visit('new', 9999));
    expect(r).toHaveLength(RECENT_LIMIT);
    expect(r[0]!.key).toBe('new');
  });

  it('空 key 不写入', () => {
    const r = mergeVisit([visit('a', 100)], visit('', 200));
    expect(r.map((v) => v.key)).toEqual(['a']);
  });

  it('不修改传入数组', () => {
    const orig = [visit('a', 100)];
    mergeVisit(orig, visit('b', 200));
    expect(orig).toHaveLength(1);
  });
});

describe('readRecentVisits', () => {
  it('没记录返回空', () => {
    expect(readRecentVisits(memStorage())).toEqual([]);
  });

  it('storage 缺失返回空（SSR）', () => {
    expect(readRecentVisits(null)).toEqual([]);
    expect(readRecentVisits(undefined)).toEqual([]);
  });

  it('损坏 JSON 当作没记录', () => {
    expect(readRecentVisits(memStorage({ 'ma-recent-visits': '{oops' }))).toEqual([]);
  });

  it('非数组当作没记录', () => {
    expect(readRecentVisits(memStorage({ 'ma-recent-visits': '{"a":1}' }))).toEqual([]);
  });

  it('丢弃字段不合法的条目', () => {
    const s = memStorage({
      'ma-recent-visits': JSON.stringify([
        { key: 'ok', label: 'fine', visitedAt: 5 },
        { key: '', label: 'no key', visitedAt: 6 },
        { label: 'missing key', visitedAt: 7 },
        { key: 'no-label', visitedAt: 8 },
        null,
        'garbage',
      ]),
    });
    expect(readRecentVisits(s).map((v) => v.key)).toEqual(['ok']);
  });

  it('读出来即按时间倒序', () => {
    const s = memStorage({
      'ma-recent-visits': JSON.stringify([
        { key: 'old', label: 'o', visitedAt: 1 },
        { key: 'new', label: 'n', visitedAt: 9 },
      ]),
    });
    expect(readRecentVisits(s).map((v) => v.key)).toEqual(['new', 'old']);
  });
});

describe('recordVisit / clearRecentVisits', () => {
  it('记录后能读回', () => {
    const s = memStorage();
    recordVisit(s, visit('/issues/1', 100, 'FRI-1'));
    recordVisit(s, visit('/issues/2', 200, 'FRI-2'));
    expect(readRecentVisits(s).map((v) => v.key)).toEqual(['/issues/2', '/issues/1']);
  });

  it('反复打开同一项只留一条', () => {
    const s = memStorage();
    recordVisit(s, visit('/issues/1', 100));
    recordVisit(s, visit('/issues/1', 200));
    recordVisit(s, visit('/issues/1', 300));
    expect(readRecentVisits(s)).toHaveLength(1);
  });

  it('可一键清空', () => {
    const s = memStorage();
    recordVisit(s, visit('/issues/1', 100));
    clearRecentVisits(s);
    expect(readRecentVisits(s)).toEqual([]);
  });

  it('storage 写失败不抛', () => {
    const boom: SimpleStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('nope');
      },
    };
    expect(() => recordVisit(boom, visit('a', 1))).not.toThrow();
    expect(() => clearRecentVisits(boom)).not.toThrow();
  });

  it('storage 缺失时仍返回合并结果（不炸）', () => {
    expect(recordVisit(null, visit('a', 1)).map((v) => v.key)).toEqual(['a']);
  });
});
