import { describe, expect, it } from 'vitest';
import {
  appendAttachmentMarkdown,
  validateImageDataUrl,
} from './comment-attachments';

describe('validateImageDataUrl', () => {
  it('accepts small png data url', () => {
    // 1x1 png
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const v = validateImageDataUrl(dataUrl, { fileName: 'dot.png' });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.mime).toBe('image/png');
      expect(v.markdown).toContain('![dot.png]');
      expect(v.markdown).toContain('data:image/png');
    }
  });

  it('rejects non-image mime', () => {
    const v = validateImageDataUrl('data:text/plain;base64,aGVsbG8=');
    expect(v.ok).toBe(false);
  });

  it('rejects oversized payload', () => {
    const big = 'A'.repeat(900_000);
    const v = validateImageDataUrl(`data:image/png;base64,${big}`, {
      maxBytes: 100,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/过大/);
  });
});

describe('appendAttachmentMarkdown', () => {
  it('appends after existing body', () => {
    expect(appendAttachmentMarkdown('hello', '\n![a](data:x)\n')).toContain('hello');
    expect(appendAttachmentMarkdown('hello', '\n![a](data:x)\n')).toContain('![a]');
  });
});
