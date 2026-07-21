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
import { eq } from 'drizzle-orm';
import { resolveWorkspaceCwd } from '../workspace-cwd.js';
import { db } from '../db/client.js';
import { projects } from '../db/schema.js';

// 内部索引类型（含 body/path）。与 shared 的 SkillInfo（API 响应契约，含 usedBy）不同。
export type SkillSourceKind = 'project' | 'user' | 'workspace';

export interface SkillInfo {
  name: string;
  description: string;
  body: string;
  path: string;
  source: SkillSourceKind;
  projectId?: string | null;
  projectTitle?: string | null;
}

/** 从本机任意目录导入时的候选 skill（对齐 Multica RuntimeLocalSkillSummary 精简） */
export interface LocalSkillCandidate {
  key: string;
  name: string;
  description: string;
  path: string;
  kind: 'dir' | 'file';
  alreadyIndexed: boolean;
  existingSource: SkillSourceKind | null;
}

let skillIndex = new Map<string, SkillInfo>();

/** 工作区根 .skills（历史「project」目标；C3 起 source=workspace） */
export function projectSkillsDir(): string | null {
  const cwd = resolveWorkspaceCwd().path;
  if (!cwd) return null;
  return resolve(cwd, '.skills');
}

export function workspaceSkillsDir(): string | null {
  return projectSkillsDir();
}

export function userSkillsDir(): string {
  return join(homedir(), '.multi-agent', 'skills');
}

/** F6：某仓库根下的 `.skills`（学 Multica task WorkDir 侧上下文） */
export function skillsDirUnderRoot(root: string | null | undefined): string | null {
  if (!root?.trim()) return null;
  return resolve(root.trim(), '.skills');
}

export type SkillWriteTarget =
  | { kind: 'user' }
  | { kind: 'workspace' }
  | { kind: 'project'; projectId: string };

/**
 * 解析写入根目录。project 需有效 localPath。
 */
export function resolveSkillWriteRoot(
  target: 'user' | 'workspace' | 'project',
  projectId?: string | null,
): {
  root: string | null;
  source: SkillSourceKind;
  projectId: string | null;
  projectTitle: string | null;
  error: string | null;
} {
  if (target === 'user') {
    return {
      root: userSkillsDir(),
      source: 'user',
      projectId: null,
      projectTitle: null,
      error: null,
    };
  }
  if (target === 'workspace') {
    const root = workspaceSkillsDir();
    return {
      root,
      source: 'workspace',
      projectId: null,
      projectTitle: null,
      error: root
        ? null
        : '工作区 cwd 未配置，无法写入工作区 .skills；请改用用户级，或在设置保存工作区路径',
    };
  }
  // project
  if (!projectId?.trim()) {
    return {
      root: null,
      source: 'project',
      projectId: null,
      projectTitle: null,
      error: '写入项目级 skill 需选择 projectId（项目详情绑定的本机路径）',
    };
  }
  const proj = db.select().from(projects).where(eq(projects.id, projectId.trim())).get();
  if (!proj) {
    return {
      root: null,
      source: 'project',
      projectId: projectId.trim(),
      projectTitle: null,
      error: '项目不存在',
    };
  }
  const lp = proj.localPath?.trim();
  if (!lp) {
    return {
      root: null,
      source: 'project',
      projectId: proj.id,
      projectTitle: proj.title,
      error: '项目未绑定本机路径（localPath），无法写入 .skills',
    };
  }
  let abs: string;
  try {
    abs = resolve(lp);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      return {
        root: null,
        source: 'project',
        projectId: proj.id,
        projectTitle: proj.title,
        error: `项目本机路径无效或不是目录: ${abs}`,
      };
    }
  } catch (e) {
    return {
      root: null,
      source: 'project',
      projectId: proj.id,
      projectTitle: proj.title,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  return {
    root: join(abs, '.skills'),
    source: 'project',
    projectId: proj.id,
    projectTitle: proj.title,
    error: null,
  };
}

export function listSkillDestinations(): {
  id: string;
  label: string;
  path: string | null;
}[] {
  const out: { id: string; label: string; path: string | null }[] = [
    { id: 'user', label: '用户 · ~/.multi-agent/skills', path: userSkillsDir() },
    {
      id: 'workspace',
      label: '工作区 · <cwd>/.skills',
      path: workspaceSkillsDir(),
    },
  ];
  try {
    const rows = db.select().from(projects).all();
    for (const p of rows) {
      if (p.status === 'cancelled') continue;
      const lp = p.localPath?.trim();
      out.push({
        id: `project:${p.id}`,
        label: `项目 · ${p.title}${lp ? '' : '（未绑路径）'}`,
        path: lp ? join(resolve(lp), '.skills') : null,
      });
    }
  } catch {
    /* ignore db */
  }
  return out;
}

// 扫描：user → workspace → 各 project.localPath（后扫覆盖同名；project 带 projectId）
export function scanSkills(): void {
  const next = new Map<string, SkillInfo>();
  scanDir(userSkillsDir(), 'user', next);
  const wsDir = workspaceSkillsDir();
  if (wsDir) scanDir(wsDir, 'workspace', next);
  try {
    const rows = db.select().from(projects).all();
    for (const p of rows) {
      const lp = p.localPath?.trim();
      if (!lp) continue;
      try {
        const root = resolve(lp);
        if (!existsSync(root) || !statSync(root).isDirectory()) continue;
        const dir = join(root, '.skills');
        scanDir(dir, 'project', next, { projectId: p.id, projectTitle: p.title });
      } catch {
        /* skip bad path */
      }
    }
  } catch {
    /* ignore */
  }
  skillIndex = next;
}

/**
 * F6：按仓库根即时扫 `.skills`（不写全局索引）。
 * 用于 issue 绑定 project.localPath 时，优先用该仓 skill 正文。
 */
export function loadSkillsFromRoot(root: string): Map<string, SkillInfo> {
  const out = new Map<string, SkillInfo>();
  const dir = skillsDirUnderRoot(root);
  if (dir) scanDir(dir, 'project', out);
  return out;
}

function scanDir(
  dir: string,
  source: SkillSourceKind,
  out: Map<string, SkillInfo>,
  meta?: { projectId?: string | null; projectTitle?: string | null },
): void {
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
      if (existsSync(skillFile)) parseAndStore(skillFile, source, out, meta);
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'SKILL.md') {
      // 扁平形态：<name>.md
      parseAndStore(join(dir, entry.name), source, out, meta);
    }
  }
}

