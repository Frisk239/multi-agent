/**
 * W1 · 真实附件上传的纯函数层（可单测，无 React / 无 fetch）。
 *
 * 与 `comment-attachments.ts` 的关系：
 * - 本文件 = **主路径**（字节上传到 `POST /api/issues/:id/attachments`，任意类型、25 MiB）
 * - `comment-attachments.ts` = **回退路径**（data URL 内嵌 markdown，仅图片、512 KiB）
 *
 * 后端契约出处：
 * - 上限：`app/packages/server/src/attachments/local-store.ts` `MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024`
 * - 文件名头：`decodeFilenameHeader` 期望客户端先 `encodeURIComponent`（HTTP 头是 latin-1，中文名直传会炸）
 * - 评论绑定上限：`CreateCommentInput.attachmentIds` = `z.array(BusinessId).max(20)`
 *   （`app/packages/shared/src/schema.ts`）
 */

/** 单文件上限，必须与后端 `MAX_ATTACHMENT_BYTES` 一致，否则前端放过去也会被 413 打回。 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** 一条评论最多能绑多少附件；对齐后端 `attachmentIds` 的 `.max(20)`。 */
export const MAX_PENDING_ATTACHMENTS = 20;

/** File 的最小可测形状（jsdom 里造 File 麻烦，纯函数只取这三个字段）。 */
export type UploadFileLike = {
  name: string;
  size: number;
  type?: string | null;
};

export type UploadValidation = { ok: true } | { ok: false; error: string };

/**
 * 文件名 → `X-Filename` 头值。
 * HTTP 头按 latin-1 传输，中文/emoji 名字必须先 percent-encode，
 * 服务端 `decodeFilenameHeader` 会解回来。
 */
export function encodeFilenameHeader(name: string): string {
  return encodeURIComponent(name ?? '');
}

/**
 * 上传前校验：**只**看大小与非空。
 *
 * 刻意不校验 mime —— 后端 `createAttachment` 不限类型（缺失时兜底
 * `application/octet-stream`）。前端多加一层白名单就是重演旧 📎 按钮
 * 「选了 pdf 却报『不支持的图片类型』」的骗人行为。
 */
export function validateUploadFile(
  file: UploadFileLike,
  opts?: { maxBytes?: number },
): UploadValidation {
  const max = opts?.maxBytes ?? MAX_UPLOAD_BYTES;
  const name = (file?.name ?? '').trim();
  if (!name) return { ok: false, error: '文件名为空，无法上传' };
  if (!Number.isFinite(file?.size) || file.size <= 0) {
    // 后端同样会以 code=EMPTY / 400 拒绝
    return { ok: false, error: `${name}：文件内容为空` };
  }
  if (file.size > max) {
    return {
      ok: false,
      error: `${name} 过大（${formatBytes(file.size)} > ${formatBytes(max)}）`,
    };
  }
  return { ok: true };
}

/** 人读字节数：B / KiB / MiB（二进制单位，与后端上限口径一致）。 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  const kib = n / 1024;
  if (kib < 1024) return `${trimNum(kib)} KiB`;
  return `${trimNum(kib / 1024)} MiB`;
}

function trimNum(v: number): string {
  const s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

export type PendingResult =
  | { ok: true; ids: string[] }
  | { ok: false; ids: string[]; error: string };

/**
 * 把新上传成功的附件 id 追加进 pending 列表。
 * 去重（同 id 重复 append 视为已在列）；超上限则原样返回并给出文案。
 */
export function addPending(
  ids: readonly string[],
  id: string,
  opts?: { max?: number },
): PendingResult {
  const max = opts?.max ?? MAX_PENDING_ATTACHMENTS;
  const base = ids.slice();
  const next = (id ?? '').trim();
  if (!next) return { ok: false, ids: base, error: '附件 id 为空' };
  if (base.includes(next)) return { ok: true, ids: base };
  if (base.length >= max) {
    return { ok: false, ids: base, error: `一条评论最多带 ${max} 个附件` };
  }
  return { ok: true, ids: [...base, next] };
}

/** 从 pending 列表移除一个 id（不存在时原样返回新数组）。 */
export function removePending(ids: readonly string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}
