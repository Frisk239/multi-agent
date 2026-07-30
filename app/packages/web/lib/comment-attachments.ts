/**
 * F1 · Minimal paste-image / attachment helpers (local data URLs in comment body).
 * Not TipTap; embeds markdown image syntax so comments stay plain text.
 */

export const MAX_ATTACHMENT_BYTES = 512 * 1024; // 512 KiB per image
export const ALLOWED_ATTACHMENT_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type AttachmentValidation =
  | { ok: true; mime: string; sizeBytes: number; dataUrl: string; markdown: string }
  | { ok: false; error: string };

export function isAllowedAttachmentMime(mime: string): boolean {
  return (ALLOWED_ATTACHMENT_MIME as readonly string[]).includes(mime);
}

/**
 * Validate a data URL from paste/file reader and produce markdown image snippet.
 */
export function validateImageDataUrl(
  dataUrl: string,
  opts?: { fileName?: string; maxBytes?: number },
): AttachmentValidation {
  const max = opts?.maxBytes ?? MAX_ATTACHMENT_BYTES;
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return { ok: false, error: '不是有效的图片 data URL' };
  const mime = m[1]!.toLowerCase();
  if (!isAllowedAttachmentMime(mime)) {
    return { ok: false, error: `不支持的图片类型: ${mime}` };
  }
  const b64 = m[2]!;
  // approximate decoded size
  const sizeBytes = Math.floor((b64.length * 3) / 4);
  if (sizeBytes > max) {
    return {
      ok: false,
      error: `图片过大（${sizeBytes} bytes > ${max}）`,
    };
  }
  const name = (opts?.fileName ?? 'paste').replace(/[^\w.\-]+/g, '_').slice(0, 64);
  const markdown = `\n![${name}](${dataUrl})\n`;
  return { ok: true, mime, sizeBytes, dataUrl, markdown };
}

/** Append validated markdown into a comment body. */
export function appendAttachmentMarkdown(body: string, markdown: string): string {
  const base = body.trimEnd();
  if (!base) return markdown.trimStart();
  return `${base}${markdown.startsWith('\n') ? '' : '\n'}${markdown}`;
}