function parseAndStore(
  path: string,
  source: SkillSourceKind,
  out: Map<string, SkillInfo>,
  meta?: { projectId?: string | null; projectTitle?: string | null },
): void {
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
    projectId: meta?.projectId ?? null,
    projectTitle: meta?.projectTitle ?? null,
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
  source: SkillSourceKind;
  path?: string;
  error?: string;
  projectId?: string | null;
};

/**
 * 把候选 skill 写入本仓本地目录。
 * - user: ~/.multi-agent/skills
 * - workspace: <MA_WORKSPACE_CWD>/.skills
 * - project: <project.localPath>/.skills（需 projectId）
 */
export function importLocalSkill(opts: {
  sourcePath: string;
  /** 写入后的 skill name；默认读 frontmatter / 文件名 */
  name?: string;
  description?: string;
  target: 'project' | 'user' | 'workspace';
  projectId?: string | null;
  /** 目标已存在时是否覆盖 */
  overwrite?: boolean;
}): ImportSkillResult {
  const abs = resolve(opts.sourcePath.trim());
  if (!existsSync(abs)) {
    return {
      name: opts.name ?? basename(abs),
      status: 'failed',
      source: opts.target === 'workspace' ? 'workspace' : opts.target,
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

  // 兼容：旧 target=project 且无 projectId → 当 workspace（历史语义）
  const writeTarget =
    opts.target === 'project' && !opts.projectId?.trim()
      ? ('workspace' as const)
      : opts.target;

  const resolved = resolveSkillWriteRoot(writeTarget, opts.projectId);
  if (!resolved.root) {
    return {
      name,
      status: 'failed',
      source: resolved.source,
      projectId: resolved.projectId,
      error:
        resolved.error ??
        '无法解析 skill 写入目录；请改用用户级或绑定项目本机路径',
    };
  }
  const destRoot = resolved.root;

  mkdirSync(destRoot, { recursive: true });
  const dirName = sanitizeSkillDirName(name);
  const destDir = join(destRoot, dirName);
  const destFile = join(destDir, 'SKILL.md');
  const exists = existsSync(destDir) || existsSync(destFile);

  if (exists && !opts.overwrite) {
    return {
      name,
      status: 'skipped',
      source: resolved.source,
      projectId: resolved.projectId,
      path: destDir,
    };
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
      source: resolved.source,
      projectId: resolved.projectId,
      path: destDir,
    };
  } catch (e) {
    return {
      name,
      status: 'failed',
      source: resolved.source,
      projectId: resolved.projectId,
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
