/**
 * S5 · 投递方式判定（纯函数，可单测）。
 *
 * 安全立场：**只有**图片 / PDF / 纯文本允许 inline 预览，其余一律 attachment 下载。
 * 用户上传的内容绝不能被浏览器当页面执行 —— 这就是为什么 HTML/SVG 也走下载：
 * 二者都能携带脚本。配合响应上的 nosniff + 收紧 CSP 形成双保险。
 */

/** 允许 inline 预览的 MIME 前缀 / 精确值。 */
const INLINE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
]);

const INLINE_EXACT = new Set(['application/pdf', 'text/plain']);

export type DeliveryMode = {
  disposition: 'inline' | 'attachment';
  /** 实际下发的 Content-Type（不可预览类型会被降级为 octet-stream） */
  contentType: string;
  previewable: boolean;
};

/** 该 MIME 是否允许 inline 预览。 */
export function isPreviewableMime(mime: string | null | undefined): boolean {
  const m = (mime ?? '').split(';')[0]!.trim().toLowerCase();
  if (!m) return false;
  if (INLINE_IMAGE_TYPES.has(m)) return true;
  if (INLINE_EXACT.has(m)) return true;
  return false;
}

/**
 * 决定投递方式。
 * `requested` 来自 ?disposition=inline|attachment：
 *  - 显式要 attachment → 一定下载
 *  - 要 inline 但类型不可预览 → 仍然下载（不给可执行内容开 inline 的口子）
 *  - 未指定 → 可预览类型 inline，其余下载
 */
export function resolveDeliveryMode(
  mime: string | null | undefined,
  requested?: string | null,
): DeliveryMode {
  const raw = (mime ?? '').split(';')[0]!.trim().toLowerCase();
  const previewable = isPreviewableMime(raw);
  const want = (requested ?? '').trim().toLowerCase();

  if (want === 'attachment') {
    return { disposition: 'attachment', contentType: 'application/octet-stream', previewable };
  }

  if (previewable) {
    return { disposition: 'inline', contentType: raw, previewable: true };
  }

  // 不可预览：即使请求 inline 也降级为下载，且不回显原始 MIME
  return { disposition: 'attachment', contentType: 'application/octet-stream', previewable: false };
}

/**
 * 构造 Content-Disposition。
 * 同时给出 ASCII 回退与 RFC 5987 的 filename*，以支持中文名。
 */
export function buildContentDisposition(
  disposition: 'inline' | 'attachment',
  originalName: string,
): string {
  const fallback = originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(originalName);
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
