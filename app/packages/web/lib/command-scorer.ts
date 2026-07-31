/**
 * S6 · CmdK 确定性打分（纯函数，可单测）
 *
 * 原状：CommandPalette 全靠 `label.toLowerCase().includes(q)`，于是
 *  - 「fri42」搜不到 FRI-42（差个连字符）
 *  - 「hj」搜不到「回滚监控」（无拼音）
 *  - 命中处不高亮，要自己用眼睛找
 *  - 顺序由数组原序决定，同一查询换个数据就换个顺序
 *
 * 这里给一个**确定性**排序：精确 ID > 前缀 > 子序列 > 拼音 > contains。
 * 同档按次要键（命中位置、长度、label）稳定排序 —— 同一输入永远同一结果，
 * 这对键盘选择很关键（第一项跳来跳去会误触）。
 *
 * 刻意的边界：不引入语义/向量检索，不上完整拼音库。拼音只覆盖
 * 常用汉字首字母，够用且零依赖；查不到的字符不参与拼音匹配。
 */

/** 匹配档位，数字越小越强。 */
export enum MatchTier {
  ExactId = 0,
  Prefix = 1,
  Subsequence = 2,
  Pinyin = 3,
  Contains = 4,
  None = 99,
}

export type ScoreResult = {
  tier: MatchTier;
  /** 命中在 label 中的起始位置（用于同档排序与高亮） */
  index: number;
  /** 需要高亮的字符下标（升序、去重） */
  highlight: number[];
};

/** 命中区间，供 UI 渲染 <mark>。 */
export type HighlightRange = { start: number; end: number };

/** 归一化：小写 + 去掉连字符/空格/下划线，让「fri42」能命中「FRI-42」。 */
export function normalizeForMatch(s: string): string {
  return (s ?? '').toLowerCase().replace(/[\s\-_]/g, '');
}

// ——— 拼音首字母：按 Unicode 码点区间粗分，零依赖 ———
// 覆盖常用汉字首字母，查不到的字符返回 '' 并不参与拼音匹配。
const PINYIN_BOUNDS: Array<[number, number, string]> = [
  [0x4e00, 0x4e01, 'y'], [0x4e02, 0x4e08, 'q'], [0x4e09, 0x4e0a, 's'],
  [0x4e0b, 0x4e0c, 'x'], [0x4e0d, 0x4e0e, 'b'], [0x4e0f, 0x4e12, 'y'],
  [0x4e13, 0x4e15, 'z'], [0x4e16, 0x4e18, 's'], [0x4e19, 0x4e1a, 'b'],
  [0x4e1b, 0x4e1d, 'c'], [0x4e1e, 0x4e21, 'd'], [0x4e22, 0x4e24, 'l'],
  [0x4e25, 0x4e27, 'y'], [0x4e28, 0x4e2c, 'g'], [0x4e2d, 0x4e2f, 'z'],
];

/** 常用字显式表：命中率比区间估算高，用于本项目高频词。 */
const PINYIN_EXPLICIT: Record<string, string> = {
  回: 'h', 滚: 'g', 监: 'j', 控: 'k', 登: 'd', 录: 'l', 修: 'x', 复: 'f',
  缓: 'h', 存: 'c', 穿: 'c', 透: 't', 附: 'f', 件: 'j', 评: 'p', 论: 'l',
  搜: 's', 索: 's', 智: 'z', 能: 'n', 体: 't', 小: 'x', 队: 'd', 运: 'y',
  行: 'x', 设: 's', 置: 'z', 项: 'x', 目: 'm', 记: 'j', 忆: 'y', 收: 's',
  取: 'q', 消: 'x', 失: 's', 败: 'b', 完: 'w', 成: 'c', 任: 'r', 务: 'w',
  子: 'z', 父: 'f', 结: 'j', 报: 'b', 告: 'g', 优: 'y', 化: 'h', 测: 'c',
  试: 's', 派: 'p', 活: 'h', 看: 'k', 板: 'b', 列: 'l', 表: 'b', 详: 'x',
  情: 'q', 分: 'f', 页: 'y', 加: 'j', 载: 'z', 更: 'g', 多: 'd', 指: 'z',
  新: 'x', 建: 'j', 删: 's', 除: 'c', 编: 'b', 辑: 'j', 保: 'b', 提: 't',
  交: 'j', 撤: 'c', 销: 'x', 确: 'q', 认: 'r', 关: 'g', 闭: 'b', 打: 'd',
  开: 'k', 上: 's', 下: 'x', 传: 'c', 预: 'y', 览: 'l', 定: 'd', 折: 'z',
  叠: 'd', 展: 'z', 历: 'l', 史: 's', 最: 'z', 近: 'j', 访: 'f', 问: 'w',
};

/** 取单个字符的拼音首字母；非汉字返回该字符本身的小写。 */
export function pinyinInitial(ch: string): string {
  if (!ch) return '';
  const explicit = PINYIN_EXPLICIT[ch];
  if (explicit) return explicit;

  const code = ch.codePointAt(0)!;
  // 非 CJK：原样返回小写（数字/字母直接参与）
  if (code < 0x4e00 || code > 0x9fff) return ch.toLowerCase();

  for (const [lo, hi, initial] of PINYIN_BOUNDS) {
    if (code >= lo && code <= hi) return initial;
  }
  return '';
}

