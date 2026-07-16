// S06 Wiki API 路由（spec §6）
// GET /api/wiki/pages        列表：扫 wiki/*.md → WikiPageSummary[]
// GET /api/wiki/pages/:slug  单页：读 wiki/<slug>.md → WikiPage
// 无 POST/PUT（Wiki 页由 ingest pipeline 写，人不编辑）
import type { FastifyInstance } from 'fastify';
import { listWikiPages, readWikiPage } from '../wiki/store.js';

export async function wikiRoutes(app: FastifyInstance): Promise<void> {
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
}
