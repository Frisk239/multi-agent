import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * GET /api/skills updatedAt 契约测试（F6-2）
 * mock getSkillIndex（内存索引）+ db（无分配），用真实临时文件验证 mtime → ISO；
 * 无路径 / 文件缺失 → null。
 */

const state = vi.hoisted(() => ({
  index: new Map<string, Record<string, unknown>>(),
}));

vi.mock('../db/client.js', () => ({
  db: {
    select: () => ({
      from: () => ({ all: () => [] }),
    }),
  },
}));

vi.mock('../db/schema.js', () => ({
  agents: { id: 'id', name: 'name', runtime: 'runtime' },
  agentSkills: { skillId: 'skillId', agentId: 'agentId' },
}));

vi.mock('../skill/scanner.js', () => ({
  getSkillIndex: () => state.index,
  importLocalSkill: vi.fn(),
  listImportCandidates: vi.fn(),
  listSkillDestinations: vi.fn(),
  projectSkillsDir: () => null,
  scanSkills: vi.fn(),
  userSkillsDir: () => join(tmpdir(), 'ma-user-skills'),
}));

vi.mock('../skill/import-url.js', () => ({
  importSkillFromUrl: vi.fn(),
}));

import { skillRoutes } from './skills.js';

type Handler = (req: unknown, reply?: unknown) => Promise<unknown> | unknown;

function makeApp() {
  const routes: Record<string, Handler> = {};
  const app = {
    get: (path: string, handler: Handler) => { routes[`GET ${path}`] = handler; },
    post: (path: string, handler: Handler) => { routes[`POST ${path}`] = handler; },
    put: (path: string, handler: Handler) => { routes[`PUT ${path}`] = handler; },
  };
  return { app: app as never, routes };
}

function replyMock() {
  const r: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof r;
    send: (body: unknown) => unknown;
  } = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    send(body: unknown) { this.body = body; return body; },
  };
  return r;
}

function seedSkill(
  name: string,
  over: { path?: string | null; source?: string } = {},
) {
  state.index.set(name, {
    name,
    description: `desc-${name}`,
    body: '# body',
    path: null,
    source: 'builtin',
    projectId: null,
    projectTitle: null,
    ...over,
  });
}

describe('GET /api/skills updatedAt', () => {
  let dir: string;

  beforeEach(() => {
    state.index.clear();
    dir = mkdtempSync(join(tmpdir(), 'ma-skill-route-'));
  });

  afterEach(() => {
    state.index.clear();
    rmSync(dir, { recursive: true, force: true });
  });

  it('有文件路径 → mtime ISO 字符串；无路径 / 文件缺失 → null', async () => {
    const skillFile = join(dir, 'demo.md');
    writeFileSync(skillFile, '---\nname: demo\n---\n# body');
    seedSkill('demo', { path: skillFile, source: 'user' });
    seedSkill('ghost', { path: join(dir, 'missing.md'), source: 'workspace' });
    seedSkill('no-path', { path: null, source: 'builtin' });

    const { app, routes } = makeApp();
    await skillRoutes(app);
    const reply = replyMock();
    const result = (await routes['GET /api/skills'](undefined, reply)) as Array<{
      name: string;
      updatedAt: string | null;
    }>;
    const byName = new Map(result.map((s) => [s.name, s]));

    const demo = byName.get('demo')!;
    expect(demo.updatedAt).toBeTypeOf('string');
    // 合法 ISO 且可 round-trip（mtime 是真实文件时间）
    expect(new Date(demo.updatedAt as string).toISOString()).toBe(demo.updatedAt);

    expect(byName.get('ghost')!.updatedAt).toBeNull();
    expect(byName.get('no-path')!.updatedAt).toBeNull();
  });

  it('仍按 name 稳定排序，且返回体形状不变（usedBy 空数组）', async () => {
    seedSkill('zeta');
    seedSkill('alpha');
    const { app, routes } = makeApp();
    await skillRoutes(app);
    const reply = replyMock();
    const result = (await routes['GET /api/skills'](undefined, reply)) as Array<{
      name: string;
      usedBy: unknown[];
    }>;
    expect(result.map((s) => s.name)).toEqual(['alpha', 'zeta']);
    for (const s of result) {
      expect(s.usedBy).toEqual([]);
      expect(Object.keys(s)).toContain('updatedAt');
    }
  });
});
