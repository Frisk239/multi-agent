import { describe, expect, it } from 'vitest';
import {
  buildContentDisposition,
  isPreviewableMime,
  resolveDeliveryMode,
} from './delivery.js';

describe('isPreviewableMime', () => {
  it('图片 / PDF / 纯文本可预览', () => {
    for (const m of [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/avif',
      'application/pdf',
      'text/plain',
    ]) {
      expect(isPreviewableMime(m)).toBe(true);
    }
  });

  it('带参数的 content-type 也能识别', () => {
    expect(isPreviewableMime('text/plain; charset=utf-8')).toBe(true);
    expect(isPreviewableMime('IMAGE/PNG')).toBe(true);
  });

  // 安全关键：这两类能带脚本，绝不 inline
  it('HTML 与 SVG 不可预览（可携带脚本）', () => {
    expect(isPreviewableMime('text/html')).toBe(false);
    expect(isPreviewableMime('image/svg+xml')).toBe(false);
  });

  it('其它类型不可预览', () => {
    for (const m of [
      'application/zip',
      'application/octet-stream',
      'video/mp4',
      'application/javascript',
      'text/csv',
      '',
      null,
      undefined,
    ]) {
      expect(isPreviewableMime(m as string)).toBe(false);
    }
  });
});

describe('resolveDeliveryMode', () => {
  it('可预览类型默认 inline，并保留原 MIME', () => {
    const d = resolveDeliveryMode('image/png');
    expect(d).toEqual({ disposition: 'inline', contentType: 'image/png', previewable: true });
  });

  it('不可预览类型默认下载，且不回显原 MIME', () => {
    const d = resolveDeliveryMode('application/zip');
    expect(d.disposition).toBe('attachment');
    expect(d.contentType).toBe('application/octet-stream');
  });

  it('显式请求 attachment 时，可预览类型也走下载', () => {
    const d = resolveDeliveryMode('image/png', 'attachment');
    expect(d.disposition).toBe('attachment');
    expect(d.contentType).toBe('application/octet-stream');
  });

  // 不给可执行内容开 inline 的口子
  it('对 HTML 请求 inline 仍被降级为下载', () => {
    const d = resolveDeliveryMode('text/html', 'inline');
    expect(d.disposition).toBe('attachment');
    expect(d.contentType).toBe('application/octet-stream');
    expect(d.previewable).toBe(false);
  });

  it('对 SVG 请求 inline 同样降级', () => {
    expect(resolveDeliveryMode('image/svg+xml', 'inline').disposition).toBe('attachment');
  });

  it('空 MIME 走下载', () => {
    expect(resolveDeliveryMode(null).disposition).toBe('attachment');
  });
});

describe('buildContentDisposition', () => {
  it('ASCII 名直出', () => {
    const v = buildContentDisposition('attachment', 'report.pdf');
    expect(v).toContain('attachment;');
    expect(v).toContain('filename="report.pdf"');
    expect(v).toContain("filename*=UTF-8''report.pdf");
  });

  it('中文名有 ASCII 回退 + RFC 5987 编码', () => {
    const v = buildContentDisposition('inline', '设计稿.png');
    expect(v).toContain('inline;');
    expect(v).toMatch(/filename="_{3}\.png"/);
    expect(v).toContain(`filename*=UTF-8''${encodeURIComponent('设计稿.png')}`);
  });

  it('引号与反斜杠被中和，避免头注入', () => {
    const v = buildContentDisposition('attachment', 'a"b\\c.txt');
    expect(v).toContain('filename="a_b_c.txt"');
  });
});
