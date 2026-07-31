/**
 * S4 · LocalAttachmentStore —— 单一受管本地根，字节落盘，DB 只存元数据。
 *
 * 替代的旧做法：web/lib/comment-attachments.ts 把图片转成 base64 data URL 内嵌进
 * comment body。后果是单图上限只能压到 512KiB、评论正文被撑爆、无法预览、
 * 也无法在 prompt 里安全地喂给 agent。
 *
 * 刻意的边界（阶段约束）：
 *  - 只服务 Issue 评论，不做通用文件管理
 *  - 只有这一个 store，不预抽多 backend（没有 S3/云）
 *  - 单文件上限 25 MiB
 *  - 不做分片/断点/去重/版本/转码
 *
 * 安全要点：storage_name 由服务端生成（UUID + 白名单扩展名），绝不采用客户端路径；
 * 所有读写都过 resolveStoredPath 做「必须在根内」校验，杜绝 ../ 穿越。
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';

/** 单文件上限：25 MiB（阶段约束，硬性） */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * 受管根目录。默认 ~/.multi-agent/attachments，与 isolated-workspaces 的
 * ~/.multi-agent 约定同源；MA_ATTACHMENTS_ROOT 可覆盖（测试用）。
 */
export function attachmentsRoot(): string {
  const override = process.env.MA_ATTACHMENTS_ROOT?.trim();
  if (override) return resolve(override);
  return join(homedir(), '.multi-agent', 'attachments');
}

export function ensureAttachmentsRoot(root = attachmentsRoot()): string {
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

/** 允许保留的扩展名白名单；不在表内则不带扩展名（内容仍完整保存）。 */
const SAFE_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif',
  '.pdf',
  '.txt', '.md', '.log', '.json', '.csv', '.yaml', '.yml', '.xml',
  '.zip', '.tar', '.gz',
  '.mp4', '.mov', '.webm',
  '.docx', '.xlsx', '.pptx',
]);

/**
 * 解码 X-Filename 头。
 *
 * HTTP 头是 latin-1，直接塞 UTF-8 中文名会被解成乱码（实测「报告.txt」→「¥J.txt」）。
 * 约定客户端用 encodeURIComponent 编码；这里做百分号解码，纯 ASCII 名不受影响。
 * 解码失败（畸形 % 序列）时退回原串，不抛。
 */
export function decodeFilenameHeader(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  if (!s.includes('%')) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 清洗客户端文件名用于**展示**：去掉路径分量与控制字符，不用于落盘。 */
export function sanitizeOriginalName(raw: string | null | undefined): string {
  const base = (raw ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.slice(0, 200) || 'unnamed';
}

/** 服务端生成落盘名：UUID + 白名单扩展名。绝不使用客户端提供的路径。 */
export function makeStorageName(originalName: string, id: string = randomUUID()): string {
  const ext = extname(sanitizeOriginalName(originalName)).toLowerCase();
  return SAFE_EXT.has(ext) ? `${id}${ext}` : id;
}

export type ResolveResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'traversal' | 'empty' };

/**
 * 把 storage_name 解析成绝对路径，并强制它必须落在根目录内。
 * 这是路径穿越的唯一闸口 —— 任何读写都必须先过这里。
 */
export function resolveStoredPath(
  storageName: string,
  root = attachmentsRoot(),
): ResolveResult {
  const name = (storageName ?? '').trim();
  if (!name) return { ok: false, reason: 'empty' };

  const absRoot = resolve(root);
  const candidate = resolve(absRoot, name);

  // 必须严格在根之下（同时排除「等于根」这种退化情况）
  if (candidate === absRoot) return { ok: false, reason: 'traversal' };
  if (!candidate.startsWith(absRoot + sep)) return { ok: false, reason: 'traversal' };

  return { ok: true, path: candidate };
}

export type WriteResult =
  | { ok: true; storageName: string; sizeBytes: number; sha256: string; path: string }
  | { ok: false; reason: 'too_large' | 'empty' | 'traversal' };

/** 写入字节。超限/空内容直接拒绝，不留半个文件。 */
export function writeAttachmentBytes(
  bytes: Buffer,
  originalName: string,
  opts: { root?: string; id?: string | undefined; maxBytes?: number } = {},
): WriteResult {
  const root = ensureAttachmentsRoot(opts.root ?? attachmentsRoot());
  const max = opts.maxBytes ?? MAX_ATTACHMENT_BYTES;

  if (!bytes || bytes.length === 0) return { ok: false, reason: 'empty' };
  if (bytes.length > max) return { ok: false, reason: 'too_large' };

  const storageName = makeStorageName(originalName, opts.id);
  const resolved = resolveStoredPath(storageName, root);
  if (!resolved.ok) return { ok: false, reason: 'traversal' };

  writeFileSync(resolved.path, bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    ok: true,
    storageName,
    sizeBytes: bytes.length,
    sha256,
    path: resolved.path,
  };
}

export type ReadResult =
  | { ok: true; bytes: Buffer; sizeBytes: number }
  | { ok: false; reason: 'traversal' | 'missing' };

export function readAttachmentBytes(
  storageName: string,
  root = attachmentsRoot(),
): ReadResult {
  const resolved = resolveStoredPath(storageName, root);
  if (!resolved.ok) return { ok: false, reason: 'traversal' };
  if (!existsSync(resolved.path)) return { ok: false, reason: 'missing' };
  const bytes = readFileSync(resolved.path);
  return { ok: true, bytes, sizeBytes: bytes.length };
}

/** 文件大小，不读全量内容（Range 响应要用）。 */
export function statAttachment(
  storageName: string,
  root = attachmentsRoot(),
): { ok: true; sizeBytes: number; path: string } | { ok: false; reason: 'traversal' | 'missing' } {
  const resolved = resolveStoredPath(storageName, root);
  if (!resolved.ok) return { ok: false, reason: 'traversal' };
  if (!existsSync(resolved.path)) return { ok: false, reason: 'missing' };
  return { ok: true, sizeBytes: statSync(resolved.path).size, path: resolved.path };
}

/** 删除字节。已不存在视为成功（幂等），穿越则拒绝。 */
export function deleteAttachmentBytes(
  storageName: string,
  root = attachmentsRoot(),
): { ok: true; removed: boolean } | { ok: false; reason: 'traversal' } {
  const resolved = resolveStoredPath(storageName, root);
  if (!resolved.ok) return { ok: false, reason: 'traversal' };
  if (!existsSync(resolved.path)) return { ok: true, removed: false };
  rmSync(resolved.path, { force: true });
  return { ok: true, removed: true };
}
