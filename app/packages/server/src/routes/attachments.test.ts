import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestDb } from '../__test-helpers__/test-db.js';
import { seedTestFixtures } from '../__test-helpers__/seed-fixtures.js';
import { attachments, issues } from '../db/schema.js';

/**
 * S4/S5 · 附件路由测试。
 * 纯函数分支（穿越闸口 / Range / 投递方式）已在 src/attachments/*.test.ts 覆盖；
 * 这里钉 HTTP 契约：上传→落盘→稳定 URL 下载、Range 206/416、预览安全头、
 * 删除清字节、孤儿 GC、以及「重启后仍可下载」（用新 app 实例模拟进程重启）。
 */

const testState = vi.hoisted(() => ({
  db: null as ReturnType<typeof createTestDb>['db'] | null,
  cleanup: null as (() => void) | null,
}));

vi.mock('../db/client.js', () => ({
  get db() {
    if (!testState.db) throw new Error('test db not ready');
    return testState.db;
  },
  resolveAssigneeLabel: () => 'test-assignee',
  resolveAuthorLabel: (type: string, id: string) => id,
}));

const WS_ID = 'ws-local';
const CREATOR_ID = 'user-linyuan';
const NOW = 1_700_000_000_000;
const ISSUE_ID = 'iss-attach';

let root: string;

async function buildServer() {
  const Fastify = (await import('fastify')).default;
  const { attachmentRoutes } = await import('./attachments.js');
  const app = Fastify();
  await app.register(attachmentRoutes);
  await app.ready();
  return app;
}

async function upload(
  app: Awaited<ReturnType<typeof buildServer>>,
  payload: Buffer,
  filename: string,
  contentType: string,
) {
  return app.inject({
    method: 'POST',
    url: `/api/issues/${ISSUE_ID}/attachments`,
    payload,
    headers: { 'content-type': contentType, 'x-filename': filename },
  });
}

