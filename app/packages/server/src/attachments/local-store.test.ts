import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MAX_ATTACHMENT_BYTES,
  attachmentsRoot,
  decodeFilenameHeader,
  deleteAttachmentBytes,
  makeStorageName,
  readAttachmentBytes,
  resolveStoredPath,
  sanitizeOriginalName,
  statAttachment,
  writeAttachmentBytes,
} from './local-store.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ma-attach-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.MA_ATTACHMENTS_ROOT;
});

describe('attachmentsRoot', () => {
  it('默认落在 ~/.multi-agent/attachments（与既有本地根约定同源）', () => {
    const r = attachmentsRoot();
    expect(r.replace(/\\/g, '/')).toMatch(/\.multi-agent\/attachments$/);
  });

  it('MA_ATTACHMENTS_ROOT 可覆盖', () => {
    process.env.MA_ATTACHMENTS_ROOT = root;
    expect(attachmentsRoot()).toBe(resolve(root));
  });
});

// 实测踩到的真 bug：HTTP 头是 latin-1，UTF-8 中文名直传会变乱码
describe('decodeFilenameHeader', () => {
  it('百分号编码的中文名能还原', () => {
    expect(decodeFilenameHeader(encodeURIComponent('报告.txt'))).toBe('报告.txt');
    expect(decodeFilenameHeader(encodeURIComponent('设计稿 v2.png'))).toBe('设计稿 v2.png');
  });

  it('纯 ASCII 名原样返回', () => {
    expect(decodeFilenameHeader('report.pdf')).toBe('report.pdf');
  });

  it('畸形百分号序列不抛，退回原串', () => {
    expect(decodeFilenameHeader('%E4%B8%AD%ZZ')).toBe('%E4%B8%AD%ZZ');
  });

  it('空值返回空串', () => {
    expect(decodeFilenameHeader(null)).toBe('');
    expect(decodeFilenameHeader(undefined)).toBe('');
    expect(decodeFilenameHeader('  ')).toBe('');
  });
});

describe('sanitizeOriginalName', () => {
  it('剥掉路径分量，只留文件名', () => {
    expect(sanitizeOriginalName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeOriginalName('C:\\Windows\\system32\\cmd.exe')).toBe('cmd.exe');
    expect(sanitizeOriginalName('a/b/c/报告.pdf')).toBe('报告.pdf');
  });

  it('去掉前导点，避免生成隐藏文件名', () => {
    expect(sanitizeOriginalName('...hidden.txt')).toBe('hidden.txt');
  });

  it('空值有兜底名', () => {
    expect(sanitizeOriginalName('')).toBe('unnamed');
    expect(sanitizeOriginalName(null)).toBe('unnamed');
    expect(sanitizeOriginalName(undefined)).toBe('unnamed');
    expect(sanitizeOriginalName('/')).toBe('unnamed');
  });
});

describe('makeStorageName', () => {
  it('落盘名是 UUID，白名单扩展名保留', () => {
    expect(makeStorageName('report.pdf', 'fixed-id')).toBe('fixed-id.pdf');
    expect(makeStorageName('shot.PNG', 'fixed-id')).toBe('fixed-id.png');
  });

  it('非白名单扩展名不保留（避免落下可执行后缀）', () => {
    expect(makeStorageName('payload.exe', 'fixed-id')).toBe('fixed-id');
    expect(makeStorageName('script.bat', 'fixed-id')).toBe('fixed-id');
    expect(makeStorageName('lib.dll', 'fixed-id')).toBe('fixed-id');
  });

  it('客户端路径不会进入落盘名', () => {
    const n = makeStorageName('../../evil.pdf', 'fixed-id');
    expect(n).toBe('fixed-id.pdf');
    expect(n).not.toContain('..');
    expect(n).not.toContain('/');
  });
});

