import { describe, it, expect } from 'vitest';
import {
  MAX_PENDING_ATTACHMENTS,
  MAX_UPLOAD_BYTES,
  addPending,
  encodeFilenameHeader,
  formatBytes,
  removePending,
  validateUploadFile,
} from './attachment-upload';

describe('MAX_UPLOAD_BYTES', () => {
  it('与后端 MAX_ATTACHMENT_BYTES 对齐（25 MiB）', () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });

  it('pending 上限对齐 attachmentIds .max(20)', () => {
    expect(MAX_PENDING_ATTACHMENTS).toBe(20);
  });
});

describe('encodeFilenameHeader', () => {
  it('percent-encode 中文名（头是 latin-1，直传会炸）', () => {
    expect(encodeFilenameHeader('报告.pdf')).toBe('%E6%8A%A5%E5%91%8A.pdf');
  });

  it('ASCII 名基本原样', () => {
    expect(encodeFilenameHeader('report.pdf')).toBe('report.pdf');
  });

  it('空格与特殊字符也被编码', () => {
    expect(encodeFilenameHeader('my file (1).txt')).toBe('my%20file%20(1).txt');
  });

  it('空值不抛', () => {
    expect(encodeFilenameHeader('')).toBe('');
  });
});

describe('validateUploadFile', () => {
  it('普通文件通过', () => {
    expect(validateUploadFile({ name: 'a.png', size: 1024, type: 'image/png' })).toEqual({
      ok: true,
    });
  });

  it('不限制 mime —— pdf / doc / 未知类型都放行（后端不限类型）', () => {
    expect(validateUploadFile({ name: 'a.pdf', size: 10, type: 'application/pdf' }).ok).toBe(
      true,
    );
    expect(validateUploadFile({ name: 'a.zip', size: 10, type: '' }).ok).toBe(true);
    expect(validateUploadFile({ name: 'a.bin', size: 10, type: null }).ok).toBe(true);
  });

  it('超过 25 MiB 被拒并带人读体积', () => {
    const r = validateUploadFile({ name: '大文件.mp4', size: MAX_UPLOAD_BYTES + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('大文件.mp4');
      expect(r.error).toContain('25 MiB');
    }
  });

  it('恰好等于上限放行（边界）', () => {
    expect(validateUploadFile({ name: 'edge.bin', size: MAX_UPLOAD_BYTES }).ok).toBe(true);
  });

  it('空文件被拒（后端也会 EMPTY/400）', () => {
    const r = validateUploadFile({ name: 'empty.txt', size: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('空');
  });

  it('无文件名被拒', () => {
    const r = validateUploadFile({ name: '   ', size: 100 });
    expect(r.ok).toBe(false);
  });

  it('maxBytes 可覆盖（测试/回退路径用）', () => {
    expect(validateUploadFile({ name: 'a.png', size: 200 }, { maxBytes: 100 }).ok).toBe(false);
  });
});

describe('formatBytes', () => {
  it('B / KiB / MiB 三档', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1 KiB');
    expect(formatBytes(1536)).toBe('1.5 KiB');
    expect(formatBytes(1024 * 1024)).toBe('1 MiB');
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MiB');
  });

  it('非法值给占位符', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('addPending / removePending', () => {
  it('追加并保持顺序', () => {
    const a = addPending([], 'att-1');
    expect(a).toEqual({ ok: true, ids: ['att-1'] });
    const b = addPending(a.ids, 'att-2');
    expect(b.ids).toEqual(['att-1', 'att-2']);
  });

  it('去重：同 id 重复 append 不变长', () => {
    const r = addPending(['att-1'], 'att-1');
    expect(r.ok).toBe(true);
    expect(r.ids).toEqual(['att-1']);
  });

  it('不修改入参数组（纯函数）', () => {
    const input = ['att-1'];
    addPending(input, 'att-2');
    expect(input).toEqual(['att-1']);
  });

  it('超过 20 个被拒并保留原列表', () => {
    const full = Array.from({ length: MAX_PENDING_ATTACHMENTS }, (_, i) => `att-${i}`);
    const r = addPending(full, 'att-overflow');
    expect(r.ok).toBe(false);
    expect(r.ids).toHaveLength(MAX_PENDING_ATTACHMENTS);
    if (!r.ok) expect(r.error).toContain('20');
  });

  it('空 id 被拒', () => {
    const r = addPending(['att-1'], '  ');
    expect(r.ok).toBe(false);
    expect(r.ids).toEqual(['att-1']);
  });

  it('removePending 移除指定 id，不存在时原样', () => {
    expect(removePending(['a', 'b'], 'a')).toEqual(['b']);
    expect(removePending(['a', 'b'], 'zz')).toEqual(['a', 'b']);
    const input = ['a'];
    expect(removePending(input, 'a')).not.toBe(input);
  });
});
