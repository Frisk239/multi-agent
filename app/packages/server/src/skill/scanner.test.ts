/**
 * scanner.ts 完整测试（G5-1：全仓最大测试盲区之一）。
 * 覆盖：多根扫描顺序（builtin < user < workspace < project，后者覆盖同名）、
 * 目录 walk（目录形态 / 扁平形态）、frontmatter 解析（CRLF/引号/缺失回退）、
 * loadSkillsFromRoot、listImportCandidates（候选发现/去重/错误）、
 * importLocalSkill（created/updated/skipped/附属目录复制/失败路径）、
 * resolveSkillWriteRoot（user/workspace/project 解析与错误）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { projects } from '../db/schema.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
  homes: [] as string[],
  wsCwd: null as string | null,
  prevWsCwd: null as string | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!state.db) throw new Error('no db');
    return state.db;
  },
  sqlite: { prepare: () => ({ get: () => ({ '1': 1 }) }) },
  getSqliteHardeningInfo: () => ({
    path: ':memory:', busyTimeoutMs: 5000, journalMode: 'memory', foreignKeys: true,
  }),
  resolveAssigneeLabel: () => 'Test Agent',
  resolveAuthorLabel: () => 'Test User',
}));
// 隔离 HOME + 工作区 cwd：user/workspace 级目录全部指向临时目录
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => state.homes[0] ?? actual.homedir(),
  };
});

import {
  getSkillIndex,
  scanSkills,
  loadSkillsFromRoot,
  listImportCandidates,
  importLocalSkill,
  resolveSkillWriteRoot,
  userSkillsDir,
} from './scanner.js';

function tmpSkillRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return dir;
}

function writeSkill(dir: string, name: string, fm: { name?: string; description?: string }, body = '# body'): string {
  const file = join(dir, name);
  mkdirSync(dirname(file), { recursive: true });
  const fmLines = [
    '---',
    ...(fm.name != null ? [`name: ${fm.name}`] : []),
    ...(fm.description != null ? [`description: ${fm.description}`] : []),
    '---',
    body,
  ].join('\n');
  writeFileSync(file, fmLines, 'utf8');
  return file;
}

describe('scanner 多根扫描顺序', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    state.prevWsCwd = process.env.MA_WORKSPACE_CWD ?? null;
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
    for (const h of state.homes) rmSync(h, { recursive: true, force: true });
    state.homes = [];
    if (state.prevWsCwd == null) delete process.env.MA_WORKSPACE_CWD;
    else process.env.MA_WORKSPACE_CWD = state.prevWsCwd;
    state.wsCwd = null;
    state.prevWsCwd = null;
  });

  it('同名 skill：project 覆盖 workspace 覆盖 user（builtin 最底）', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];
    const ws = tmpSkillRoot('ma-ws-');
    state.wsCwd = ws;
    process.env.MA_WORKSPACE_CWD = ws;
    const proj = tmpSkillRoot('ma-proj-');
    mkdirSync(join(proj, '.skills'), { recursive: true });
    state.db!
      .insert(projects)
      .values({
        id: 'prj-scan-1',
        workspaceId: 'ws-local',
        title: '扫描项目',
        localPath: proj,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    writeSkill(join(home, '.multi-agent', 'skills'), 'foo.md', { name: 'foo', description: 'user 版' }, '# user');
    writeSkill(join(ws, '.skills'), 'foo.md', { name: 'foo', description: 'workspace 版' }, '# workspace');
    writeSkill(join(proj, '.skills'), 'foo.md', { name: 'foo', description: 'project 版' }, '# project');

    scanSkills();
    const s = getSkillIndex().get('foo');
    expect(s?.source).toBe('project');
    expect(s?.body).toContain('# project');
    expect(s?.projectId).toBe('prj-scan-1');
    expect(s?.projectTitle).toBe('扫描项目');

    // 去掉 project 同名 → workspace 版本接管
    rmSync(join(proj, '.skills'), { recursive: true, force: true });
    scanSkills();
    expect(getSkillIndex().get('foo')?.source).toBe('workspace');
    expect(getSkillIndex().get('foo')?.body).toContain('# workspace');

    // 再去掉 workspace → user 版本
    rmSync(join(ws, '.skills'), { recursive: true, force: true });
    scanSkills();
    expect(getSkillIndex().get('foo')?.source).toBe('user');
    expect(getSkillIndex().get('foo')?.body).toContain('# user');
  });

  it('workspace cwd 未配置时跳过 workspace 根，仍扫 user', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];
    writeSkill(join(home, '.multi-agent', 'skills'), 'only-user.md', { name: 'only-user' });
    scanSkills();
    expect(getSkillIndex().get('only-user')?.source).toBe('user');
  });

  it('project.localPath 无效（不存在/非目录）时静默跳过，不炸扫描', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];
    state.db!
      .insert(projects)
      .values({
        id: 'prj-bad',
        workspaceId: 'ws-local',
        title: '坏路径项目',
        localPath: join(tmpdir(), 'ma-nonexistent-dir-xyz'),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    expect(() => scanSkills()).not.toThrow();
  });
});

describe('scanner 目录 walk', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('目录形态 <name>/SKILL.md 与扁平形态 <name>.md 均收录；SKILL.md 不独立成条', () => {
    const home = tmpSkillRoot('ma-walk-');
    state.homes = [home];
    const skills = join(home, '.multi-agent', 'skills');
    // 目录形态
    writeSkill(join(skills, 'dir-skill'), 'SKILL.md', { name: 'dir-skill', description: '目录形态' });
    // 扁平形态
    writeSkill(skills, 'flat-skill.md', { name: 'flat-skill', description: '扁平形态' });
    // 扫描根本身的 SKILL.md（非 <name>.md 形态）应被忽略
    writeSkill(skills, 'SKILL.md', { name: 'root-skill' });

    scanSkills();
    const idx = getSkillIndex();
    expect(idx.get('dir-skill')?.source).toBe('user');
    expect(idx.get('flat-skill')?.source).toBe('user');
    expect(idx.has('root-skill')).toBe(false);
  });

  it('目录形态的 references/templates 子目录不产生 skill 条目', () => {
    const home = tmpSkillRoot('ma-walk-');
    state.homes = [home];
    const skills = join(home, '.multi-agent', 'skills');
    const dir = join(skills, 'with-refs', 'SKILL.md');
    mkdirSync(dirname(dir), { recursive: true });
    writeFileSync(dir, '---\nname: with-refs\ndescription: x\n---\n# body', 'utf8');
    mkdirSync(join(skills, 'with-refs', 'references'), { recursive: true });
    writeFileSync(join(skills, 'with-refs', 'references', 'other.md'), '# other', 'utf8');

    scanSkills();
    const idx = getSkillIndex();
    expect(idx.has('with-refs')).toBe(true);
    expect([...idx.keys()].filter((k) => k !== 'with-refs' && k !== 'ma-mentioning' && k !== 'ma-squads' && k !== 'ma-working-on-issues')).toEqual([]);
  });
});

describe('scanner frontmatter 解析', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('CRLF 行尾的 frontmatter 正常解析（Windows 兼容，防 R4 退化）', () => {
    const home = tmpSkillRoot('ma-fm-');
    state.homes = [home];
    const skills = join(home, '.multi-agent', 'skills');
    mkdirSync(skills, { recursive: true });
    writeFileSync(join(skills, 'crlf.md'), '---\r\nname: crlf-skill\r\ndescription: CRLF 描述\r\n---\r\n# body\r\n', 'utf8');
    scanSkills();
    const s = getSkillIndex().get('crlf-skill');
    expect(s?.description).toBe('CRLF 描述');
    expect(s?.name).toBe('crlf-skill');
  });

  it('带引号的 name/description 剥引号', () => {
    const home = tmpSkillRoot('ma-fm-');
    state.homes = [home];
    const skills = join(home, '.multi-agent', 'skills');
    mkdirSync(skills, { recursive: true });
    writeFileSync(join(skills, 'quoted.md'), '---\nname: "quoted-name"\ndescription: \'单引号描述\'\n---\n# body', 'utf8');
    scanSkills();
    const s = getSkillIndex().get('quoted-name');
    expect(s?.name).toBe('quoted-name');
    expect(s?.description).toBe('单引号描述');
  });

  it('缺 name 或缺 frontmatter → 文件名回退（R4 降级）', () => {
    const home = tmpSkillRoot('ma-fm-');
    state.homes = [home];
    const skills = join(home, '.multi-agent', 'skills');
    mkdirSync(skills, { recursive: true });
    writeFileSync(join(skills, 'no-name.md'), '---\ndescription: 只有描述\n---\n# body', 'utf8');
    writeFileSync(join(skills, 'no-fm.md'), '# 无 frontmatter 的正文', 'utf8');
    scanSkills();
    expect(getSkillIndex().get('no-name')?.description).toBe('只有描述');
    expect(getSkillIndex().get('no-fm')?.body).toContain('无 frontmatter');
  });
});

describe('loadSkillsFromRoot（F6 按仓库根即时扫描）', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('只扫 <root>/.skills 且不污染全局索引；无 .skills 返回空', () => {
    const home = tmpSkillRoot('ma-root-');
    state.homes = [home];
    const root = tmpSkillRoot('ma-repo-');
    mkdirSync(join(root, '.skills'), { recursive: true });
    writeSkill(join(root, '.skills'), 'repo-skill.md', { name: 'repo-skill', description: '仓内' });
    writeSkill(join(home, '.multi-agent', 'skills'), 'user-skill.md', { name: 'user-skill' });

    const map = loadSkillsFromRoot(root);
    expect(map.get('repo-skill')?.source).toBe('project');
    expect(map.has('user-skill')).toBe(false);
    // 全局索引未受影响
    expect(getSkillIndex().has('repo-skill')).toBe(false);

    expect(loadSkillsFromRoot(tmpSkillRoot('ma-empty-')).size).toBe(0);
    expect(loadSkillsFromRoot('').size).toBe(0);
  });
});

describe('listImportCandidates', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
  });

  it('目录：根 SKILL.md + 子目录 SKILL.md + 扁平 md 均发现，SKILL.md 根不计为扁平条', () => {
    const dir = tmpSkillRoot('ma-cand-');
    // 根 SKILL.md（目录本身是 skill 根）
    writeSkill(dir, 'SKILL.md', { name: 'root-skill' });
    // 子目录 skill
    writeSkill(join(dir, 'sub-skill'), 'SKILL.md', { name: 'sub-skill' });
    // 扁平
    writeSkill(dir, 'flat.md', { name: 'flat-skill' });
    // 非 skill 子目录（无 SKILL.md）不产生候选
    mkdirSync(join(dir, 'empty-dir'), { recursive: true });

    const { candidates, error } = listImportCandidates(dir);
    expect(error).toBeNull();
    const byName = new Map(candidates.map((c) => [c.name, c]));
    expect(byName.get('root-skill')?.kind).toBe('dir');
    expect(byName.get('sub-skill')?.kind).toBe('dir');
    expect(byName.get('flat-skill')?.kind).toBe('file');
    expect(byName.has('empty-dir')).toBe(false);
    expect(candidates.map((c) => c.name)).toEqual([...candidates.map((c) => c.name)].sort((a, b) => a.localeCompare(b)));
  });

  it('单文件：.md 为 file；SKILL.md 单文件为 dir', () => {
    const dir = tmpSkillRoot('ma-cand-');
    const md = join(dir, 'single.md');
    writeFileSync(md, '---\nname: single\n---\n# b', 'utf8');
    const f1 = listImportCandidates(md);
    expect(f1.candidates).toHaveLength(1);
    expect(f1.candidates[0]!.kind).toBe('file');

    const sk = join(dir, 'SKILL.md');
    writeFileSync(sk, '---\nname: single-dir\n---\n# b', 'utf8');
    const f2 = listImportCandidates(sk);
    expect(f2.candidates).toHaveLength(1);
    expect(f2.candidates[0]!.kind).toBe('dir');
  });

  it('同名去重（保留先发现：根 SKILL.md 优先于扁平同名）', () => {
    const dir = tmpSkillRoot('ma-cand-');
    writeSkill(dir, 'SKILL.md', { name: 'dup-skill' }, '# root');
    writeSkill(dir, 'dup-skill.md', { name: 'dup-skill' }, '# flat');
    const { candidates } = listImportCandidates(dir);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.kind).toBe('dir');
  });

  it('alreadyIndexed / existingSource 对照全局索引', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];
    writeSkill(join(home, '.multi-agent', 'skills'), 'indexed-skill.md', { name: 'indexed-skill' });
    scanSkills();
    const dir = tmpSkillRoot('ma-cand-');
    writeSkill(dir, 'indexed-skill.md', { name: 'indexed-skill' });
    writeSkill(dir, 'new-skill.md', { name: 'new-skill' });
    const { candidates } = listImportCandidates(dir);
    const indexed = candidates.find((c) => c.name === 'indexed-skill');
    const fresh = candidates.find((c) => c.name === 'new-skill');
    expect(indexed?.alreadyIndexed).toBe(true);
    expect(indexed?.existingSource).toBe('user');
    expect(fresh?.alreadyIndexed).toBe(false);
    expect(fresh?.existingSource).toBeNull();
  });

  it('错误：路径不存在 / 非 .md 文件', () => {
    const r1 = listImportCandidates(join(tmpdir(), 'ma-no-such-path-xyz'));
    expect(r1.error).toBe('路径不存在');
    expect(r1.candidates).toEqual([]);

    const dir = tmpSkillRoot('ma-cand-');
    const txt = join(dir, 'notes.txt');
    writeFileSync(txt, 'hello', 'utf8');
    const r2 = listImportCandidates(txt);
    expect(r2.error).toContain('请选择目录或 .md');
  });
});

describe('importLocalSkill', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    state.prevWsCwd = process.env.MA_WORKSPACE_CWD ?? null;
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
    if (state.prevWsCwd == null) delete process.env.MA_WORKSPACE_CWD;
    else process.env.MA_WORKSPACE_CWD = state.prevWsCwd;
    state.prevWsCwd = null;
  });

  it('扁平 .md → created，frontmatter name/description 写入目标', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];
    const src = tmpSkillRoot('ma-src-');
    const md = writeSkill(src, 'my-skill.md', { name: 'my-skill', description: '导入描述' }, '# 正文');

    const r = importLocalSkill({ sourcePath: md, target: 'user' });
    expect(r.status).toBe('created');
    expect(r.source).toBe('user');
    const dest = join(userSkillsDir(), 'my-skill', 'SKILL.md');
    expect(existsSync(dest)).toBe(true);
    const raw = readFileSync(dest, 'utf8');
    expect(raw).toContain('name: "my-skill"');
    expect(raw).toContain('description: "导入描述"');
    expect(raw).toContain('# 正文');
  });

  it('已存在无 overwrite → skipped；overwrite → updated 且内容刷新', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];
    const src = tmpSkillRoot('ma-src-');
    const md = writeSkill(src, 'again.md', { name: 'again', description: 'v2' }, '# v2 正文');

    const r1 = importLocalSkill({ sourcePath: md, target: 'user' });
    expect(r1.status).toBe('created');

    const r2 = importLocalSkill({ sourcePath: md, target: 'user' });
    expect(r2.status).toBe('skipped');

    const r3 = importLocalSkill({ sourcePath: md, target: 'user', overwrite: true });
    expect(r3.status).toBe('updated');
    expect(r3.path).toBe(r1.path);
  });

  it('目录形态：复制 references/templates/scripts/assets 附属目录', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];
    const src = tmpSkillRoot('ma-src-');
    const skillDir = join(src, 'packed');
    writeSkill(skillDir, 'SKILL.md', { name: 'packed', description: 'x' });
    for (const sub of ['references', 'templates', 'scripts', 'assets']) {
      mkdirSync(join(skillDir, sub), { recursive: true });
      writeFileSync(join(skillDir, sub, 'file.txt'), 'data', 'utf8');
    }
    // 非白名单子目录不复制
    mkdirSync(join(skillDir, 'other'), { recursive: true });
    writeFileSync(join(skillDir, 'other', 'x.txt'), 'x', 'utf8');

    const r = importLocalSkill({ sourcePath: skillDir, target: 'user' });
    expect(r.status).toBe('created');
    const dest = r.path!;
    for (const sub of ['references', 'templates', 'scripts', 'assets']) {
      expect(existsSync(join(dest, sub, 'file.txt'))).toBe(true);
    }
    expect(existsSync(join(dest, 'other'))).toBe(false);
  });

  it('失败路径：目录无 SKILL.md / 非 .md 文件 / 源不存在 / workspace 无 cwd', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];

    const emptyDir = tmpSkillRoot('ma-empty-');
    const r1 = importLocalSkill({ sourcePath: emptyDir, target: 'user' });
    expect(r1.status).toBe('failed');
    expect(r1.error).toContain('无 SKILL.md');

    const txt = join(emptyDir, 'a.txt');
    writeFileSync(txt, 'x', 'utf8');
    const r2 = importLocalSkill({ sourcePath: txt, target: 'user' });
    expect(r2.status).toBe('failed');
    expect(r2.error).toContain('仅支持 .md');

    const r3 = importLocalSkill({ sourcePath: join(tmpdir(), 'ma-no-src-xyz'), target: 'user' });
    expect(r3.status).toBe('failed');
    expect(r3.error).toBe('源路径不存在');

    // 无 workspace cwd（env 与 DB 均未配置）→ workspace 目标失败，error 有引导文案
    const src = tmpSkillRoot('ma-src-');
    const md = writeSkill(src, 'ws-only.md', { name: 'ws-only' });
    const r4 = importLocalSkill({ sourcePath: md, target: 'workspace' });
    expect(r4.status).toBe('failed');
    expect(r4.error).toContain('工作区 cwd 未配置');
  });

  it('Windows 非法字符 sanitize：目标目录名安全化', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];
    const src = tmpSkillRoot('ma-src-');
    // name 含 < > : " / \ | ? * 与控制字符 → 全部替换为 -
    const md = writeSkill(src, 'weird.md', { name: 'a<b>c:d' });
    const r = importLocalSkill({ sourcePath: md, target: 'user' });
    expect(r.status).toBe('created');
    expect(r.path).toContain('a-b-c-d');
    // 空白折叠 + 空名回退 skill
    const md2 = writeSkill(src, 'weird2.md', { name: '  x   y  ' });
    const r2 = importLocalSkill({ sourcePath: md2, target: 'user' });
    expect(r2.status).toBe('created');
    expect(r2.path).toContain('x-y');
  });

  it('project target 无 projectId → 按历史语义落到 workspace（有 cwd 时）', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];
    const ws = tmpSkillRoot('ma-ws-');
    process.env.MA_WORKSPACE_CWD = ws;
    const src = tmpSkillRoot('ma-src-');
    const md = writeSkill(src, 'legacy.md', { name: 'legacy' });
    const r = importLocalSkill({ sourcePath: md, target: 'project' });
    expect(r.status).toBe('created');
    expect(r.source).toBe('workspace');
    expect(existsSync(join(ws, '.skills', 'legacy', 'SKILL.md'))).toBe(true);
  });
});

describe('resolveSkillWriteRoot', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    state.prevWsCwd = process.env.MA_WORKSPACE_CWD ?? null;
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
    if (state.prevWsCwd == null) delete process.env.MA_WORKSPACE_CWD;
    else process.env.MA_WORKSPACE_CWD = state.prevWsCwd;
    state.prevWsCwd = null;
  });

  it('user → ~/.multi-agent/skills；workspace → env cwd/.skills', () => {
    const home = tmpSkillRoot('ma-home-');
    state.homes = [home];
    const r1 = resolveSkillWriteRoot('user');
    expect(r1.root).toBe(join(home, '.multi-agent', 'skills'));
    expect(r1.error).toBeNull();

    const ws = tmpSkillRoot('ma-ws-');
    process.env.MA_WORKSPACE_CWD = ws;
    const r2 = resolveSkillWriteRoot('workspace');
    expect(r2.root).toBe(join(ws, '.skills'));
    expect(r2.error).toBeNull();
  });

  it('workspace 无 cwd（env 与 DB 均无）→ error 引导', () => {
    delete process.env.MA_WORKSPACE_CWD;
    const r = resolveSkillWriteRoot('workspace');
    expect(r.root).toBeNull();
    expect(r.error).toContain('工作区 cwd 未配置');
  });

  it('project：无 projectId / 项目不存在 / 无 localPath / localPath 无效 → 各返回对应错误', () => {
    const r1 = resolveSkillWriteRoot('project', undefined);
    expect(r1.root).toBeNull();
    expect(r1.error).toContain('需选择 projectId');

    const r2 = resolveSkillWriteRoot('project', 'prj-unknown');
    expect(r2.root).toBeNull();
    expect(r2.error).toBe('项目不存在');

    state.db!
      .insert(projects)
      .values({
        id: 'prj-nopath',
        workspaceId: 'ws-local',
        title: '未绑路径',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    const r3 = resolveSkillWriteRoot('project', 'prj-nopath');
    expect(r3.root).toBeNull();
    expect(r3.error).toContain('未绑定本机路径');

    state.db!
      .insert(projects)
      .values({
        id: 'prj-badpath',
        workspaceId: 'ws-local',
        title: '坏路径',
        localPath: join(tmpdir(), 'ma-no-such-dir-abc'),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    const r4 = resolveSkillWriteRoot('project', 'prj-badpath');
    expect(r4.root).toBeNull();
    expect(r4.error).toContain('无效或不是目录');
  });

  it('project 有效 localPath → join(abs, .skills)，source=project，带 projectId/title', () => {
    const proj = tmpSkillRoot('ma-proj-');
    state.db!
      .insert(projects)
      .values({
        id: 'prj-ok',
        workspaceId: 'ws-local',
        title: '有效项目',
        localPath: proj,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    const r = resolveSkillWriteRoot('project', 'prj-ok');
    expect(r.root).toBe(join(proj, '.skills'));
    expect(r.source).toBe('project');
    expect(r.projectId).toBe('prj-ok');
    expect(r.projectTitle).toBe('有效项目');
  });

  it('project 分支查询走 db（mock 下无 db → 抛错而非返回半成品）', () => {
    // state.db 为 null 时 resolveSkillWriteRoot('project', x) 应因 mock 抛错
    const saved = state.db;
    state.db = null;
    expect(() => resolveSkillWriteRoot('project', 'prj-any')).toThrow();
    state.db = saved;
  });
});
