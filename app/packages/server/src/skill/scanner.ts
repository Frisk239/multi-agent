// S05 skill 目录扫描器（spec §5）
// 照 hermes scan_skill_commands：启动时扫目录，建内存 Map，不写 DB（零足迹）。
// skill 本身是文件系统真源；分配关系在 DB（agent_skill 表，由调用方查）。
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { resolveWorkspaceCwd } from '../workspace-cwd.js';

// 内部索引类型（含 body/path）。与 shared 的 SkillInfo（API 响应契约，含 usedBy）不同。
export interface SkillInfo {
  name: string;
  description: string;
  body: string;
  path: string;
  source: 'project' | 'user';
}

let skillIndex = new Map<string, SkillInfo>();

// 扫描两个目录（项目级优先覆盖用户级），建内存索引（照 hermes scan_skill_commands）
export function scanSkills(): void {
  const next = new Map<string, SkillInfo>();
  // 用户级先扫（低优先级）
  scanDir(join(homedir(), '.multi-agent', 'skills'), 'user', next);
  // 项目级后扫（覆盖同名）。ADR 0003：env > DB root_path
  const cwd = resolveWorkspaceCwd().path;
  if (cwd && cwd.length > 0) scanDir(resolve(cwd, '.skills'), 'project', next);
  skillIndex = next;
}

function scanDir(dir: string, source: 'project' | 'user', out: Map<string, SkillInfo>): void {
  if (!existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // 目录形态：<name>/SKILL.md（可含 references/ templates/ 子目录）
      const skillFile = join(dir, entry.name, 'SKILL.md');
      if (existsSync(skillFile)) parseAndStore(skillFile, source, out);
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'SKILL.md') {
      // 扁平形态：<name>.md
      parseAndStore(join(dir, entry.name), source, out);
    }
  }
}

function parseAndStore(path: string, source: 'project' | 'user', out: Map<string, SkillInfo>): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  const { frontmatter, body } = parseFrontmatter(raw);
  // R4 降级：无 frontmatter 或缺 name → 用文件名作 name
  const name = frontmatter.name ?? basename(path, '.md');
  out.set(name, {
    name,
    description: frontmatter.description ?? '',
    body,
    path,
    source,
  });
}

// 简单 frontmatter 解析（不引 yaml 依赖，只解析 name/description 两字段，spec §5.3）
// 注意：正则用 \r?\n 兼容 CRLF（Windows）行尾——SKILL.md 可能是 CRLF 格式，
// 纯 \n 匹配会导致 frontmatter 解析失败、R4 降级（所有 skill name 退化成 "SKILL"）。
function parseFrontmatter(raw: string): { frontmatter: { name?: string; description?: string }; body: string } {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: raw };
  }
  const fmBlock = fmMatch[1];
  const body = fmMatch[2];
  const frontmatter: { name?: string; description?: string } = {};
  for (const line of fmBlock.split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m && (m[1] === 'name' || m[1] === 'description')) {
      frontmatter[m[1] as 'name' | 'description'] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return { frontmatter, body };
}

export function getSkillIndex(): Map<string, SkillInfo> {
  return skillIndex;
}

export function getSkillsForAgent(_agentId: string): SkillInfo[] {
  // 查 agent_skill 需 DB import——scanner 不 import db（避免循环）。
  // 此函数保留占位；实际 agent→skill 查询（agent_skill 表 + 内存索引 join）
  // 由 impl-2 在 prompt.ts 里做（那里有 db import）。
  return [];
}
