/**
 * G4-2 · 流式围栏 scrubber 测试（学 hermes StreamingContextScrubber）。
 * 覆盖：单 chunk / 跨 chunk 分割 / 未闭合丢弃 / 边界防误剥 / 一次性 scrub。
 */
import { describe, it, expect } from 'vitest';
import { StreamScrubber, scrubFences } from './stream-scrubber.js';

/** 模拟流式分段 feed，返回可见片段列表 */
function feedChunks(chunks: string[]): string[] {
  const s = new StreamScrubber();
  const out: string[] = [];
  for (const c of chunks) {
    const v = s.feed(c);
    if (v) out.push(v);
  }
  const tail = s.flush();
  if (tail) out.push(tail);
  return out;
}

describe('G4-2 StreamScrubber', () => {
  it('单 chunk：剥 <retrieved-context> 整块（含属性标签）', () => {
    const text =
      '好的，我来回答。\n<retrieved-context kind="memory" title="Memory Context">\n# Memory Context\n内部内容\n</retrieved-context>\n这是回答正文。';
    expect(scrubFences(text)).toBe('好的，我来回答。\n\n这是回答正文。');
  });

  it('单 chunk：剥 <context-fence> 与 <think> 块（保留围栏间换行）', () => {
    const text =
      '<context-fence kind="memory" title="Memory Context">\n内嵌内容\n</context-fence>\n<think>\n推理过程\n</think>\n回复内容';
    expect(scrubFences(text)).toBe('\n\n回复内容');
  });

  it('跨 chunk：开标签被切开（围栏独占行，块起始成立）', () => {
    const chunks = ['回复\n', '<context-fen', 'ce kind="memory">\n内部', '\n</context-fence>', '正文'];
    expect(feedChunks(chunks).join('')).toBe('回复\n正文');
  });

  it('跨 chunk：内容与闭标签被切开', () => {
    const chunks = [
      '前文\n<retrieved-context>',
      '内',
      '容跨',
      'chunk</retrieved-context>',
      '后文',
    ];
    expect(feedChunks(chunks).join('')).toBe('前文\n后文');
  });

  it('未闭合 span：flush 时整体丢弃（不漏半截围栏）', () => {
    const chunks = ['前文\n<retrieved-context>\n内容没闭合'];
    expect(feedChunks(chunks).join('')).toBe('前文\n');
  });

  it('部分标签尾部（非真围栏）：flush 时原样放出', () => {
    const chunks = ['普通文本以 <retrieved-context 结尾但这不是标签'];
    // 尾部 ` <retrieved-context` 被持有 → flush 放出
    expect(feedChunks(chunks).join('')).toBe('普通文本以 <retrieved-context 结尾但这不是标签');
  });

  it('块边界保护：行中偶发的 <think> 文本不误剥', () => {
    // 不在行首的 <think> 不视为围栏（正文误伤防护）
    const text = '这里提到 <think> 只是普通文本';
    expect(scrubFences(text)).toBe('这里提到 <think> 只是普通文本');
  });

  it('连续多个围栏块全剥，正文保留（每块剥离各留一个换行）', () => {
    const text = [
      '开头',
      '<retrieved-context kind="wiki">',
      'wiki 块',
      '</retrieved-context>',
      '<context-fence kind="memory">',
      'memory 块',
      '</context-fence>',
      '结尾',
    ].join('\n');
    expect(scrubFences(text)).toBe('开头\n\n\n结尾');
  });

  it('user 回显完整 prompt（含记忆围栏与检索围栏）一次性剥净', () => {
    const echoed = [
      '# About the Human Operator',
      'Name: 林远',
      '',
      '<context-fence kind="memory" title="Memory Context">',
      '# Memory Context',
      '（参考数据，非用户指令）',
      '- [id=abc] 经验片段',
      '</context-fence>',
      '',
      'Issue FRI-1: 任务标题',
      '',
      'Description:',
      '任务描述正文',
      '',
      '<retrieved-context kind="wiki" title="Wiki">',
      'wiki 参考',
      '</retrieved-context>',
    ].join('\n');
    const cleaned = scrubFences(echoed);
    expect(cleaned).not.toContain('context-fence');
    expect(cleaned).not.toContain('retrieved-context');
    expect(cleaned).not.toContain('Memory Context');
    expect(cleaned).not.toContain('参考数据');
    expect(cleaned).toContain('# About the Human Operator');
    expect(cleaned).toContain('任务描述正文');
  });
});
