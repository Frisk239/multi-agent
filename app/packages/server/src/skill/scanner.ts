// S05 skill 目录扫描器（spec §5）
// 照 hermes scan_skill_commands：启动时扫目录，建内存 Map，不写 DB（零足迹）。
// skill 本身是文件系统真源；分配关系在 DB（agent_skill 表，由调用方查）。
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  statSync,
} from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
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

/** 从本机任意目录导入时的候选 skill（对齐 Multica RuntimeLocalSkillSummary 精简） */
export interface LocalSkillCandidate {
  key: string;
  name: string;
  description: string;
  path: string;
  kind: 'dir' | 'file';
  alreadyIndexed: boolean;
  existingSource: 'project' | 'user' | null;
}

let skillIndex = new Map<string, SkillInfo>();

export function projectSkillsDir(): string | null {
  const cwd = resolveWorkspaceCwd().path;
  if (!cwd) return null;
  return resolve(cwd, '.skills');
}

export function userSkillsDir(): string {
  return join(homedir(), '.multi-agent', 'skills');
}

// 扫描两个目录（项目级优先覆盖用户级），建内存索引（照 hermes scan_skill_commands）
export function scanSkills(): void {
  const next = new Map<string, SkillInfo>();
  // 用户级先扫（低优先级）
  scanDir(userSkillsDir(), 'user', next);
  // 项目级后扫（覆盖同名）。ADR 0003：env > DB root_path
  const projectDir = projectSkillsDir();
  if (projectDir) scanDir(projectDir, 'project', next);
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
function parseFrontmatter(raw: string): {
  frontmatter: { name?: string; description?: string };
  body: string;
} {
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

/**
 * 扫描本机任意目录，列出可导入 skill 候选。
 * 支持：子目录/SKILL.md、扁平 *.md、以及单文件 SKILL.md 所在目录本身。
 */
export function listImportCandidates(sourcePath: string): {
  path: string;
  candidates: LocalSkillCandidate[];
  error: string | null;
} {
  const abs = resolve(sourcePath.trim());
  if (!existsSync(abs)) {
    return { path: abs, candidates: [], error: '路径不存在' };
  }
  let st;
  try {
    st = statSync(abs);
  } catch {
    return { path: abs, candidates: [], error: '无法读取路径' };
  }

  const found: Omit<LocalSkillCandidate, 'alreadyIndexed' | 'existingSource'>[] = [];

  const pushFromSkillMd = (skillMd: string, kind: 'dir' | 'file') => {
    try {
      const raw = readFileSync(skillMd, 'utf8');
      const { frontmatter } = parseFrontmatter(raw);
      const name =
        frontmatter.name ??
        (kind === 'dir' ? basename(dirname(skillMd)) : basename(skillMd, '.md'));
      if (!name.trim()) return;
      found.push({
        key: skillMd,
        name: name.trim(),
        description: frontmatter.description ?? '',
        path: skillMd,
        kind,
      });
    } catch {
      /* skip unreadable */
    }
  };

  if (st.isFile()) {
    if (/\.md$/i.test(abs)) {
      pushFromSkillMd(abs, basename(abs).toUpperCase() === 'SKILL.MD' ? 'dir' : 'file');
    } else {
      return { path: abs, candidates: [], error: '请选择目录或 .md / SKILL.md 文件' };
    }
  } else if (st.isDirectory()) {
    // 目录本身是 skill 根
    const rootSkill = join(abs, 'SKILL.md');
    if (existsSync(rootSkill)) {
      pushFromSkillMd(rootSkill, 'dir');
    }
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return { path: abs, candidates: [], error: '无法读取目录' };
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFile = join(abs, entry.name, 'SKILL.md');
        if (existsSync(skillFile)) pushFromSkillMd(skillFile, 'dir');
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        entry.name.toUpperCase() !== 'SKILL.MD'
      ) {
        pushFromSkillMd(join(abs, entry.name), 'file');
      }
    }
  }

  // 去重 by name（同名保留先发现的）
  const byName = new Map<string, (typeof found)[0]>();
  for (const c of found) {
    if (!byName.has(c.name)) byName.set(c.name, c);
  }

  const index = getSkillIndex();
  const candidates: LocalSkillCandidate[] = [...byName.values()].map((c) => {
    const existing = index.get(c.name);
    return {
      ...c,
      alreadyIndexed: Boolean(existing),
      existingSource: existing?.source ?? null,
    };
  });
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return { path: abs, candidates, error: null };
}

