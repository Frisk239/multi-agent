/**
 * S4 · 附件业务层：元数据入表 + 字节落盘 + 绑定评论 + 孤儿 GC。
 * 路由只做 HTTP 解析，落地规则集中在这里，便于单测。
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { attachments } from '../db/schema.js';
import {
  MAX_ATTACHMENT_BYTES,
  deleteAttachmentBytes,
  sanitizeOriginalName,
  writeAttachmentBytes,
} from './local-store.js';

/** 孤儿附件保留时长：上传后 24h 未绑定评论即可回收。 */
export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

export type AttachmentMeta = {
  id: string;
  issueId: string;
  commentId: string | null;
  originalName: string;
  mime: string;
  sizeBytes: number;
  downloadUrl: string;
  createdAt: string;
};

export function toAttachmentMeta(row: typeof attachments.$inferSelect): AttachmentMeta {
  return {
    id: row.id,
    issueId: row.issueId,
    commentId: row.commentId ?? null,
    originalName: row.originalName,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    // 稳定下载 URL：只暴露 attachment id，不暴露落盘路径
    downloadUrl: `/api/attachments/${row.id}`,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export type CreateAttachmentResult =
  | { ok: true; meta: AttachmentMeta }
  | { ok: false; code: 'EMPTY' | 'TOO_LARGE' | 'WRITE_FAILED'; error: string };

/** 上传：先落盘再入表；落盘失败不留 DB 行，入表失败要回滚字节。 */
export function createAttachment(input: {
  issueId: string;
  bytes: Buffer;
  filename: string | null | undefined;
  mime: string | null | undefined;
  now?: number;
}): CreateAttachmentResult {
  const originalName = sanitizeOriginalName(input.filename);
  const mime = (input.mime ?? '').trim() || 'application/octet-stream';

  if (!input.bytes || input.bytes.length === 0) {
    return { ok: false, code: 'EMPTY', error: '附件内容为空' };
  }
  if (input.bytes.length > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      error: `附件超过上限（${input.bytes.length} > ${MAX_ATTACHMENT_BYTES} 字节）`,
    };
  }

  const id = randomUUID();
  const written = writeAttachmentBytes(input.bytes, originalName, { id });
  if (!written.ok) {
    const code = written.reason === 'too_large' ? 'TOO_LARGE' : 'WRITE_FAILED';
    return { ok: false, code, error: `附件写入失败：${written.reason}` };
  }

  try {
    db.insert(attachments)
      .values({
        id,
        issueId: input.issueId,
        commentId: null,
        originalName,
        mime,
        sizeBytes: written.sizeBytes,
        storageName: written.storageName,
        createdAt: input.now ?? Date.now(),
      })
      .run();
  } catch (e) {
    // 入表失败就把字节收回去，不留无主文件
    deleteAttachmentBytes(written.storageName);
    throw e;
  }

  const row = db.select().from(attachments).where(eq(attachments.id, id)).get()!;
  return { ok: true, meta: toAttachmentMeta(row) };
}

/**
 * 评论提交时绑定附件。只绑定同 issue 且尚未绑定的附件，避免把别处的附件挂过来。
 * 返回实际绑定的数量。
 */
export function bindAttachmentsToComment(input: {
  issueId: string;
  commentId: string;
  attachmentIds: readonly string[];
}): number {
  const ids = Array.from(new Set(input.attachmentIds.filter(Boolean)));
  if (ids.length === 0) return 0;

  const rows = db
    .select()
    .from(attachments)
    .where(and(inArray(attachments.id, ids), eq(attachments.issueId, input.issueId)))
    .all();

  let bound = 0;
  for (const row of rows) {
    if (row.commentId != null) continue; // 已绑定的不重绑
    db.update(attachments)
      .set({ commentId: input.commentId })
      .where(eq(attachments.id, row.id))
      .run();
    bound++;
  }
  return bound;
}

export function listAttachmentsForIssue(issueId: string): AttachmentMeta[] {
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.issueId, issueId))
    .all()
    .map(toAttachmentMeta);
}

export function getAttachmentRow(id: string) {
  return db.select().from(attachments).where(eq(attachments.id, id)).get() ?? null;
}

/** 删除：先删行再删字节；字节删失败不影响 DB 一致性（GC 兜底）。 */
export function deleteAttachment(id: string): boolean {
  const row = getAttachmentRow(id);
  if (!row) return false;
  db.delete(attachments).where(eq(attachments.id, id)).run();
  deleteAttachmentBytes(row.storageName);
  return true;
}

/**
 * 孤儿 GC：上传后超过 TTL 仍未绑定评论的附件，连行带字节一起清。
 * 场景：用户上传了文件但最终没提交评论。
 */
export function sweepOrphanAttachments(
  opts: { now?: number; ttlMs?: number } = {},
): { removed: number; ids: string[] } {
  const now = opts.now ?? Date.now();
  const ttl = opts.ttlMs ?? ORPHAN_TTL_MS;
  const cutoff = now - ttl;

  const orphans = db
    .select()
    .from(attachments)
    .where(and(isNull(attachments.commentId), lt(attachments.createdAt, cutoff)))
    .all();

  const ids: string[] = [];
  for (const row of orphans) {
    db.delete(attachments).where(eq(attachments.id, row.id)).run();
    deleteAttachmentBytes(row.storageName);
    ids.push(row.id);
  }
  return { removed: ids.length, ids };
}
