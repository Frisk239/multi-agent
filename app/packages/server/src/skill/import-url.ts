// Skills URL 导入（学 Multica ImportSkill：github / skills.sh / clawhub）
// 差异：不落云 DB，下载后写入本地 .skills 或 ~/.multi-agent/skills，再 scanSkills。

import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  resolveSkillWriteRoot,
  scanSkills,
  getSkillIndex,
  type ImportSkillResult,
  type SkillSourceKind,
} from './scanner.js';

const MAX_FILE_BYTES = 1 << 20; // 1 MiB
const FETCH_TIMEOUT_MS = 25_000;
const CLAWHUB_API = 'https://clawhub.ai/api/v1';

function sanitizeSkillDirName(name: string): string {
  const s = name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/\.+$/g, '');
  return s || 'skill';
}

function parseFrontmatter(raw: string): {
  frontmatter: { name?: string; description?: string };
  body: string;
} {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) return { frontmatter: {}, body: raw };
  const frontmatter: { name?: string; description?: string } = {};
  for (const line of fmMatch[1]!.split(/\r?\n/)) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m && (m[1] === 'name' || m[1] === 'description')) {
      frontmatter[m[1] as 'name' | 'description'] = m[2]!
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  }
  return { frontmatter, body: fmMatch[2] ?? '' };
}

function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (!/^https?:\/\//i.test(t)) return `https://${t}`;
  return t;
}

type Detected =
  | { kind: 'github'; owner: string; repo: string; ref?: string; skillDir?: string; sourceUrl: string }
  | { kind: 'skills_sh'; owner: string; repo: string; skill: string; sourceUrl: string }
  | { kind: 'clawhub'; slug: string; sourceUrl: string }
  | { kind: 'raw_md'; url: string; sourceUrl: string };

function detectUrl(raw: string): Detected {
  const sourceUrl = normalizeUrl(raw);
  let u: URL;
  try {
    u = new URL(sourceUrl);
  } catch {
    throw new Error('无效 URL');
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean);

  if (host === 'skills.sh' || host === 'www.skills.sh') {
    // skills.sh/{owner}/{repo}/{skill}
    if (parts.length < 3) {
      throw new Error('skills.sh URL 需形如 skills.sh/{owner}/{repo}/{skill}');
    }
    return {
      kind: 'skills_sh',
      owner: parts[0]!,
      repo: parts[1]!,
      skill: parts[2]!,
      sourceUrl,
    };
  }

  if (host === 'clawhub.ai' || host === 'www.clawhub.ai') {
    // clawhub.ai/{owner}/{slug} 或 /{slug}
    if (parts.length === 0) throw new Error('ClawHub URL 缺少 skill slug');
    const slug = parts.length >= 2 ? parts[1]! : parts[0]!;
    return { kind: 'clawhub', slug, sourceUrl };
  }

  if (host === 'github.com' || host === 'www.github.com') {
    if (parts.length < 2) {
      throw new Error('GitHub URL 需形如 github.com/{owner}/{repo}[/tree/{ref}/{path}]');
    }
    const owner = parts[0]!;
    const repo = parts[1]!.replace(/\.git$/, '');
    let ref: string | undefined;
    let skillDir: string | undefined;
    if (parts[2] === 'tree' || parts[2] === 'blob') {
      // optimistic: single-segment ref
      ref = parts[3];
      const rest = parts.slice(4);
      if (rest.length) {
        // drop trailing SKILL.md
        const last = rest[rest.length - 1]!;
        if (last.toUpperCase() === 'SKILL.MD') rest.pop();
        skillDir = rest.length ? rest.join('/') : undefined;
      }
    }
    return { kind: 'github', owner, repo, ref, skillDir, sourceUrl };
  }

  if (host === 'raw.githubusercontent.com') {
    return { kind: 'raw_md', url: sourceUrl, sourceUrl };
  }

  // 任意直链 .md
  if (/\.md($|\?)/i.test(u.pathname) || u.pathname.endsWith('/SKILL.md')) {
    return { kind: 'raw_md', url: sourceUrl, sourceUrl };
  }

  throw new Error(
    `不支持的来源：${host}（支持 github.com / skills.sh / clawhub.ai / 直链 .md）`,
  );
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'user-agent': 'multi-agent-skill-import/1.0',
        accept: 'text/plain,text/markdown,application/json,*/*',
        ...(init?.headers ?? {}),
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`下载失败 HTTP ${res.status} · ${url}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_FILE_BYTES) {
      throw new Error(`文件超过 ${MAX_FILE_BYTES} 字节上限`);
    }
    return buf.toString('utf8');
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGitHubDefaultBranch(owner: string, repo: string): Promise<string> {
  try {
    const raw = await fetchText(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN
          ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    });
    const j = JSON.parse(raw) as { default_branch?: string };
    return j.default_branch?.trim() || 'main';
  } catch {
    return 'main';
  }
}

function rawGithubUrl(owner: string, repo: string, ref: string, filePath: string): string {
  const segs = filePath
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${segs}`;
}

