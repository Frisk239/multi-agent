import { describe, expect, it } from 'vitest';
import { skillSourceChip, skillSourceMeta } from './skill-source-label';

describe('skillSourceChip', () => {
  it('does not call builtin 用户级', () => {
    expect(skillSourceChip('builtin')).toBe('内置');
    expect(skillSourceChip('user')).toBe('用户级');
    expect(skillSourceChip('workspace')).toBe('工作区');
    expect(skillSourceChip('project', '仓 A')).toBe('项目 · 仓 A');
  });
});

describe('skillSourceMeta', () => {
  it('four-way honest labels', () => {
    expect(skillSourceMeta('builtin')).toBe('产品内置');
    expect(skillSourceMeta('user')).toBe('用户 skills');
    expect(skillSourceMeta('workspace')).toBe('工作区 .skills');
    expect(skillSourceMeta('project')).toBe('项目 .skills');
  });
});
