export type SkillSourceKind = 'project' | 'user' | 'workspace' | 'builtin';

export function skillSourceChip(source: SkillSourceKind, projectTitle?: string | null): string {
  if (source === 'project') return projectTitle ? `项目 · ${projectTitle}` : '项目本机';
  if (source === 'workspace') return '工作区';
  if (source === 'builtin') return '内置';
  return '用户级';
}

export function skillSourceMeta(source: SkillSourceKind): string {
  if (source === 'project') return '项目 .skills';
  if (source === 'workspace') return '工作区 .skills';
  if (source === 'builtin') return '产品内置';
  return '用户 skills';
}
