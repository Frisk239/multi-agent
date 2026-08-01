/**
 * D1 · swapDatabase 集成测试（reopenable-db-lifecycle）
 * 真实文件级：库 A 写入 → swap 到库 B → 消费方（import { db }）自动读到 B；
 * A 连接已关闭；A→B→A 连续 swap 幂等。
 * 初始 DB_PATH 指向临时文件（动态 import 控制模块加载时机），不碰 dev.db。
 * Windows 文件锁：用例间不删 DB 文件（afterAll 尽力清理，锁残留由 OS 回收）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

let tmpDir: string;
let client: typeof import('./client.js');

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ma-swap-'));
  process.env.DB_PATH = join(tmpDir, 'init.db');
  client = await import('./client.js'); // 模块首次加载读到临时 DB_PATH
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 锁残留由 OS 回收 */
  }
});

function dbPath(name: string): string {
  return join(tmpDir, name);
}

/** 独立连接跑 drizzle migrator（测试辅助；swap 后的连接由 swapDatabase 开） */
function migrateDb(path: string): void {
  const conn = new Database(path);
  try {
    drizzleMigrate(drizzle(conn, { schema }), { migrationsFolder });
  } finally {
    conn.close();
  }
}

/** issue 表有 FK：先保证基础行存在（幂等） */
function ensureBaseRows(): void {
  const now = Date.now();
  const ws = (client.db as any).select().from(schema.workspaces).where(eq(schema.workspaces.id, 'ws-local')).get();
  if (!ws) {
    (client.db as any).insert(schema.workspaces).values({ id: 'ws-local', name: 'Test WS', description: '', createdAt: now }).run();
  }
  const u = (client.db as any).select().from(schema.users).where(eq(schema.users.id, 'user-1')).get();
  if (!u) {
    (client.db as any).insert(schema.users).values({ id: 'user-1', name: 'Test User', email: 't@e.com', createdAt: now }).run();
  }
}

function insertIssue(id: string, identifier: string, title: string): void {
  ensureBaseRows();
  const now = Date.now();
  (client.db as any)
    .insert(schema.issues)
    .values({
      id,
      workspaceId: 'ws-local',
      identifier,
      title,
      status: 'todo',
      priority: 'none',
      creatorType: 'member',
      creatorId: 'user-1',
      position: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function findIssue(id: string) {
  return (client.db as any)
    .select()
    .from(schema.issues)
    .where(eq(schema.issues.id, id))
    .get();
}

describe('D1 swapDatabase', () => {
  it('swap 后消费方读到新库数据，旧库不可见', () => {
    migrateDb(dbPath('a.db'));
    client.swapDatabase(dbPath('a.db'));
    insertIssue('iss-a1', 'SWAP-A', '库 A 的 issue');
    expect(findIssue('iss-a1')?.title).toBe('库 A 的 issue');

    migrateDb(dbPath('b.db'));
    const r = client.swapDatabase(dbPath('b.db'));
    expect(r.closed).toBe(true);

    expect(findIssue('iss-a1')).toBeUndefined(); // 同一 import 绑定自动切到 B
    expect(existsSync(dbPath('a.db'))).toBe(true); // 文件保留（仅连接关闭）
  });

  it('swap 后新库可写可查（drizzle 重建完整）', () => {
    migrateDb(dbPath('c.db'));
    client.swapDatabase(dbPath('c.db'));
    insertIssue('iss-c1', 'SWAP-C', '库 C 的 issue');
    const row = findIssue('iss-c1');
    expect(row?.title).toBe('库 C 的 issue');
    expect(row?.identifier).toBe('SWAP-C');
  });

  it('连续 swap 幂等（A→B→A）', () => {
    migrateDb(dbPath('a2.db'));
    migrateDb(dbPath('b2.db'));
    client.swapDatabase(dbPath('a2.db'));
    insertIssue('iss-a1', 'SWAP-A', '库 A');
    client.swapDatabase(dbPath('b2.db'));
    expect(findIssue('iss-a1')).toBeUndefined();
    client.swapDatabase(dbPath('a2.db'));
    expect(findIssue('iss-a1')?.title).toBe('库 A');
  });
});