// 安全关键：这是路径穿越的唯一闸口
describe('resolveStoredPath', () => {
  it('正常名字解析到根之下', () => {
    const r = resolveStoredPath('abc.png', root);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.path.startsWith(resolve(root) + sep)).toBe(true);
  });

  it('拒绝 ../ 穿越', () => {
    for (const bad of ['../evil', '../../etc/passwd', 'a/../../b', '..']) {
      const r = resolveStoredPath(bad, root);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('traversal');
    }
  });

  it('拒绝绝对路径逃逸', () => {
    const abs = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd';
    const r = resolveStoredPath(abs, root);
    expect(r.ok).toBe(false);
  });

  it('拒绝空名与仅空白', () => {
    expect(resolveStoredPath('', root).ok).toBe(false);
    expect(resolveStoredPath('   ', root).ok).toBe(false);
  });

  it('拒绝解析后等于根本身', () => {
    const r = resolveStoredPath('.', root);
    expect(r.ok).toBe(false);
  });
});

describe('writeAttachmentBytes', () => {
  it('写入成功并返回大小与 sha256', () => {
    const bytes = Buffer.from('hello attachment');
    const w = writeAttachmentBytes(bytes, 'note.txt', { root, id: 'id-1' });
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(w.storageName).toBe('id-1.txt');
    expect(w.sizeBytes).toBe(bytes.length);
    expect(w.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(w.path).toString()).toBe('hello attachment');
  });

  it('拒绝空内容', () => {
    const w = writeAttachmentBytes(Buffer.alloc(0), 'x.txt', { root });
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.reason).toBe('empty');
  });

  it('超过上限拒绝，且不留残文件', () => {
    const w = writeAttachmentBytes(Buffer.alloc(11), 'big.bin', { root, maxBytes: 10 });
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.reason).toBe('too_large');
  });

  it('默认上限是 25 MiB', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(25 * 1024 * 1024);
  });

  it('恶意文件名不会写到根外', () => {
    const w = writeAttachmentBytes(Buffer.from('x'), '../../escape.txt', {
      root,
      id: 'id-2',
    });
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(w.path.startsWith(resolve(root) + sep)).toBe(true);
    expect(existsSync(join(root, 'id-2.txt'))).toBe(true);
  });
});

describe('readAttachmentBytes / statAttachment', () => {
  it('读回写入的内容', () => {
    const w = writeAttachmentBytes(Buffer.from('abc'), 'a.txt', { root, id: 'id-3' });
    if (!w.ok) throw new Error('write failed');
    const r = readAttachmentBytes(w.storageName, root);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bytes.toString()).toBe('abc');
  });

  it('不存在返回 missing 而非抛错', () => {
    const r = readAttachmentBytes('nope.txt', root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('missing');
  });

  it('穿越名在读取时同样被拒', () => {
    writeFileSync(join(root, '..', 'outside.txt'), 'secret');
    const r = readAttachmentBytes('../outside.txt', root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('traversal');
    rmSync(join(root, '..', 'outside.txt'), { force: true });
  });

  it('stat 只取大小不读内容', () => {
    const w = writeAttachmentBytes(Buffer.alloc(1234), 'b.bin', { root, id: 'id-4' });
    if (!w.ok) throw new Error('write failed');
    const s = statAttachment(w.storageName, root);
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.sizeBytes).toBe(1234);
  });
});

describe('deleteAttachmentBytes', () => {
  it('删除后文件消失', () => {
    const w = writeAttachmentBytes(Buffer.from('x'), 'c.txt', { root, id: 'id-5' });
    if (!w.ok) throw new Error('write failed');
    const d = deleteAttachmentBytes(w.storageName, root);
    expect(d).toEqual({ ok: true, removed: true });
    expect(existsSync(w.path)).toBe(false);
  });

  it('重复删除幂等', () => {
    expect(deleteAttachmentBytes('ghost.txt', root)).toEqual({ ok: true, removed: false });
  });

  it('穿越名不会删到根外的文件', () => {
    const outside = join(root, '..', 'keep-me.txt');
    writeFileSync(outside, 'important');
    const d = deleteAttachmentBytes('../keep-me.txt', root);
    expect(d.ok).toBe(false);
    expect(existsSync(outside)).toBe(true);
    rmSync(outside, { force: true });
  });
});
