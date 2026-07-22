// S06 Wiki API 路由（spec §6）+ S07 扩展（query / health / lint / 存回）+ S08 jobs
// GET  /api/wiki/pages        列表：扫 wiki/*.md → WikiPageSummary[]
// GET  /api/wiki/pages/:slug  单页：读 wiki/<slug>.md → WikiPage
// POST /api/wiki/query        问答：{question} → {answer, citations[]}
// GET  /api/wiki/health       结构检查（零 LLM）
// POST /api/wiki/lint         语义检查（LLM）
// POST /api/wiki/pages        存回：{title, content} → {slug, title} + WS
// GET  /api/wiki/jobs         ingest job 列表（可选 ?status=）
// GET  /api/wiki/jobs/:id     单条 job
// POST /api/wiki/jobs/:id/retry  dead→pending + wake
import type { FastifyInstance } from 'fastify';
import { WikiQueryInput, CreateWikiPageInput } from '@ma/shared';
import {
  listWikiPages,
  readWikiPage,
  writeWikiPage,
  appendIndex,
  appendLog,
  getWikiDir,
} from '../wiki/store.js';
import { resolveWorkspaceCwd } from '../workspace-cwd.js';
import { generateSlug } from '../wiki/slug.js';
import { queryWiki } from '../wiki/query.js';
import { checkHealth } from '../wiki/health.js';
import { checkLint } from '../wiki/lint.js';
import {
  listWikiIngestJobs,
  getWikiIngestJob,
  retryWikiIngestJob,
  toWikiIngestJob,
} from '../wiki/ingest-queue.js';
import { wakeWikiIngestWorker } from '../wiki/ingest-worker.js';
import { eventBus } from '../orchestration/event-bus.js';

export async function wikiRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/wiki/meta — E3：根路径诚实（非 per-project）
  app.get('/api/wiki/meta', async () => {
    const cwd = resolveWorkspaceCwd();
    const rootPath = getWikiDir();
    return {
      rootPath,
      workspacePath: cwd.path,
      source: cwd.configured ? cwd.source : 'process.cwd',
      perProject: false as const,
      note: 'Wiki 文件在工作区（或 process.cwd）下的 wiki/ 目录，不随 Issue 绑定的 project.localPath 切换',
    };
  });

  // GET /api/wiki/pages — 列表（spec §6）
  app.get('/api/wiki/pages', async () => {
    return listWikiPages();
  });

  // GET /api/wiki/pages/:slug — 单页（spec §6）
  app.get('/api/wiki/pages/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const page = readWikiPage(slug);
    if (!page) return reply.status(404).send({ error: 'wiki 页不存在' });
    return page;
  });

  // POST /api/wiki/query — 问答（spec §5.2）
  app.post('/api/wiki/query', async (req, reply) => {
    const parsed = WikiQueryInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const result = await queryWiki(parsed.data.question);
    appendLog({ type: 'query', identifier: '-', issueId: 'query' });
    return result;
  });

  // GET /api/wiki/health — 结构检查（零 LLM，瞬时，spec §5.2）
  app.get('/api/wiki/health', async () => {
    const result = checkHealth();
    appendLog({ type: 'health', identifier: '-', issueId: '-' });
    return result;
  });

  // POST /api/wiki/lint — 语义检查（LLM，异步，spec §5.2）
  app.post('/api/wiki/lint', async () => {
    const result = await checkLint();
    appendLog({ type: 'lint', identifier: '-', issueId: '-' });
    return result;
  });

  // POST /api/wiki/pages — 存回 wiki 页（spec §3.6/§5.2）
  app.post('/api/wiki/pages', async (req, reply) => {
    const parsed = CreateWikiPageInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { title, content } = parsed.data;
    const slug = generateSlug('query', title);
    writeWikiPage(slug, content);
    appendIndex({ slug, title, identifier: 'query' });
    appendLog({ type: 'query', identifier: 'query', issueId: 'query', slug });
    eventBus.publish({ type: 'wiki:page-created', slug, title });
    return reply.status(201).send({ slug, title });
  });

  // S08：ingest job 管理（spec §4.3）
  app.get('/api/wiki/jobs', async (req) => {
    const { status } = req.query as { status?: string };
    return listWikiIngestJobs(status).map(toWikiIngestJob);
  });

  app.get('/api/wiki/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = getWikiIngestJob(id);
    if (!row) return reply.status(404).send({ error: 'job 不存在' });
    return toWikiIngestJob(row);
  });

  // 须在 :id 路由前：批量重试全部 dead
  app.post('/api/wiki/jobs/retry-dead', async () => {
    const { retryAllDeadWikiIngestJobs } = await import('../wiki/ingest-queue.js');
    const result = retryAllDeadWikiIngestJobs();
    if (result.retried > 0) wakeWikiIngestWorker();
    return result;
  });

  app.post('/api/wiki/jobs/:id/retry', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = retryWikiIngestJob(id);
    if (!ok) return reply.status(400).send({ error: '仅 dead job 可 retry' });
    wakeWikiIngestWorker();
    const row = getWikiIngestJob(id);
    return toWikiIngestJob(row!);
  });
}