describe('S4/S5 attachment routes', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'ma-attach-route-'));
    process.env.MA_ATTACHMENTS_ROOT = root;

    const t = createTestDb();
    testState.db = t.db;
    testState.cleanup = t.cleanup;
    seedTestFixtures(t.db);
    t.db
      .insert(issues)
      .values({
        id: ISSUE_ID,
        workspaceId: WS_ID,
        identifier: 'T-attach',
        title: 'attachment issue',
        status: 'todo',
        priority: 'none',
        creatorType: 'member',
        creatorId: CREATOR_ID,
        position: 0,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    app = await buildServer();
  });

  afterEach(async () => {
    await app.close();
    testState.cleanup?.();
    testState.db = null;
    rmSync(root, { recursive: true, force: true });
    delete process.env.MA_ATTACHMENTS_ROOT;
    vi.resetModules();
  });

  it('上传：元数据入表 + 字节落盘 + 返回稳定下载 URL', async () => {
    const res = await upload(app, Buffer.from('hello file'), 'note.txt', 'text/plain');
    expect(res.statusCode).toBe(201);
    const meta = res.json();

    expect(meta.originalName).toBe('note.txt');
    expect(meta.mime).toBe('text/plain');
    expect(meta.sizeBytes).toBe(10);
    expect(meta.commentId).toBeNull();
    expect(meta.downloadUrl).toBe(`/api/attachments/${meta.id}`);

    const row = testState.db!.select().from(attachments).where(eq(attachments.id, meta.id)).get()!;
    // 落盘名是 UUID + 白名单扩展名，不含原始路径
    expect(row.storageName).toMatch(/^[0-9a-f-]{36}\.txt$/);
    expect(existsSync(join(root, row.storageName))).toBe(true);
    // 稳定 URL 不泄露落盘路径
    expect(meta.downloadUrl).not.toContain(row.storageName);
  });

  it('下载：内容与上传一致', async () => {
    const meta = (await upload(app, Buffer.from('payload-123'), 'a.txt', 'text/plain')).json();
    const dl = await app.inject({ method: 'GET', url: `/api/attachments/${meta.id}` });
    expect(dl.statusCode).toBe(200);
    expect(dl.body).toBe('payload-123');
    expect(dl.headers['content-length']).toBe('11');
  });

  // AC4 的硬要求：重启后仍能下载同一文件
  it('重启 server（新 app 实例）后仍能下载同一文件', async () => {
    const meta = (await upload(app, Buffer.from('survives restart'), 'keep.txt', 'text/plain')).json();

    await app.close();
    vi.resetModules();
    const app2 = await buildServer();
    try {
      const dl = await app2.inject({ method: 'GET', url: `/api/attachments/${meta.id}` });
      expect(dl.statusCode).toBe(200);
      expect(dl.body).toBe('survives restart');
    } finally {
      await app2.close();
      app = await buildServer(); // 供 afterEach 关闭
    }
  });

  it('空 body 被拒', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/issues/${ISSUE_ID}/attachments`,
      payload: Buffer.alloc(0),
      headers: { 'content-type': 'application/octet-stream', 'x-filename': 'empty.bin' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('EMPTY');
  });

  it('issue 不存在 → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/issues/nope/attachments',
      payload: Buffer.from('x'),
      headers: { 'content-type': 'text/plain', 'x-filename': 'x.txt' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('恶意文件名不会写到根外，且展示名被清洗', async () => {
    const meta = (
      await upload(app, Buffer.from('x'), '../../escape.txt', 'text/plain')
    ).json();
    expect(meta.originalName).toBe('escape.txt');
    const row = testState.db!.select().from(attachments).where(eq(attachments.id, meta.id)).get()!;
    expect(row.storageName).not.toContain('..');
    expect(existsSync(join(root, row.storageName))).toBe(true);
  });

  // S5：预览安全
  it('图片默认 inline 预览，且带 nosniff 与收紧 CSP', async () => {
    const meta = (await upload(app, Buffer.from('fakepng'), 'p.png', 'image/png')).json();
    const dl = await app.inject({ method: 'GET', url: `/api/attachments/${meta.id}` });
    expect(dl.headers['content-type']).toBe('image/png');
    expect(dl.headers['content-disposition']).toContain('inline;');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(dl.headers['content-security-policy']).toContain("default-src 'none'");
    expect(dl.headers['content-security-policy']).toContain('sandbox');
    expect(dl.headers['accept-ranges']).toBe('bytes');
  });

  it('HTML 上传不会被 inline 执行，强制下载且不回显原 MIME', async () => {
    const meta = (
      await upload(app, Buffer.from('<script>alert(1)</script>'), 'x.html', 'text/html')
    ).json();
    const dl = await app.inject({
      method: 'GET',
      url: `/api/attachments/${meta.id}?disposition=inline`,
    });
    expect(dl.headers['content-type']).toBe('application/octet-stream');
    expect(dl.headers['content-disposition']).toContain('attachment;');
  });

  it('zip 等非预览类型走下载', async () => {
    const meta = (await upload(app, Buffer.from('PK'), 'a.zip', 'application/zip')).json();
    const dl = await app.inject({ method: 'GET', url: `/api/attachments/${meta.id}` });
    expect(dl.headers['content-disposition']).toContain('attachment;');
  });

  it('X-Filename 用百分号编码传中文名，落库不乱码', async () => {
    const res = await upload(
      app,
      Buffer.from('x'),
      encodeURIComponent('报告.txt'),
      'text/plain',
    );
    expect(res.statusCode).toBe(201);
    expect(res.json().originalName).toBe('报告.txt');
  });

  it('中文文件名有 RFC 5987 编码', async () => {
    const meta = (
      await upload(app, Buffer.from('x'), encodeURIComponent('设计稿.png'), 'image/png')
    ).json();
    const dl = await app.inject({ method: 'GET', url: `/api/attachments/${meta.id}` });
    expect(dl.headers['content-disposition']).toContain(
      `filename*=UTF-8''${encodeURIComponent('设计稿.png')}`,
    );
  });

  // S5：Range
  it('Range 请求返回 206 + Content-Range', async () => {
    const meta = (
      await upload(app, Buffer.from('0123456789'), 'r.txt', 'text/plain')
    ).json();
    const dl = await app.inject({
      method: 'GET',
      url: `/api/attachments/${meta.id}`,
      headers: { range: 'bytes=2-5' },
    });
    expect(dl.statusCode).toBe(206);
    expect(dl.headers['content-range']).toBe('bytes 2-5/10');
    expect(dl.headers['content-length']).toBe('4');
    expect(dl.body).toBe('2345');
  });

  it('非法区间返回 416 + Content-Range: bytes */size', async () => {
    const meta = (await upload(app, Buffer.from('0123456789'), 'r.txt', 'text/plain')).json();
    const dl = await app.inject({
      method: 'GET',
      url: `/api/attachments/${meta.id}`,
      headers: { range: 'bytes=500-600' },
    });
    expect(dl.statusCode).toBe(416);
    expect(dl.headers['content-range']).toBe('bytes */10');
  });

  it('无法解析的 Range 容错为 200 全量', async () => {
    const meta = (await upload(app, Buffer.from('0123456789'), 'r.txt', 'text/plain')).json();
    const dl = await app.inject({
      method: 'GET',
      url: `/api/attachments/${meta.id}`,
      headers: { range: 'items=0-2' },
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.body).toBe('0123456789');
  });

  it('下载不存在的附件 → 404', async () => {
    const dl = await app.inject({ method: 'GET', url: '/api/attachments/ghost' });
    expect(dl.statusCode).toBe(404);
  });

  it('DB 里 storage_name 被污染成穿越路径 → 拒绝读取', async () => {
    const meta = (await upload(app, Buffer.from('x'), 'a.txt', 'text/plain')).json();
    testState.db!
      .update(attachments)
      .set({ storageName: '../../etc/passwd' })
      .where(eq(attachments.id, meta.id))
      .run();

    const dl = await app.inject({ method: 'GET', url: `/api/attachments/${meta.id}` });
    expect(dl.statusCode).toBe(400);
    expect(dl.json().code).toBe('TRAVERSAL');
  });

  it('删除：行与字节一起清', async () => {
    const meta = (await upload(app, Buffer.from('x'), 'a.txt', 'text/plain')).json();
    const row = testState.db!.select().from(attachments).where(eq(attachments.id, meta.id)).get()!;

    const del = await app.inject({ method: 'DELETE', url: `/api/attachments/${meta.id}` });
    expect(del.statusCode).toBe(200);
    expect(existsSync(join(root, row.storageName))).toBe(false);
    expect(
      testState.db!.select().from(attachments).where(eq(attachments.id, meta.id)).get(),
    ).toBeUndefined();
  });

  it('删除不存在 → 404', async () => {
    const del = await app.inject({ method: 'DELETE', url: '/api/attachments/ghost' });
    expect(del.statusCode).toBe(404);
  });

  it('列出某 issue 的附件', async () => {
    await upload(app, Buffer.from('a'), 'a.txt', 'text/plain');
    await upload(app, Buffer.from('b'), 'b.txt', 'text/plain');
    const list = await app.inject({ method: 'GET', url: `/api/issues/${ISSUE_ID}/attachments` });
    expect(list.statusCode).toBe(200);
    expect((list.json() as unknown[]).length).toBe(2);
  });

  // 孤儿 GC
  it('GC 清理超过 TTL 且未绑定评论的孤儿附件', async () => {
    const meta = (await upload(app, Buffer.from('orphan'), 'o.txt', 'text/plain')).json();
    const row = testState.db!.select().from(attachments).where(eq(attachments.id, meta.id)).get()!;

    // 把创建时间挪到 TTL 之前
    testState.db!
      .update(attachments)
      .set({ createdAt: Date.now() - 48 * 60 * 60 * 1000 })
      .where(eq(attachments.id, meta.id))
      .run();

    const gc = await app.inject({ method: 'POST', url: '/api/attachments/gc', payload: {} });
    expect(gc.statusCode).toBe(200);
    expect(gc.json().removed).toBe(1);
    expect(existsSync(join(root, row.storageName))).toBe(false);
  });

  it('GC 不动新上传的孤儿，也不动已绑定评论的附件', async () => {
    const fresh = (await upload(app, Buffer.from('fresh'), 'f.txt', 'text/plain')).json();
    const bound = (await upload(app, Buffer.from('bound'), 'b.txt', 'text/plain')).json();

    testState.db!
      .update(attachments)
      .set({ commentId: 'some-comment', createdAt: Date.now() - 48 * 60 * 60 * 1000 })
      .where(eq(attachments.id, bound.id))
      .run();

    const gc = await app.inject({ method: 'POST', url: '/api/attachments/gc', payload: {} });
    expect(gc.json().removed).toBe(0);
    expect(
      testState.db!.select().from(attachments).where(eq(attachments.id, fresh.id)).get(),
    ).toBeTruthy();
    expect(
      testState.db!.select().from(attachments).where(eq(attachments.id, bound.id)).get(),
    ).toBeTruthy();
  });
});
