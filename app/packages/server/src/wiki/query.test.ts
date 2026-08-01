// S07 query 跨根检索（GAP-14 / B5）：
// ① 单根默认行为回归（不跨根）② 跨根双 project 命中另一根页面
// ③ slug 冲突时 cite 归属可区分 ④ 无 LLM key 时关键词路径仍可用（关键词直出降级）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  projectRows: [] as Array<{ id: string; title: string; localPath: string | null }>,
  createLlm: vi.fn(),
  // Step 2 选页 prompt 里带 "slug: xxx"，解析后原样返回（全选）；Step 4 返回固定合成答案
  generateWikiPage: vi.fn(async (_llm: unknown, prompt: string) => {
    if (prompt.includes('只返回一个 JSON 数组')) {
      const slugs = [...prompt.matchAll(/slug: ([^\s,)]+)/g)].map((m) => m[1]);
      return JSON.stringify(slugs);
    }
    return '（LLM 合成答案）';
  }),
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ get: () => mocks.projectRows[0] ?? null }),
        all: () => mocks.projectRows,
      }),
    }),
  },
  sqlite: {},
}));

vi.mock('../db/schema.js', () => ({
  projects: { id: 'id', title: 'title', localPath: 'local_path' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('../workspace-cwd.js', () => ({
  resolveWorkspaceCwd: () => ({ path: '', configured: false, source: 'none' }),
}));

// 真实 createLlm 在无 WIKI_LLM_API_KEY 时抛 'WIKI_LLM_API_KEY 未配置'（llm.ts:16）
vi.mock('../wiki/llm.js', () => ({
  createLlm: mocks.createLlm,
  generateWikiPage: mocks.generateWikiPage,
}));

import { ensureWikiDir, writeWikiPage, appendIndex, type WikiRootOpts } from './store.js';
import { queryWiki } from './query.js';

type TestPage = { slug: string; title: string; content?: string };

// 建根：global 根传 undefined（走 MA_WIKI_DIR），project 根传 { projectLocalPath }
function setupRoot(opts: WikiRootOpts | undefined, pages: TestPage[]): void {
  ensureWikiDir(opts);
  for (const p of pages) {
    writeWikiPage(p.slug, `# ${p.title}\n\n${p.content ?? p.title}`, opts);
    appendIndex({ slug: p.slug, title: p.title, identifier: 'test' }, opts);
  }
}

describe('wiki query 跨根检索（B5）', () => {
  let globalDir: string;
  let projA: string;
  let projB: string;
  let prevWikiDir: string | undefined;
  let prevApiKey: string | undefined;

  beforeEach(() => {
    globalDir = mkdtempSync(join(tmpdir(), 'ma-wiki-q-global-'));
    projA = mkdtempSync(join(tmpdir(), 'ma-wiki-q-proja-'));
    projB = mkdtempSync(join(tmpdir(), 'ma-wiki-q-projb-'));
    prevWikiDir = process.env.MA_WIKI_DIR;
    prevApiKey = process.env.WIKI_LLM_API_KEY;
    process.env.MA_WIKI_DIR = globalDir;
    process.env.WIKI_LLM_API_KEY = 'test-key';
    mocks.projectRows.length = 0;
    mocks.createLlm.mockClear();
    mocks.generateWikiPage.mockClear();
    mocks.createLlm.mockImplementation(() => {
      if (!process.env.WIKI_LLM_API_KEY) throw new Error('WIKI_LLM_API_KEY 未配置');
      return { provider: 'mock' };
    });
  });

  afterEach(() => {
    if (prevWikiDir === undefined) delete process.env.MA_WIKI_DIR;
    else process.env.MA_WIKI_DIR = prevWikiDir;
    if (prevApiKey === undefined) delete process.env.WIKI_LLM_API_KEY;
    else process.env.WIKI_LLM_API_KEY = prevApiKey;
    for (const d of [globalDir, projA, projB]) rmSync(d, { recursive: true, force: true });
  });

  it('① 单根默认行为回归：不传 roots 只检索 global 根，cite 不带 root 字段', async () => {
    setupRoot(undefined, [
      { slug: 'g-alpha', title: 'Alpha 部署' },
      { slug: 'g-beta', title: 'Beta 发布' },
    ]);
    setupRoot({ projectLocalPath: projA }, [{ slug: 'p-alpha', title: 'Alpha 部署' }]);
    mocks.projectRows.push({ id: 'proj-a', title: '项目甲', localPath: projA });

    const result = await queryWiki('Alpha 部署怎么做');

    const slugs = result.citations.map((c) => c.slug);
    expect(slugs.sort()).toEqual(['g-alpha', 'g-beta']);
    expect(slugs).not.toContain('p-alpha'); // project 根未被检索
    expect(result.citations.every((c) => !('root' in c))).toBe(true); // 单根保持原形状
  });

  it('② 跨根双 project 各建页：roots:"all" 关键词命中另一根的页面，cite 带根名', async () => {
    setupRoot(undefined, [{ slug: 'g-x', title: '配置向导' }]);
    setupRoot({ projectLocalPath: projA }, [{ slug: 'a-page', title: 'Alpha 部署指南' }]);
    setupRoot({ projectLocalPath: projB }, [{ slug: 'b-page', title: 'Beta 发布说明' }]);
    mocks.projectRows.push(
      { id: 'proj-a', title: '项目甲', localPath: projA },
      { id: 'proj-b', title: '项目乙', localPath: projB },
    );

    const result = await queryWiki('Alpha 部署指南怎么做', undefined, { roots: 'all' });

    // 命中页在 project 根（非 global），cite 可区分根归属
    const alpha = result.citations.find((c) => c.slug === 'a-page');
    expect(alpha).toEqual({ slug: 'a-page', title: 'Alpha 部署指南', root: '项目甲' });
    const labels = new Set(result.citations.map((c) => c.root));
    expect(labels).toEqual(new Set(['global', '项目甲', '项目乙']));
  });

  it('③ slug 冲突：跨根同 slug 各读各的根，cite 归属可区分', async () => {
    setupRoot(undefined, [{ slug: 'overview', title: '总览' }]);
    setupRoot({ projectLocalPath: projA }, [{ slug: 'shared', title: '共享部署', content: '内容甲' }]);
    setupRoot({ projectLocalPath: projB }, [{ slug: 'shared', title: '共享部署', content: '内容乙' }]);
    mocks.projectRows.push(
      { id: 'proj-a', title: '项目甲', localPath: projA },
      { id: 'proj-b', title: '项目乙', localPath: projB },
    );

    const result = await queryWiki('共享部署', undefined, { roots: 'all' });

    const shared = result.citations.filter((c) => c.slug === 'shared');
    expect(shared).toHaveLength(2); // 两条同 slug 候选都保留
    expect(new Set(shared.map((c) => c.root))).toEqual(new Set(['项目甲', '项目乙']));
    // Step 4 prompt 的正文 context 同时含两根内容 → 页确实按各自根读取
    const promptArg = mocks.generateWikiPage.mock.calls.at(-1)?.[1] ?? '';
    expect(promptArg).toContain('内容甲');
    expect(promptArg).toContain('内容乙');
    expect(promptArg).toContain('[项目甲]');
    expect(promptArg).toContain('[项目乙]');
  });

  it('④ 无 LLM key：关键词路径仍可用（关键词直出降级）', async () => {
    setupRoot(undefined, [
      { slug: 'g-alpha', title: 'Alpha 部署' },
      { slug: 'g-opt', title: 'Alpha 优化' },
    ]);
    delete process.env.WIKI_LLM_API_KEY;

    const result = await queryWiki('Alpha 怎么做');

    expect(mocks.createLlm).toHaveBeenCalled(); // 走了 LLM 分支且被降级
    expect(result.answer).toContain('关键词命中页面');
    expect(result.answer).toContain('Alpha 部署（g-alpha）');
    expect(result.answer).toContain('Alpha 优化（g-opt）');
    expect(result.citations).toHaveLength(2);
  });

  it('⑤ 跨根 + 无 LLM key + 单候选：Step 2 选页降级保持关键词候选，cite 仍带根', async () => {
    setupRoot({ projectLocalPath: projA }, [{ slug: 'a-only', title: '唯一页面' }]);
    mocks.projectRows.push({ id: 'proj-a', title: '项目甲', localPath: projA });
    delete process.env.WIKI_LLM_API_KEY;

    const result = await queryWiki('唯一页面', undefined, { roots: 'all' });

    expect(result.answer).toContain('唯一页面（a-only） [项目甲]');
    expect(result.citations).toEqual([{ slug: 'a-only', title: '唯一页面', root: '项目甲' }]);
  });
});
