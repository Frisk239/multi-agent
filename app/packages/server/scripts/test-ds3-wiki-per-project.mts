/**
 * DS3：Wiki per-project root（ADR 0005）
 * Run: pnpm exec tsx scripts/test-ds3-wiki-per-project.mts  (from packages/server)
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const scratch = join(tmpdir(), `ma-ds3-${Date.now()}`);
mkdirSync(scratch, { recursive: true });
process.env.DB_PATH = join(scratch, 'ds3.db');
// 固定 global wiki 根，避免污染仓库 cwd
const globalWiki = join(scratch, 'global-wiki');
process.env.MA_WIKI_DIR = globalWiki;

const { db, sqlite } = await import('../src/db/client.js');
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
migrate(db, { migrationsFolder });

const { workspaces, projects } = await import('../src/db/schema.js');
const {
  resolveWikiDir,
  ensureWikiDir,
  writeWikiPage,
  listWikiPages,
  readWikiPage,
  appendIndex,
  appendLog,
  saveRaw,
  readIndex,
  readLog,
} = await import('../src/wiki/store.js');
const { checkHealth } = await import('../src/wiki/health.js');
const {
  updateAgentsMdBridge,
  readManagedBlock,
  getAgentsMdPathForRoot,
  MA_WIKI_BEGIN,
} = await import('../src/wiki/agents-bridge.js');
const { wikiRootOptsForIssue } = await import('../src/wiki/ingest.js');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const now = Date.now();
const WS = 'ws-ds3';
db.insert(workspaces)
  .values({ id: WS, name: 'ds3', description: null, rootPath: null, createdAt: now })
  .run();

const projADir = join(scratch, 'proj-a');
const projBDir = join(scratch, 'proj-b');
const invalidDir = join(scratch, 'missing-proj');
mkdirSync(projADir, { recursive: true });
mkdirSync(projBDir, { recursive: true });

const pidA = 'proj-a';
const pidB = 'proj-b';
const pidBad = 'proj-bad';
const pidNoPath = 'proj-nopath';

db.insert(projects)
  .values([
    {
      id: pidA,
      workspaceId: WS,
      title: 'Project A',
      description: null,
      status: 'active',
      localPath: projADir,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: pidB,
      workspaceId: WS,
      title: 'Project B',
      description: null,
      status: 'active',
      localPath: projBDir,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: pidBad,
      workspaceId: WS,
      title: 'Bad Path',
      description: null,
      status: 'active',
      localPath: invalidDir,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: pidNoPath,
      workspaceId: WS,
      title: 'No Path',
      description: null,
      status: 'active',
      localPath: null,
      createdAt: now,
      updatedAt: now,
    },
  ])
  .run();

// —— resolveWikiDir ——
{
  const g = resolveWikiDir();
  assert(g.source === 'env', `global source=${g.source}`);
  assert(g.path === globalWiki, `global path=${g.path}`);
  assert(!g.projectId, 'global no projectId');
  console.log('PASS resolve global via MA_WIKI_DIR');

  const a = resolveWikiDir({ projectId: pidA });
  assert(a.source === 'project', `A source=${a.source}`);
  assert(a.path === join(projADir, 'wiki'), `A path=${a.path}`);
  assert(a.projectId === pidA, 'A projectId');
  assert(a.projectLocalPath === projADir, 'A localPath');
  console.log('PASS resolve project A by projectId');

  const aDirect = resolveWikiDir({ projectLocalPath: projADir, projectId: pidA });
  assert(aDirect.source === 'project', 'direct localPath project');
  assert(aDirect.path === join(projADir, 'wiki'), 'direct path');
  console.log('PASS resolve by projectLocalPath');

  const bad = resolveWikiDir({ projectId: pidBad });
  assert(bad.source === 'env', `bad falls back source=${bad.source}`);
  assert(bad.path === globalWiki, 'bad falls back global');
  console.log('PASS invalid localPath falls back global');

  const none = resolveWikiDir({ projectId: pidNoPath });
  assert(none.source === 'env', 'no path → global');
  console.log('PASS project without localPath → global');
}

// —— write isolation ——
{
  ensureWikiDir();
  ensureWikiDir({ projectId: pidA });
  ensureWikiDir({ projectId: pidB });

  writeWikiPage('page-global', '# Global Page\n\nglobal body enough text here for health.', {});
  appendIndex({ slug: 'page-global', title: 'Global Page', identifier: 'G-1' }, {});
  appendLog({ type: 'ingest', identifier: 'G-1', issueId: 'iss-g', slug: 'page-global' }, {});
  saveRaw('iss-g', '# raw global', {});

  writeWikiPage(
    'page-a',
    '# Alpha Page\n\nalpha only content for project A wiki root.',
    { projectId: pidA },
  );
  appendIndex({ slug: 'page-a', title: 'Alpha Page', identifier: 'A-1' }, { projectId: pidA });
  appendLog(
    { type: 'ingest', identifier: 'A-1', issueId: 'iss-a', slug: 'page-a' },
    { projectId: pidA },
  );
  saveRaw('iss-a', '# raw a', { projectId: pidA });

  writeWikiPage(
    'page-b',
    '# Beta Page\n\nbeta only content for project B wiki root.',
    { projectId: pidB },
  );
  appendIndex({ slug: 'page-b', title: 'Beta Page', identifier: 'B-1' }, { projectId: pidB });
  appendLog(
    { type: 'ingest', identifier: 'B-1', issueId: 'iss-b', slug: 'page-b' },
    { projectId: pidB },
  );

  // 磁盘存在性
  assert(existsSync(join(globalWiki, 'page-global.md')), 'global file');
  assert(existsSync(join(projADir, 'wiki', 'page-a.md')), 'A file');
  assert(existsSync(join(projBDir, 'wiki', 'page-b.md')), 'B file');
  assert(!existsSync(join(projADir, 'wiki', 'page-b.md')), 'A has no B page');
  assert(!existsSync(join(projBDir, 'wiki', 'page-a.md')), 'B has no A page');
  assert(!existsSync(join(globalWiki, 'page-a.md')), 'global has no A page');
  assert(existsSync(join(projADir, 'wiki', 'raw')), 'A raw dir');
  console.log('PASS disk isolation A/B/global');

  // list 不串
  const listG = listWikiPages();
  const listA = listWikiPages({ projectId: pidA });
  const listB = listWikiPages({ projectId: pidB });
  assert(listG.some((p) => p.slug === 'page-global'), 'listG has global');
  assert(!listG.some((p) => p.slug === 'page-a'), 'listG no A');
  assert(listA.map((p) => p.slug).join() === 'page-a', `listA=${listA.map((p) => p.slug)}`);
  assert(listB.map((p) => p.slug).join() === 'page-b', `listB=${listB.map((p) => p.slug)}`);
  console.log('PASS list isolation');

  assert(readWikiPage('page-a', { projectId: pidA })?.title === 'Alpha Page', 'read A');
  assert(readWikiPage('page-a', { projectId: pidB }) === null, 'A slug not in B');
  assert(readWikiPage('page-global')?.slug === 'page-global', 'read global');
  console.log('PASS read isolation');

  const idxA = readIndex({ projectId: pidA });
  assert(idxA.some((e) => e.slug === 'page-a'), 'index A');
  assert(!idxA.some((e) => e.slug === 'page-b'), 'index A no B');
  const logA = readLog({ projectId: pidA });
  assert(logA.includes('page-a'), 'log A');
  assert(!logA.includes('page-b'), 'log A no B');
  console.log('PASS index/log isolation');
}

// —— health 仅当前根 ——
{
  const hA = checkHealth({ projectId: pidA });
  assert(hA.total === 1, `health A total=${hA.total}`);
  const hG = checkHealth();
  assert(hG.total === 1, `health G total=${hG.total}`);
  assert(hG.total === listWikiPages().length, 'health total matches list');
  const hB = checkHealth({ projectId: pidB });
  assert(hB.total === 1, `health B total=${hB.total}`);
  console.log('PASS health scoped to root');
}

// —— agents bridge project vs global ——
{
  updateAgentsMdBridge({ projectId: pidA });
  const agentsA = getAgentsMdPathForRoot({ projectId: pidA });
  assert(agentsA === join(projADir, 'AGENTS.md'), `agentsA=${agentsA}`);
  assert(existsSync(agentsA), 'AGENTS.md A exists');
  const bodyA = readManagedBlock(agentsA);
  assert(bodyA && bodyA.includes('Alpha Page'), 'bridge A lists Alpha');
  assert(bodyA && !bodyA.includes('Beta Page'), 'bridge A no Beta');
  assert(bodyA && !bodyA.includes('Global Page'), 'bridge A no Global');
  console.log('PASS agents bridge project A');

  updateAgentsMdBridge();
  // global bridge 写 workspace/cwd；我们只断言 getAgentsMdPathForRoot 非 project
  const agentsG = getAgentsMdPathForRoot();
  assert(!agentsG.startsWith(projADir), 'global agents not under proj A');
  // 仍可写一次确认不炸
  const gBody = readFileSync(agentsG, 'utf-8');
  assert(gBody.includes(MA_WIKI_BEGIN), 'global AGENTS has marker');
  console.log('PASS agents bridge global');
}

// —— wikiRootOptsForIssue（从 issue.projectId 查 projects 表）——
{
  const optsA = wikiRootOptsForIssue({ projectId: pidA });
  assert(optsA.projectId === pidA, 'issue A projectId');
  assert(optsA.projectLocalPath === projADir, 'issue A localPath');
  const rootA = resolveWikiDir(optsA);
  assert(rootA.source === 'project', 'issue A → project root');

  const optsNone = wikiRootOptsForIssue({ projectId: null });
  assert(!optsNone.projectId, 'no project opts empty');
  assert(resolveWikiDir(optsNone).source === 'env', 'no project → global');

  const optsBad = wikiRootOptsForIssue({ projectId: pidBad });
  assert(optsBad.projectId === pidBad, 'bad keeps projectId for resolve');
  assert(resolveWikiDir(optsBad).source === 'env', 'bad path → global at resolve');
  console.log('PASS wikiRootOptsForIssue');
}

// —— meta 形状（不启 HTTP，模拟 routes 逻辑）——
{
  const wikiA = resolveWikiDir({ projectId: pidA });
  const metaA = {
    rootPath: wikiA.path,
    source: wikiA.source,
    perProject: true as const,
    projectId: wikiA.projectId ?? null,
  };
  assert(metaA.perProject === true, 'meta perProject');
  assert(metaA.source === 'project', 'meta source project');
  assert(metaA.projectId === pidA, 'meta projectId');
  assert(metaA.rootPath.endsWith(`${join('proj-a', 'wiki')}`) || metaA.rootPath.includes('proj-a'), 'meta path');

  const wikiG = resolveWikiDir();
  assert(wikiG.source === 'env', 'meta global source');
  assert(wikiG.path === globalWiki, 'meta global path');
  console.log('PASS meta shape');
}

console.log('ALL PASS');

try {
  sqlite.close();
} catch {
  /* ignore */
}
try {
  rmSync(scratch, { recursive: true, force: true });
} catch {
  /* ignore */
}
