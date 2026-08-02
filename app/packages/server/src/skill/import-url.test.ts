/**
 * import-url.ts 完整测试（G5-1：零测试历史清零）。
 * 覆盖：URL 来源识别（github tree/blob/ref / skills.sh / clawhub / 直链 .md / 归一化与错误）、
 * GitHub API 解析（default_branch 解析与失败回退）、多 skill 布局 fallback 顺序、
 * raw_md / skills.sh / clawhub 下载路径、大小上限、HTTP 失败、超时 abort（竞态）、
 * 写入语义（created/updated/skipped + alreadyIndexed）、并发导入、失败路径不落盘。
 * fetch 全部 stub：无真实网络。
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
import { join } from 'node:path';
import { createTestDb } from '../__test-helpers__/test-db.js';

const state = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
  homes: [] as string[],
  prevWsCwd: null as string | null,
  calls: [] as string[],
  handler: null as
    | null
    | ((url: string, init?: RequestInit) => Response | Promise<Response>),
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
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => state.homes[0] ?? actual.homedir(),
  };
});

import { detectUrl, importSkillFromUrl } from './import-url.js';
import { scanSkills, userSkillsDir } from './scanner.js';

const SKILL_MD = `---
name: hello-world
description: 测试 skill
---
# 用法
run 一下
`;

function ok(body: BodyInit, status = 200): Response {
  return new Response(body, { status });
}
const notFound = () => ok('Not Found', 404);

/** 与实现同口径的 raw.githubusercontent.com URL 编码 */
function rawUrl(owner: string, repo: string, ref: string, path: string): string {
  const segs = path
    .split('/')
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${segs}`;
}

function setUpHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'ma-imp-home-'));
  state.homes = [home];
  return home;
}

describe('detectUrl URL 来源识别', () => {
  it('github 根 URL：owner/repo，.git 后缀剥除，无 ref/skillDir', () => {
    expect(detectUrl('https://github.com/acme/toolkit')).toMatchObject({
      kind: 'github', owner: 'acme', repo: 'toolkit', ref: undefined, skillDir: undefined,
    });
    expect(detectUrl('https://github.com/acme/toolkit.git')).toMatchObject({ repo: 'toolkit' });
    expect(detectUrl('github.com/acme/toolkit/')).toMatchObject({ owner: 'acme', repo: 'toolkit' });
  });

  it('github tree/blob：单段 ref + 剩余路径为 skillDir；尾部 SKILL.md 剥除', () => {
    expect(detectUrl('https://github.com/acme/toolkit/tree/main/skills/deploy')).toMatchObject({
      kind: 'github', owner: 'acme', repo: 'toolkit', ref: 'main', skillDir: 'skills/deploy',
    });
    expect(
      detectUrl('https://github.com/acme/toolkit/tree/main/skills/deploy/SKILL.md'),
    ).toMatchObject({ ref: 'main', skillDir: 'skills/deploy' });
    expect(
      detectUrl('https://github.com/acme/toolkit/blob/v1.2.3/skills/deploy/SKILL.md'),
    ).toMatchObject({ ref: 'v1.2.3', skillDir: 'skills/deploy' });
    // tree 无路径 → skillDir undefined（整个仓库）
    expect(detectUrl('https://github.com/acme/toolkit/tree/main')).toMatchObject({
      ref: 'main', skillDir: undefined,
    });
  });

  it('github URL 段数不足 → 报错', () => {
    expect(() => detectUrl('https://github.com/acme')).toThrow('GitHub URL 需形如');
  });

  it('skills.sh：owner/repo/skill；段数不足报错', () => {
    expect(detectUrl('https://skills.sh/acme/toolkit/deploy')).toMatchObject({
      kind: 'skills_sh', owner: 'acme', repo: 'toolkit', skill: 'deploy',
    });
    expect(detectUrl('www.skills.sh/acme/toolkit/deploy')).toMatchObject({ kind: 'skills_sh' });
    expect(() => detectUrl('https://skills.sh/acme/toolkit')).toThrow('skills.sh URL 需形如');
  });

  it('clawhub：/{slug} 与 /{owner}/{slug} 均取末段 slug', () => {
    expect(detectUrl('https://clawhub.ai/awesome-skill')).toMatchObject({
      kind: 'clawhub', slug: 'awesome-skill',
    });
    expect(detectUrl('https://clawhub.ai/acme/awesome-skill')).toMatchObject({
      kind: 'clawhub', slug: 'awesome-skill',
    });
  });

  it('raw.githubusercontent.com 与任意 .md 直链 → raw_md', () => {
    expect(
      detectUrl('https://raw.githubusercontent.com/acme/toolkit/main/skills/deploy/SKILL.md'),
    ).toMatchObject({ kind: 'raw_md' });
    expect(detectUrl('https://example.com/notes/skill.md')).toMatchObject({ kind: 'raw_md' });
    expect(detectUrl('https://example.com/notes/skill.md?raw=1')).toMatchObject({ kind: 'raw_md' });
  });

  it('无 scheme 自动补 https；无效 URL / 不支持 host 报错', () => {
    expect(detectUrl('example.com/notes/skill.md')).toMatchObject({
      kind: 'raw_md', url: 'https://example.com/notes/skill.md',
    });
    expect(() => detectUrl('not a url')).toThrow('无效 URL');
    expect(() => detectUrl('https://example.com/notes/txt')).toThrow('不支持的来源');
  });
});

describe('importSkillFromUrl raw_md', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    setUpHome();
    scanSkills(); // 重置全局索引（隔离：删文件不自动清索引）
    state.handler = null;
    state.calls = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      state.calls.push(String(url));
      if (!state.handler) throw new Error('no fetch handler');
      return Promise.resolve(state.handler(String(url), init));
    });
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
    for (const h of state.homes) rmSync(h, { recursive: true, force: true });
    state.homes = [];
    vi.unstubAllGlobals();
    state.calls = [];
    state.handler = null;
  });

  it('直链 .md：frontmatter name/description 入库，origin_type/origin_url 写入文件', async () => {
    state.handler = () => ok(SKILL_MD);
    const r = await importSkillFromUrl({
      url: 'https://example.com/skills/hello.md',
      target: 'user',
    });
    expect(r.status).toBe('created');
    expect(r.originType).toBe('raw');
    expect(r.sourceUrl).toBe('https://example.com/skills/hello.md');
    const dest = join(userSkillsDir(), 'hello-world', 'SKILL.md');
    expect(existsSync(dest)).toBe(true);
    const raw = readFileSync(dest, 'utf8');
    expect(raw).toContain('name: "hello-world"');
    expect(raw).toContain('description: "测试 skill"');
    expect(raw).toContain('origin_type: "raw"');
    expect(raw).toContain('origin_url: "https://example.com/skills/hello.md"');
  });

  it('无 frontmatter → 文件名回退 name；opts.name 显式覆盖', async () => {
    state.handler = () => ok('# no frontmatter\n正文');
    const r1 = await importSkillFromUrl({ url: 'https://example.com/skills/my-tool.md', target: 'user' });
    expect(r1.status).toBe('created');
    expect(r1.name).toBe('my-tool');

    const r2 = await importSkillFromUrl({
      url: 'https://example.com/skills/whatever.md',
      target: 'user',
      name: 'renamed-skill',
    });
    expect(r2.status).toBe('created');
    expect(r2.name).toBe('renamed-skill');
  });

  it('HTTP 404 → failed「下载失败 HTTP 404」，不落盘', async () => {
    state.handler = () => notFound();
    const r = await importSkillFromUrl({ url: 'https://example.com/missing.md', target: 'user' });
    expect(r.status).toBe('failed');
    expect(r.error).toContain('下载失败 HTTP 404');
    expect(existsSync(userSkillsDir())).toBe(false);
  });

  it('超过 1MiB 上限 → failed', async () => {
    const big = new Uint8Array((1 << 20) + 1);
    state.handler = () => ok(big);
    const r = await importSkillFromUrl({ url: 'https://example.com/huge.md', target: 'user' });
    expect(r.status).toBe('failed');
    expect(r.error).toContain('超过');
  });

  it('超时 abort：fetch 挂起 25s 后被 signal 中断 → failed（不无限等待）', async () => {
    vi.useFakeTimers();
    try {
      state.handler = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      const p = importSkillFromUrl({ url: 'https://example.com/slow.md', target: 'user' });
      await vi.advanceTimersByTimeAsync(25_000);
      const r = await p;
      expect(r.status).toBe('failed');
      expect(r.error).toMatch(/aborted/i);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('importSkillFromUrl github', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    setUpHome();
    scanSkills(); // 重置全局索引（隔离：删文件不自动清索引）
    state.handler = null;
    state.calls = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      state.calls.push(String(url));
      if (!state.handler) throw new Error('no fetch handler');
      return Promise.resolve(state.handler(String(url), init));
    });
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
    for (const h of state.homes) rmSync(h, { recursive: true, force: true });
    state.homes = [];
    vi.unstubAllGlobals();
    state.calls = [];
    state.handler = null;
  });

  it('无 ref：先调 GitHub API 解析 default_branch，再取 raw 根 SKILL.md', async () => {
    state.handler = (url) => {
      if (url.startsWith('https://api.github.com/repos/acme/toolkit')) {
        return ok(JSON.stringify({ default_branch: 'trunk' }));
      }
      if (url === rawUrl('acme', 'toolkit', 'trunk', 'SKILL.md')) return ok(SKILL_MD);
      return notFound();
    };
    const r = await importSkillFromUrl({ url: 'https://github.com/acme/toolkit', target: 'user' });
    expect(r.status).toBe('created');
    expect(r.originType).toBe('github');
    expect(state.calls[0]).toBe('https://api.github.com/repos/acme/toolkit');
    expect(state.calls[1]).toBe(rawUrl('acme', 'toolkit', 'trunk', 'SKILL.md'));
  });

  it('default_branch API 失败 → 回退 main 继续', async () => {
    state.handler = (url) => {
      if (url.startsWith('https://api.github.com')) return notFound();
      if (url === rawUrl('acme', 'toolkit', 'main', 'SKILL.md')) return ok(SKILL_MD);
      return notFound();
    };
    const r = await importSkillFromUrl({ url: 'https://github.com/acme/toolkit', target: 'user' });
    expect(r.status).toBe('created');
  });

  it('带 ref（/tree/{ref}）：不调 API，直接按 ref 拉取', async () => {
    state.handler = (url) => {
      if (url === rawUrl('acme', 'toolkit', 'v1.0.0', 'SKILL.md')) return ok(SKILL_MD);
      return notFound();
    };
    const r = await importSkillFromUrl({
      url: 'https://github.com/acme/toolkit/tree/v1.0.0',
      target: 'user',
    });
    expect(r.status).toBe('created');
    expect(state.calls.every((c) => !c.startsWith('https://api.github.com'))).toBe(true);
  });

  it('带 skillDir：只试该目录，不 fallback', async () => {
    const urls: string[] = [];
    state.handler = (url) => {
      urls.push(url);
      if (url === rawUrl('acme', 'mono', 'main', 'skills/deploy/SKILL.md')) return ok(SKILL_MD);
      return notFound();
    };
    const r = await importSkillFromUrl({
      url: 'https://github.com/acme/mono/tree/main/skills/deploy',
      target: 'user',
    });
    expect(r.status).toBe('created');
    expect(urls).toHaveLength(1);
  });

  it('无 skillDir：fallback 序列 root → skills → .claude/skills，首个 200 即用', async () => {
    const tries: string[] = [];
    state.handler = (url) => {
      tries.push(url);
      if (url === rawUrl('acme', 'mono', 'main', '.claude/skills/SKILL.md')) {
        return ok('---\nname: nested-skill\ndescription: 嵌套\n---\n# body');
      }
      return notFound();
    };
    const r = await importSkillFromUrl({ url: 'https://github.com/acme/mono', target: 'user' });
    expect(r.status).toBe('created');
    expect(r.name).toBe('nested-skill');
    // 首个请求是 default_branch API；随后按候选顺序请求 raw
    expect(tries[0]).toBe('https://api.github.com/repos/acme/mono');
    expect(tries.slice(1)).toEqual([
      rawUrl('acme', 'mono', 'main', 'SKILL.md'),
      rawUrl('acme', 'mono', 'main', 'skills/SKILL.md'),
      rawUrl('acme', 'mono', 'main', '.claude/skills/SKILL.md'),
    ]);
  });

  it('全部 404 → failed 且错误提示含尝试路径', async () => {
    state.handler = () => notFound();
    const r = await importSkillFromUrl({ url: 'https://github.com/acme/empty', target: 'user' });
    expect(r.status).toBe('failed');
    expect(r.error).toContain('not found at github.com/acme/empty@main');
    expect(r.error).toContain('多 skill 仓库请用 /tree');
  });
});

describe('importSkillFromUrl skills.sh / clawhub', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    setUpHome();
    scanSkills(); // 重置全局索引（隔离：删文件不自动清索引）
    state.handler = null;
    state.calls = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      state.calls.push(String(url));
      if (!state.handler) throw new Error('no fetch handler');
      return Promise.resolve(state.handler(String(url), init));
    });
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
    for (const h of state.homes) rmSync(h, { recursive: true, force: true });
    state.homes = [];
    vi.unstubAllGlobals();
    state.calls = [];
    state.handler = null;
  });

  it('skills.sh：按 skills/{skill} → .claude/skills/{skill} → plugin/skills/{skill} → {skill} 顺序取', async () => {
    const tries: string[] = [];
    state.handler = (url) => {
      tries.push(url);
      if (url === rawUrl('acme', 'toolkit', 'main', 'plugin/skills/deploy/SKILL.md')) {
        return ok('---\nname: deploy\ndescription: 部署\n---\n# 部署正文');
      }
      return notFound();
    };
    const r = await importSkillFromUrl({
      url: 'https://skills.sh/acme/toolkit/deploy',
      target: 'user',
    });
    expect(r.status).toBe('created');
    expect(r.originType).toBe('skills_sh');
    expect(r.name).toBe('deploy');
    // 首个请求是 default_branch API；随后按候选顺序请求 raw，命中 plugin 即停
    expect(tries[0]).toBe('https://api.github.com/repos/acme/toolkit');
    expect(tries.slice(1)).toEqual([
      rawUrl('acme', 'toolkit', 'main', 'skills/deploy/SKILL.md'),
      rawUrl('acme', 'toolkit', 'main', '.claude/skills/deploy/SKILL.md'),
      rawUrl('acme', 'toolkit', 'main', 'plugin/skills/deploy/SKILL.md'),
    ]);
  });

  it('skills.sh：候选全缺时，根 SKILL.md 仅当 frontmatter name 匹配才接受；否则 failed', async () => {
    state.handler = (url) => {
      if (url === rawUrl('acme', 'toolkit', 'main', 'SKILL.md')) {
        return ok('---\nname: other\ndescription: 不匹配\n---\n# x');
      }
      return notFound();
    };
    const r = await importSkillFromUrl({
      url: 'https://skills.sh/acme/toolkit/deploy',
      target: 'user',
    });
    expect(r.status).toBe('failed');
    expect(r.error).toContain('skills.sh 未找到 skill「deploy」');
  });

  it('clawhub：meta 解析 displayName/summary，file 候选逐个尝试', async () => {
    const meta = JSON.stringify({
      skill: { slug: 'my-skill', displayName: 'My Great Skill', summary: '汇总' },
    });
    state.handler = (url) => {
      if (url === 'https://clawhub.ai/api/v1/skills/my-skill') return ok(meta);
      if (url === 'https://clawhub.ai/api/v1/skills/my-skill/file?path=SKILL.md') {
        return ok('---\nname: fm-name\ndescription: 来自 frontmatter\n---\n# body');
      }
      return notFound();
    };
    const r = await importSkillFromUrl({ url: 'https://clawhub.ai/my-skill', target: 'user' });
    expect(r.status).toBe('created');
    expect(r.originType).toBe('clawhub');
    // frontmatter.name 优先于 displayName
    expect(r.name).toBe('fm-name');
  });

  it('clawhub：meta 不可解析但 file 可用 → name 回退 frontmatter；全失败 → failed', async () => {
    state.handler = (url) => {
      if (url === 'https://clawhub.ai/api/v1/skills/plain') return ok('not json');
      if (url === 'https://clawhub.ai/api/v1/skills/plain/file?path=SKILL.md') {
        return ok(SKILL_MD);
      }
      return notFound();
    };
    const r = await importSkillFromUrl({ url: 'https://clawhub.ai/plain', target: 'user' });
    expect(r.status).toBe('created');
    expect(r.name).toBe('hello-world');

    state.handler = () => notFound();
    const r2 = await importSkillFromUrl({ url: 'https://clawhub.ai/ghost', target: 'user' });
    expect(r2.status).toBe('failed');
    expect(r2.error).toContain('未取到 SKILL.md');
  });
});

describe('importSkillFromUrl 写入语义与失败路径', () => {
  beforeEach(() => {
    const t = createTestDb();
    state.db = t.db;
    state.cleanup = t.cleanup;
    setUpHome();
    scanSkills(); // 重置全局索引（隔离：删文件不自动清索引）
    state.handler = null;
    state.calls = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      state.calls.push(String(url));
      if (!state.handler) throw new Error('no fetch handler');
      return Promise.resolve(state.handler(String(url), init));
    });
  });

  afterEach(() => {
    state.cleanup?.();
    state.db = null;
    state.cleanup = null;
    for (const h of state.homes) rmSync(h, { recursive: true, force: true });
    state.homes = [];
    vi.unstubAllGlobals();
    state.calls = [];
    state.handler = null;
  });

  it('重复导入：已存在 → skipped + alreadyIndexed=true；overwrite → updated', async () => {
    state.handler = () => ok(SKILL_MD);
    const r1 = await importSkillFromUrl({ url: 'https://example.com/hello.md', target: 'user' });
    expect(r1.status).toBe('created');
    expect(r1.alreadyIndexed).toBe(false);

    const r2 = await importSkillFromUrl({ url: 'https://example.com/hello.md', target: 'user' });
    expect(r2.status).toBe('skipped');
    expect(r2.alreadyIndexed).toBe(true);

    const r3 = await importSkillFromUrl({
      url: 'https://example.com/hello.md',
      target: 'user',
      overwrite: true,
    });
    expect(r3.status).toBe('updated');
  });

  it('并发导入同一 URL：互不炸、文件最终有效（竞态安全）', async () => {
    state.handler = () => ok(SKILL_MD);
    const [r1, r2] = await Promise.all([
      importSkillFromUrl({ url: 'https://example.com/race.md', target: 'user' }),
      importSkillFromUrl({ url: 'https://example.com/race.md', target: 'user' }),
    ]);
    expect(r1.status).not.toBe('failed');
    expect(r2.status).not.toBe('failed');
    const raw = readFileSync(join(userSkillsDir(), 'hello-world', 'SKILL.md'), 'utf8');
    expect(raw).toContain('name: "hello-world"');
  });

  it('无效 URL / 不支持的来源 → failed 且错误信息明确', async () => {
    const r1 = await importSkillFromUrl({ url: 'not a url', target: 'user' });
    expect(r1.status).toBe('failed');
    expect(r1.error).toBe('无效 URL');

    const r2 = await importSkillFromUrl({ url: 'https://example.com/not-a-skill', target: 'user' });
    expect(r2.status).toBe('failed');
    expect(r2.error).toContain('不支持的来源');
  });

  it('覆盖导入时清掉旧目录残留脏文件', async () => {
    state.handler = () => ok(SKILL_MD);
    await importSkillFromUrl({ url: 'https://example.com/hello.md', target: 'user' });
    // 手工制造脏残留
    writeFileSync(join(userSkillsDir(), 'hello-world', 'stale.txt'), 'dirty', 'utf8');
    const r = await importSkillFromUrl({
      url: 'https://example.com/hello.md',
      target: 'user',
      overwrite: true,
    });
    expect(r.status).toBe('updated');
    expect(existsSync(join(userSkillsDir(), 'hello-world', 'stale.txt'))).toBe(false);
  });
});
