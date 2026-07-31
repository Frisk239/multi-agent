/**
 * S5 · HTTP Range 解析（纯函数，可单测）。
 * 只支持单区间 `bytes=a-b`（多区间 multipart/byteranges 明确不做）。
 */

export type RangeResult =
  | { kind: 'none' }
  | { kind: 'range'; start: number; end: number; length: number }
  | { kind: 'unsatisfiable' };

/**
 * 解析 Range 头。
 * - 无头 / 非 bytes 单位 / 语法不可解析 → none（按 200 全量返回，符合 RFC 容错建议）
 * - 起点超出文件长度 → unsatisfiable（调用方回 416 + Content-Range: bytes * /size）
 * - 后缀式 `bytes=-N` 表示最后 N 字节
 */
export function parseRangeHeader(
  header: string | string[] | undefined,
  sizeBytes: number,
): RangeResult {
  if (header == null) return { kind: 'none' };
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return { kind: 'none' };

  const m = /^bytes=(\d*)-(\d*)$/.exec(raw.trim());
  if (!m) return { kind: 'none' };

  const startRaw = m[1] ?? '';
  const endRaw = m[2] ?? '';

  // 空文件对任何区间都不可满足
  if (sizeBytes <= 0) return { kind: 'unsatisfiable' };

  // `bytes=-N`：最后 N 字节
  if (startRaw === '') {
    if (endRaw === '') return { kind: 'none' }; // `bytes=-` 无意义
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return { kind: 'unsatisfiable' };
    const length = Math.min(suffix, sizeBytes);
    const start = sizeBytes - length;
    return { kind: 'range', start, end: sizeBytes - 1, length };
  }

  const start = Number(startRaw);
  if (!Number.isFinite(start) || start < 0) return { kind: 'unsatisfiable' };
  if (start >= sizeBytes) return { kind: 'unsatisfiable' };

  // `bytes=a-`：从 a 到结尾
  const end = endRaw === '' ? sizeBytes - 1 : Math.min(Number(endRaw), sizeBytes - 1);
  if (!Number.isFinite(end) || end < start) return { kind: 'unsatisfiable' };

  return { kind: 'range', start, end, length: end - start + 1 };
}
