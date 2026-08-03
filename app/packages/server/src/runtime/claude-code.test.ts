/**
 * G6-3：claude-code argv 纯函数直测（原 execute 内联构造零测试）。
 * 覆盖：base 形态 / model / effort / resume / customArgs 各分支与组合。
 */
import { describe, expect, it } from 'vitest';
import { buildClaudeArgv } from './claude-code.js';

describe('buildClaudeArgv (G6-3)', () => {
  it('base argv 恒定：-p --output-format stream-json --verbose（prompt 走 stdin，不含 argv）', () => {
    expect(buildClaudeArgv({})).toEqual(['-p', '--output-format', 'stream-json', '--verbose']);
  });

  it('model 非空 → --model；空/空白 → 省略（CLI 默认）', () => {
    expect(buildClaudeArgv({ model: 'claude-3-5-sonnet' })).toContain('--model');
    expect(buildClaudeArgv({ model: 'claude-3-5-sonnet' }).slice(-2)).toEqual([
      '--model',
      'claude-3-5-sonnet',
    ]);
    expect(buildClaudeArgv({ model: '  ' })).toHaveLength(4);
    expect(buildClaudeArgv({ model: null })).toHaveLength(4);
  });

  it('thinkingLevel → --effort（trim 生效）', () => {
    const args = buildClaudeArgv({ thinkingLevel: 'high' });
    expect(args.slice(-2)).toEqual(['--effort', 'high']);
    expect(buildClaudeArgv({ thinkingLevel: ' high ' }).slice(-1)).toEqual(['high']);
    expect(buildClaudeArgv({ thinkingLevel: '' })).toHaveLength(4);
  });

  it('resumeSessionId → --resume（trim 生效）', () => {
    const args = buildClaudeArgv({ resumeSessionId: 'sess-abc' });
    expect(args.slice(-2)).toEqual(['--resume', 'sess-abc']);
    expect(buildClaudeArgv({ resumeSessionId: ' sess-abc ' }).slice(-1)).toEqual(['sess-abc']);
    expect(buildClaudeArgv({ resumeSessionId: null })).toHaveLength(4);
  });

  it('customArgs 追加尾部；空数组不追加', () => {
    const args = buildClaudeArgv({ customArgs: ['--dangerously-skip-permissions', '--foo'] });
    expect(args.slice(-2)).toEqual(['--dangerously-skip-permissions', '--foo']);
    expect(buildClaudeArgv({ customArgs: [] })).toHaveLength(4);
    expect(buildClaudeArgv({ customArgs: undefined })).toHaveLength(4);
  });

  it('组合：model + effort + resume + customArgs 顺序为 base → model → effort → resume → customArgs', () => {
    const args = buildClaudeArgv({
      model: 'm1',
      thinkingLevel: 'low',
      resumeSessionId: 's1',
      customArgs: ['-x'],
    });
    expect(args).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      'm1',
      '--effort',
      'low',
      '--resume',
      's1',
      '-x',
    ]);
  });
});
