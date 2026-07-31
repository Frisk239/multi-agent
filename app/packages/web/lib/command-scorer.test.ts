import { describe, expect, it } from 'vitest';
import {
  MatchTier,
  normalizeForMatch,
  pinyinInitial,
  pinyinInitials,
  rankCandidates,
  scoreCandidate,
  subsequenceIndices,
  toHighlightRanges,
} from './command-scorer';

describe('normalizeForMatch', () => {
  it('小写并去掉连字符/空格/下划线', () => {
    expect(normalizeForMatch('FRI-42')).toBe('fri42');
    expect(normalizeForMatch('a b_c-d')).toBe('abcd');
  });
});

describe('pinyinInitial / pinyinInitials', () => {
  it('常用汉字取首字母', () => {
    expect(pinyinInitial('回')).toBe('h');
    expect(pinyinInitial('滚')).toBe('g');
    expect(pinyinInitial('监')).toBe('j');
    expect(pinyinInitial('控')).toBe('k');
  });

  it('非汉字原样小写', () => {
    expect(pinyinInitial('A')).toBe('a');
    expect(pinyinInitial('7')).toBe('7');
  });

  it('整串映射', () => {
    expect(pinyinInitials('回滚监控')).toBe('hgjk');
    expect(pinyinInitials('登录修复')).toBe('dlxf');
  });

  it('空输入不炸', () => {
    expect(pinyinInitial('')).toBe('');
    expect(pinyinInitials('')).toBe('');
  });
});

describe('subsequenceIndices', () => {
  it('按序不连续也算命中', () => {
    expect(subsequenceIndices('abcdef', 'ace')).toEqual([0, 2, 4]);
  });

  it('顺序不对则不命中', () => {
    expect(subsequenceIndices('abcdef', 'eca')).toBeNull();
  });

  it('缺字符则不命中', () => {
    expect(subsequenceIndices('abc', 'abz')).toBeNull();
  });
});

describe('scoreCandidate 档位', () => {
  it('精确 ID 最强', () => {
    const s = scoreCandidate('FRI-42 登录修复', 'FRI-42', 'FRI-42');
    expect(s.tier).toBe(MatchTier.ExactId);
  });

  // 原实现的痛点：差一个连字符就搜不到
  it('归一化后「fri42」能命中 FRI-42', () => {
    const s = scoreCandidate('FRI-42 登录修复', 'fri42', 'FRI-42');
    expect(s.tier).toBe(MatchTier.ExactId);
  });

  it('前缀强于 contains', () => {
    expect(scoreCandidate('缓存穿透', '缓存').tier).toBe(MatchTier.Prefix);
    expect(scoreCandidate('修复缓存穿透', '缓存').tier).toBe(MatchTier.Contains);
  });

  // 原实现的痛点：无拼音
  it('拼音首字母能命中中文标题', () => {
    const s = scoreCandidate('回滚监控', 'hgjk');
    expect(s.tier).toBe(MatchTier.Pinyin);
    expect(s.index).toBe(0);
  });

  it('拼音部分命中', () => {
    expect(scoreCandidate('登录修复', 'dl').tier).toBe(MatchTier.Pinyin);
  });

  it('完全不匹配为 None', () => {
    expect(scoreCandidate('abc', 'zzz').tier).toBe(MatchTier.None);
  });

  it('空查询为 None', () => {
    expect(scoreCandidate('abc', '').tier).toBe(MatchTier.None);
    expect(scoreCandidate('abc', '   ').tier).toBe(MatchTier.None);
  });

  it('命中位置被记录，供高亮与排序', () => {
    const s = scoreCandidate('修复缓存穿透', '缓存');
    expect(s.index).toBe(2);
    expect(s.highlight).toEqual([2, 3]);
  });
});

describe('toHighlightRanges', () => {
  it('连续下标压成一个区间', () => {
    expect(toHighlightRanges([2, 3, 4])).toEqual([{ start: 2, end: 5 }]);
  });

  it('不连续下标分成多段', () => {
    expect(toHighlightRanges([0, 2, 3])).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 4 },
    ]);
  });

  it('乱序与重复被规整', () => {
    expect(toHighlightRanges([3, 2, 2])).toEqual([{ start: 2, end: 4 }]);
  });

  it('空输入返回空', () => {
    expect(toHighlightRanges([])).toEqual([]);
  });
});

describe('rankCandidates 确定性', () => {
  const items = [
    { id: '1', label: '修复缓存穿透', identifier: 'FRI-10' },
    { id: '2', label: '缓存预热', identifier: 'FRI-20' },
    { id: '3', label: '缓存', identifier: 'FRI-30' },
  ];

  it('按档位排序：前缀先于 contains', () => {
    const r = rankCandidates(items, '缓存');
    expect(r[0]!.label).toBe('缓存');
    expect(r.map((x) => x.label)).toEqual(['缓存', '缓存预热', '修复缓存穿透']);
  });

  it('过滤掉未命中项', () => {
    expect(rankCandidates(items, 'zzz')).toHaveLength(0);
  });

  // 键盘选择的前提：第一项不能跳来跳去
  it('同一输入两次结果完全一致', () => {
    const a = rankCandidates(items, '缓存').map((x) => x.id);
    const b = rankCandidates(items, '缓存').map((x) => x.id);
    expect(a).toEqual(b);
  });

  it('输入顺序变化不影响输出顺序（确定性）', () => {
    const shuffled = [items[2]!, items[0]!, items[1]!];
    expect(rankCandidates(shuffled, '缓存').map((x) => x.id)).toEqual(
      rankCandidates(items, '缓存').map((x) => x.id),
    );
  });

  it('精确 identifier 排最前', () => {
    const r = rankCandidates(items, 'FRI-20');
    expect(r[0]!.identifier).toBe('FRI-20');
  });

  it('空查询返回空（不把全部项当命中）', () => {
    expect(rankCandidates(items, '')).toHaveLength(0);
  });
});
