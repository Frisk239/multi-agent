import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { Highlighted } from './CommandPalette';

// G3-7：CmdK 匹配高亮 —— scorer 的 highlight 索引数组 → <mark> 包裹。
describe('G3-7 Highlighted (CmdK 高亮)', () => {
  afterEach(() => cleanup());

  it('无索引 → 原样文本，无 mark', () => {
    const { container } = render(<Highlighted text="Issues" indices={[]} />);
    expect(container.textContent).toBe('Issues');
    expect(container.querySelector('mark')).toBeNull();
  });

  it('索引包裹 <mark>（前缀匹配）', () => {
    const { container } = render(<Highlighted text="Issues" indices={[0, 1, 2]} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(3);
    expect(marks[0].textContent).toBe('I');
    expect(marks[1].textContent).toBe('s');
    expect(marks[2].textContent).toBe('s');
    // 完整文本保留（mark 内字符 + 未命中尾部）
    expect(container.textContent).toBe('Issues');
  });

  it('中间命中（子序列匹配）', () => {
    const { container } = render(<Highlighted text="KanbanBoard" indices={[6, 7, 8]} />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(3);
    expect(marks[0].textContent).toBe('B');
    expect(container.textContent).toBe('KanbanBoard');
  });

  it('拼音匹配高亮（拼音命中 = 前缀索引）', () => {
    const { container } = render(<Highlighted text="收件箱" indices={[0]} />);
    expect(container.querySelector('mark')?.textContent).toBe('收');
    expect(container.textContent).toBe('收件箱');
  });
});