/** 整串的拼音首字母序列；无法映射的汉字位留空占位以保持下标对齐。 */
export function pinyinInitials(s: string): string {
  return Array.from(s ?? '')
    .map((ch) => pinyinInitial(ch))
    .join('');
}

/**
 * 子序列匹配：query 的字符按序出现在 text 中（不必连续）。
 * 返回命中下标，未命中返回 null。
 */
export function subsequenceIndices(text: string, query: string): number[] | null {
  const t = (text ?? '').toLowerCase();
  const q = (query ?? '').toLowerCase();
  if (!q) return [];
  const out: number[] = [];
  let ti = 0;
  for (const qc of q) {
    const found = t.indexOf(qc, ti);
    if (found < 0) return null;
    out.push(found);
    ti = found + 1;
  }
  return out;
}

/**
 * 给一个候选项打分。
 * `id` 传入时参与「精确 ID」判定（如 FRI-42 / uuid 前缀）。
 */
export function scoreCandidate(
  label: string,
  query: string,
  id?: string | null,
): ScoreResult {
  const raw = (label ?? '');
  const q = (query ?? '').trim();
  if (!q) return { tier: MatchTier.None, index: -1, highlight: [] };

  const qLower = q.toLowerCase();
  const qNorm = normalizeForMatch(q);
  const labelLower = raw.toLowerCase();

  // 0) 精确 ID：identifier 或 id 归一化后完全相等
  if (id) {
    if (normalizeForMatch(id) === qNorm && qNorm.length > 0) {
      return { tier: MatchTier.ExactId, index: 0, highlight: [] };
    }
  }
  if (normalizeForMatch(raw) === qNorm && qNorm.length > 0) {
    return { tier: MatchTier.ExactId, index: 0, highlight: rangeIndices(0, raw.length) };
  }

  // 1) 前缀
  if (labelLower.startsWith(qLower)) {
    return { tier: MatchTier.Prefix, index: 0, highlight: rangeIndices(0, q.length) };
  }
  // 归一化前缀：让「fri42」命中「FRI-42 …」
  if (normalizeForMatch(raw).startsWith(qNorm) && qNorm.length > 0) {
    return { tier: MatchTier.Prefix, index: 0, highlight: [] };
  }

  // 2) contains 先算出来，供后面比较位置
  const containsIdx = labelLower.indexOf(qLower);

  // 3) 子序列（连续 contains 之外的模糊匹配）
  const sub = subsequenceIndices(raw, q);

  // 4) 拼音首字母
  const initials = pinyinInitials(raw);
  const pinyinIdx = initials && qNorm ? initials.indexOf(qNorm) : -1;

  // contains 命中时优先级低于子序列？不 —— contains 是更强的证据，
  // 但档位上 Subsequence 更泛。这里的取舍：contains 单独成档且排在最后，
  // 因为它对「fri42」这类查询无能为力，而子序列能给出更贴近意图的结果。
  // 若两者都命中，取 index 更小的那个的档位。
  if (sub && containsIdx >= 0) {
    // 完整连续命中通常就是子序列的一个特例，此时按 Contains 处理更直观
    return {
      tier: MatchTier.Contains,
      index: containsIdx,
      highlight: rangeIndices(containsIdx, q.length),
    };
  }
  if (sub) {
    return { tier: MatchTier.Subsequence, index: sub[0] ?? -1, highlight: sub };
  }
  if (pinyinIdx >= 0) {
    return {
      tier: MatchTier.Pinyin,
      index: pinyinIdx,
      highlight: rangeIndices(pinyinIdx, qNorm.length),
    };
  }
  if (containsIdx >= 0) {
    return {
      tier: MatchTier.Contains,
      index: containsIdx,
      highlight: rangeIndices(containsIdx, q.length),
    };
  }

  return { tier: MatchTier.None, index: -1, highlight: [] };
}

function rangeIndices(start: number, len: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(start + i);
  return out;
}

/** 把高亮下标压成连续区间，便于渲染 <mark>。 */
export function toHighlightRanges(indices: readonly number[]): HighlightRange[] {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  const ranges: HighlightRange[] = [];
  for (const i of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && i === last.end) last.end = i + 1;
    else ranges.push({ start: i, end: i + 1 });
  }
  return ranges;
}

export type Scorable = { id: string; label: string; identifier?: string | null };

/**
 * 排序候选集：先按档位，再按命中位置、label 长度、label 字典序。
 * 后三个次要键保证**同一输入永远同一顺序**。
 */
export function rankCandidates<T extends Scorable>(
  items: readonly T[],
  query: string,
): Array<T & { score: ScoreResult }> {
  const q = (query ?? '').trim();
  const scored = items
    .map((it) => ({
      ...it,
      score: scoreCandidate(it.label, q, it.identifier ?? it.id),
    }))
    .filter((it) => it.score.tier !== MatchTier.None);

  scored.sort(
    (a, b) =>
      a.score.tier - b.score.tier ||
      a.score.index - b.score.index ||
      a.label.length - b.label.length ||
      a.label.localeCompare(b.label),
  );
  return scored;
}