function sanitizeSkillDirName(name: string): string {
  const s = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/\.+$/g, '');
  return s || 'skill';
}

export type ImportSkillResult = {
  name: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  source: 'project' | 'user';
  path?: string;
  error?: string;
};

/**
 * 把候选 skill 写入本仓本地目录（project: <cwd>/.skills 或 user: ~/.multi-agent/skills）。
 * 学 Multica runtime local import，但目标是本地 filesystem 而非云 workspace blob。
 */
export function importLocalSkill(opts: {
  sourcePath: string;
  /** 写入后的 skill name；默认读 frontmatter / 文件名 */
  name?: string;
  description?: string;
  target: 'project' | 'user';
  /** 目标已存在时是否覆盖 */
  overwrite?: boolean;
}): ImportSkillResult {
  const abs = resolve(opts.sourcePath.trim());
  if (!existsSync(abs)) {
    return {
      name: opts.name ?? basename(abs),
      status: 'failed',
      source: opts.target,
      error: '源路径不存在',
    };
  }

  let skillMd = abs;
  let kind: 'dir' | 'file' = 'file';
  try {
    const st = statSync(abs);
    if (st.isDirectory()) {
      skillMd = join(abs, 'SKILL.md');
      kind = 'dir';
      if (!existsSync(skillMd)) {
        return {
          name: opts.name ?? basename(abs),
          status: 'failed',
          source: opts.target,
          error: '目录内无 SKILL.md',
        };
      }
    } else if (basename(abs).toUpperCase() === 'SKILL.MD') {
      kind = 'dir';
    } else if (!abs.endsWith('.md')) {
      return {
        name: opts.name ?? basename(abs),
        status: 'failed',
        source: opts.target,
        error: '仅支持 .md / SKILL.md / 含 SKILL.md 的目录',
      };
    }
  } catch (e) {
    return {
      name: opts.name ?? basename(abs),
      status: 'failed',
      source: opts.target,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let raw: string;
  try {
    raw = readFileSync(skillMd, 'utf8');
  } catch (e) {
    return {
      name: opts.name ?? basename(skillMd),
      status: 'failed',
      source: opts.target,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const parsed = parseFrontmatter(raw);
  const name = (opts.name?.trim() || parsed.frontmatter.name || basename(skillMd, '.md')).trim();
  const description =
    opts.description !== undefined
      ? opts.description
      : parsed.frontmatter.description ?? '';

  const destRoot =
    opts.target === 'user' ? userSkillsDir() : projectSkillsDir();
  if (!destRoot) {
    return {
      name,
      status: 'failed',
      source: opts.target,
      error: '工作区 cwd 未配置，无法写入项目级 .skills',
    };
  }

  mkdirSync(destRoot, { recursive: true });
  const dirName = sanitizeSkillDirName(name);
  const destDir = join(destRoot, dirName);
  const destFile = join(destDir, 'SKILL.md');
  const exists = existsSync(destDir) || existsSync(destFile);

  if (exists && !opts.overwrite) {
    return { name, status: 'skipped', source: opts.target, path: destDir };
  }

  try {
    mkdirSync(destDir, { recursive: true });
    // 写 SKILL.md：保留 body，更新 frontmatter name/description
    const body = parsed.body ?? '';
    const md = `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n---\n${body.startsWith('\n') ? body : `\n${body}`}`;
    writeFileSync(destFile, md, 'utf8');

    // 目录形态：尽量复制同级 references/ templates/ 等附属目录
    if (kind === 'dir') {
      const srcDir = dirname(skillMd);
      for (const sub of ['references', 'templates', 'scripts', 'assets']) {
        const from = join(srcDir, sub);
        if (existsSync(from)) {
          const to = join(destDir, sub);
          cpSync(from, to, { recursive: true, force: true });
        }
      }
    }

    scanSkills();
    return {
      name,
      status: exists ? 'updated' : 'created',
      source: opts.target,
      path: destDir,
    };
  } catch (e) {
    return {
      name,
      status: 'failed',
      source: opts.target,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function getSkillsForAgent(_agentId: string): SkillInfo[] {
  // 查 agent_skill 需 DB import——scanner 不 import db（避免循环）。
  // 此函数保留占位；实际 agent→skill 查询（agent_skill 表 + 内存索引 join）
  // 由 impl-2 在 prompt.ts 里做（那里有 db import）。
  return [];
}