async function tryFetchSkillMd(
  owner: string,
  repo: string,
  ref: string,
  dirs: string[],
): Promise<{ content: string; skillDir: string }> {
  const errors: string[] = [];
  for (const dir of dirs) {
    const rel = dir ? `${dir.replace(/\/$/, '')}/SKILL.md` : 'SKILL.md';
    const url = rawGithubUrl(owner, repo, ref, rel);
    try {
      const content = await fetchText(url);
      return { content, skillDir: dir };
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(
    `未找到 SKILL.md（${owner}/${repo}@${ref}）。尝试路径：${dirs.map((d) => d || '(root)').join(', ')}`,
  );
}

type Fetched = {
  name: string;
  description: string;
  content: string;
  originType: string;
  sourceUrl: string;
};

async function fetchSkillBundle(d: Detected): Promise<Fetched> {
  if (d.kind === 'raw_md') {
    const content = await fetchText(d.url);
    const { frontmatter } = parseFrontmatter(content);
    const base =
      frontmatter.name ||
      decodeURIComponent(d.url.split('/').pop() || 'skill').replace(/\.md$/i, '');
    return {
      name: base,
      description: frontmatter.description ?? '',
      content,
      originType: 'raw',
      sourceUrl: d.sourceUrl,
    };
  }

  if (d.kind === 'github') {
    const ref = d.ref || (await fetchGitHubDefaultBranch(d.owner, d.repo));
    const dirs = d.skillDir != null ? [d.skillDir] : [''];
    // also try common multi-skill layouts when no path given
    if (d.skillDir == null) {
      dirs.push('skills', '.claude/skills');
    }
    // When skillDir given, only that path; when empty, try root first
    const tryDirs =
      d.skillDir != null
        ? [d.skillDir]
        : ['', /* root first */];
    let content: string;
    try {
      const got = await tryFetchSkillMd(d.owner, d.repo, ref, tryDirs);
      content = got.content;
    } catch {
      // fallback: if root failed and no skillDir, fail clearly
      throw new Error(
        `SKILL.md not found at github.com/${d.owner}/${d.repo}@${ref}${
          d.skillDir ? `/${d.skillDir}` : ''
        }. 多 skill 仓库请用 /tree/{ref}/{skill-dir} 形式`,
      );
    }
    const { frontmatter } = parseFrontmatter(content);
    const name =
      frontmatter.name ||
      (d.skillDir ? d.skillDir.split('/').pop()! : d.repo);
    return {
      name,
      description: frontmatter.description ?? '',
      content,
      originType: 'github',
      sourceUrl: d.sourceUrl,
    };
  }

  if (d.kind === 'skills_sh') {
    const ref = await fetchGitHubDefaultBranch(d.owner, d.repo);
    const candidateDirs = [
      `skills/${d.skill}`,
      `.claude/skills/${d.skill}`,
      `plugin/skills/${d.skill}`,
      d.skill,
    ];
    let content: string | null = null;
    for (const dir of candidateDirs) {
      try {
        content = await fetchText(rawGithubUrl(d.owner, d.repo, ref, `${dir}/SKILL.md`));
        break;
      } catch {
        /* next */
      }
    }
    if (!content) {
      // root SKILL.md only when frontmatter name matches
      try {
        const root = await fetchText(rawGithubUrl(d.owner, d.repo, ref, 'SKILL.md'));
        const { frontmatter } = parseFrontmatter(root);
        if (!frontmatter.name || frontmatter.name === d.skill) content = root;
      } catch {
        /* ignore */
      }
    }
    if (!content) {
      throw new Error(
        `skills.sh 未找到 skill「${d.skill}」于 ${d.owner}/${d.repo}@${ref}`,
      );
    }
    const { frontmatter } = parseFrontmatter(content);
    return {
      name: frontmatter.name || d.skill,
      description: frontmatter.description ?? '',
      content,
      originType: 'skills_sh',
      sourceUrl: d.sourceUrl,
    };
  }

  // clawhub —— 优先 API 元数据 + file 下载；失败则报错
  const metaRaw = await fetchText(
    `${CLAWHUB_API}/skills/${encodeURIComponent(d.slug)}`,
  );
  let displayName = d.slug;
  let summary = '';
  try {
    const meta = JSON.parse(metaRaw) as {
      skill?: {
        slug?: string;
        displayName?: string;
        summary?: string;
        tags?: Record<string, string>;
      };
      latestVersion?: { version?: string };
    };
    if (meta.skill?.displayName) displayName = meta.skill.displayName;
    if (meta.skill?.summary) summary = meta.skill.summary;
  } catch {
    /* meta optional */
  }

  const clawCandidates = [
    `${CLAWHUB_API}/skills/${encodeURIComponent(d.slug)}/file?path=${encodeURIComponent('SKILL.md')}`,
    `${CLAWHUB_API}/skills/${encodeURIComponent(d.slug)}/files/SKILL.md`,
    `https://clawhub.ai/api/skills/${encodeURIComponent(d.slug)}/file?path=SKILL.md`,
  ];
  let skillMd = '';
  let lastErr = '';
  for (const url of clawCandidates) {
    try {
      skillMd = await fetchText(url);
      if (skillMd.trim()) break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  if (!skillMd.trim()) {
    throw new Error(
      `ClawHub skill「${d.slug}」未取到 SKILL.md${lastErr ? ` · ${lastErr}` : ''}`,
    );
  }

  const { frontmatter } = parseFrontmatter(skillMd);
  return {
    name: frontmatter.name || displayName || d.slug,
    description: frontmatter.description || summary || '',
    content: skillMd,
    originType: 'clawhub',
    sourceUrl: d.sourceUrl,
  };
}

function writeSkillMarkdown(opts: {
  name: string;
  description: string;
  content: string;
  target: 'project' | 'user' | 'workspace';
  projectId?: string | null;
  overwrite?: boolean;
  originType?: string;
  sourceUrl?: string;
}): ImportSkillResult {
  const writeTarget =
    opts.target === 'project' && !opts.projectId?.trim()
      ? ('workspace' as const)
      : opts.target;
  const resolved = resolveSkillWriteRoot(writeTarget, opts.projectId);
  const destRoot = resolved.root;
  if (!destRoot) {
    return {
      name: opts.name,
      status: 'failed',
      source: resolved.source,
      projectId: resolved.projectId,
      error:
        resolved.error ??
        '无法解析 skill 写入目录；请改用用户级或绑定项目本机路径',
    };
  }

  const dirName = sanitizeSkillDirName(opts.name);
  const destDir = join(destRoot, dirName);
  const destFile = join(destDir, 'SKILL.md');
  const exists = existsSync(destDir) || existsSync(destFile);

  if (exists && !opts.overwrite) {
    return {
      name: opts.name,
      status: 'skipped',
      source: resolved.source,
      projectId: resolved.projectId,
      path: destDir,
    };
  }

  try {
    mkdirSync(destRoot, { recursive: true });
    if (exists && opts.overwrite) {
      // 覆盖时清目录再写，避免残留脏文件
      try {
        rmSync(destDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    mkdirSync(destDir, { recursive: true });

    const parsed = parseFrontmatter(opts.content);
    const body = parsed.body ?? opts.content;
    const name = opts.name;
    const description = opts.description;
    const originLines =
      opts.sourceUrl != null
        ? `origin_type: ${JSON.stringify(opts.originType ?? 'url')}\norigin_url: ${JSON.stringify(opts.sourceUrl)}\n`
        : '';
    const md = `---\nname: ${JSON.stringify(name)}\ndescription: ${JSON.stringify(description)}\n${originLines}---\n${
      body.startsWith('\n') ? body : `\n${body}`
    }`;
    writeFileSync(destFile, md, 'utf8');
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
      name: opts.name,
      status: 'failed',
      source: resolved.source,
      projectId: resolved.projectId,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type ImportSkillFromUrlResult = ImportSkillResult & {
  originType?: string;
  sourceUrl?: string;
  alreadyIndexed?: boolean;
};

/**
 * 从 URL 下载 skill 并写入本地目录（非云端）。
 * 支持：github.com · skills.sh · clawhub.ai · 直链 .md
 */
export async function importSkillFromUrl(opts: {
  url: string;
  target: 'project' | 'user' | 'workspace';
  projectId?: string | null;
  overwrite?: boolean;
  name?: string;
}): Promise<ImportSkillFromUrlResult> {
  const failSource: SkillSourceKind =
    opts.target === 'workspace'
      ? 'workspace'
      : opts.target === 'user'
        ? 'user'
        : 'project';
  try {
    const detected = detectUrl(opts.url);
    const fetched = await fetchSkillBundle(detected);
    const name = (opts.name?.trim() || fetched.name).trim();
    if (!name) {
      return {
        name: 'unknown',
        status: 'failed',
        source: failSource,
        error: '无法解析 skill 名称',
        sourceUrl: fetched.sourceUrl,
        originType: fetched.originType,
      };
    }
    const existing = getSkillIndex().get(name);
    const written = writeSkillMarkdown({
      name,
      description: fetched.description,
      content: fetched.content,
      target: opts.target,
      projectId: opts.projectId,
      overwrite: opts.overwrite,
      originType: fetched.originType,
      sourceUrl: fetched.sourceUrl,
    });
    return {
      ...written,
      originType: fetched.originType,
      sourceUrl: fetched.sourceUrl,
      alreadyIndexed: Boolean(existing),
    };
  } catch (e) {
    return {
      name: opts.name?.trim() || 'unknown',
      status: 'failed',
      source: failSource,
      projectId: opts.projectId ?? null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
