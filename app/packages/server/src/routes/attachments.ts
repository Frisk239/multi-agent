/**
 * S4/S5 · 附件路由。
 *
 * 传输选型：不引入 @fastify/multipart，直接收原始二进制 body + X-Filename 头。
 * 理由：本地单机、一次一个文件即可，前端 `fetch(url, { body: file })` 天然就是这个形状，
 * 少一个依赖就少一条供应链与升级面。content-type parser 注册在本插件作用域内，
 * 不影响其它路由的 JSON 解析。
 */
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { issues } from '../db/schema.js';
import {
  createAttachment,
  deleteAttachment,
  getAttachmentRow,
  listAttachmentsForIssue,
  sweepOrphanAttachments,
  toAttachmentMeta,
} from '../attachments/service.js';
import {
  MAX_ATTACHMENT_BYTES,
  decodeFilenameHeader,
  statAttachment,
} from '../attachments/local-store.js';
import { buildContentDisposition, resolveDeliveryMode } from '../attachments/delivery.js';
import { createReadStream } from 'node:fs';
import { parseRangeHeader } from '../attachments/range.js';

export async function attachmentRoutes(app: FastifyInstance): Promise<void> {
  // 本插件作用域内：清掉继承来的 JSON/text 解析器，任意 content-type 一律按 buffer 收。
  // 必须先 removeAll —— 否则 text/plain、application/json 会被内置解析器截走变成
  // string/object，上传路由拿不到 Buffer。插件是封装作用域，不影响其它路由。
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    '*',
    { parseAs: 'buffer', bodyLimit: MAX_ATTACHMENT_BYTES + 1024 },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // POST /api/issues/:id/attachments —— 原始字节上传
  app.post('/api/issues/:id/attachments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const issue = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issue) return reply.status(404).send({ success: false, error: 'issue 不存在' });

    // 头是 latin-1，中文名须由客户端 encodeURIComponent 后再解码
    const filename = decodeFilenameHeader(req.headers['x-filename'] as string | undefined);
    const mime = (req.headers['content-type'] as string | undefined) ?? null;
    const body = req.body;

    if (!Buffer.isBuffer(body)) {
      return reply
        .status(400)
        .send({ success: false, code: 'EMPTY', error: '请以原始二进制 body 上传文件' });
    }

    const result = createAttachment({
      issueId: id,
      bytes: body,
      filename,
      mime,
    });
    if (!result.ok) {
      const status = result.code === 'TOO_LARGE' ? 413 : 400;
      return reply.status(status).send({ success: false, code: result.code, error: result.error });
    }
    return reply.status(201).send(result.meta);
  });

  // GET /api/issues/:id/attachments —— 该 issue 的附件清单
  app.get('/api/issues/:id/attachments', async (req, reply) => {
    const { id } = req.params as { id: string };
    const issue = db.select().from(issues).where(eq(issues.id, id)).get();
    if (!issue) return reply.status(404).send({ success: false, error: 'issue 不存在' });
    return listAttachmentsForIssue(id);
  });

  // GET /api/attachments/:id —— 稳定下载 / 预览（支持 Range）
  app.get('/api/attachments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = (req.query ?? {}) as { disposition?: string };
    const row = getAttachmentRow(id);
    if (!row) return reply.status(404).send({ success: false, error: '附件不存在' });

    const stat = statAttachment(row.storageName);
    if (!stat.ok) {
      // traversal 说明 DB 里的 storage_name 被污染过，按 404 处理并显式拒绝
      const status = stat.reason === 'traversal' ? 400 : 404;
      return reply
        .status(status)
        .send({ success: false, code: stat.reason.toUpperCase(), error: '附件字节不可读' });
    }

    const delivery = resolveDeliveryMode(row.mime, q.disposition);

    // S5：安全头 —— 禁嗅探 + 收紧 CSP，避免把用户上传当页面执行
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self' data:; object-src 'none'; sandbox",
    );
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', delivery.contentType);
    reply.header(
      'Content-Disposition',
      buildContentDisposition(delivery.disposition, row.originalName),
    );

    const range = parseRangeHeader(req.headers.range, stat.sizeBytes);
    if (range.kind === 'unsatisfiable') {
      reply.header('Content-Range', `bytes */${stat.sizeBytes}`);
      return reply.status(416).send();
    }
    if (range.kind === 'range') {
      reply.header('Content-Range', `bytes ${range.start}-${range.end}/${stat.sizeBytes}`);
      reply.header('Content-Length', String(range.length));
      return reply
        .status(206)
        .send(createReadStream(stat.path, { start: range.start, end: range.end }));
    }

    reply.header('Content-Length', String(stat.sizeBytes));
    return reply.status(200).send(createReadStream(stat.path));
  });

  // DELETE /api/attachments/:id
  app.delete('/api/attachments/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = deleteAttachment(id);
    if (!ok) return reply.status(404).send({ success: false, error: '附件不存在' });
    return { success: true };
  });

  // POST /api/attachments/gc —— 手动触发孤儿回收（也可由运维脚本调用）
  app.post('/api/attachments/gc', async () => {
    const result = sweepOrphanAttachments();
    return { success: true, ...result };
  });
}

export { toAttachmentMeta };
