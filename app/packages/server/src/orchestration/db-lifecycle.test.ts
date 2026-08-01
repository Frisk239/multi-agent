/**
 * D2+D4 · db-lifecycle 编排测试（reopenable-db-lifecycle）
 * 真实 DB + mock worker：在途 run 终态化、swap 后消费方切新库、worker stop/start 被调用。
 * 初始 DB_PATH 指向临时文件（动态 import 控制模块加载）。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

const workerMocks = vi.hoisted(() => ({
  startRunWorker: vi.fn(),
  stopRunWorker: vi.fn(),
  startAutomationWorker: vi.fn(),
  stopAutomationWorker: vi.fn(),
}));

vi.mock('./run-worker.js', () => ({
  startRunWorker: workerMocks.startRunWorker,
  stopRunWorker: workerMocks.stopRunWorker,
}));
vi.mock('./automation-worker.js', () => ({
  startAutomationWorker: workerMocks.startAutomationWorker,
  stopAutomationWorker: workerMocks.stopAutomationWorker,
}));

let tmpDir: string;
let lifecycle: typeof import('./db-lifecycle.js');

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ma-lifecycle-'));
  process.env.DB_PATH = join(tmpDir, 'init.db');
  client = await import('../db/client.js'); // 首次加载在 DB_PATH 设置后
  lifecycle = await import('./db-lifecycle.js'); // 模块首次加载读到临时 DB_PATH
  migrateDb(join(tmpDir, 'init.db')); // 初始库迁移（模块连接与迁移连接同一文件）
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 锁由 OS 回收 */
  }
});

function dbPath(name: string): string {
  return join(tmpDir, name);
}

function migrateDb(path: string): void {
  const conn = new Database(path);
  try {
    drizzleMigrate(drizzle(conn, { schema }), { migrationsFolder });
  } finally {
    conn.close();
  }
}

// 经 db/client（真实）插入——全动态获取，避免静态 import 在 DB_PATH 设置前加载 client
let client: typeof import('../db/client.js');

/** agent_run 有 FK：先保证 workspaces/users/agents/issues 基础行存在（幂等） */
function ensureBaseRows(): void {
  const db = client.db;
  const now = Date.now();
  if (!db.select().from(schema.workspaces).where(eq(schema.workspaces.id, 'ws-local')).get()) {
    db.insert(schema.workspaces).values({ id: 'ws-local', name: 'Test WS', description: '', createdAt: now }).run();
  }
  if (!db.select().from(schema.users).where(eq(schema.users.id, 'user-1')).get()) {
    db.insert(schema.users).values({ id: 'user-1', name: 'Test User', email: 't@e.com', createdAt: now }).run();
  }
  if (!db.select().from(schema.agents).where(eq(schema.agents.id, 'agt-none')).get()) {
    db.insert(schema.agents).values({ id: 'agt-none', name: 'Test Agent', runtime: 'opencode', createdAt: now }).run();
  }
  if (!db.select().from(schema.issues).where(eq(schema.issues.id, 'iss-none')).get()) {
    db.insert(schema.issues)
      .values({
        id: 'iss-none',
        workspaceId: 'ws-local',
        identifier: 'NONE',
        title: '基础 issue',
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
}

function insertRun(id: string, status: string, now: number): void {
  ensureBaseRows();
  client.db.insert(schema.agentRuns)
    .values({
      id,
      issueId: 'iss-none',
      agentId: 'agt-none',
      runtime: 'opencode',
      status: status as never,
      kind: 'issue',
      createdAt: now,
    })
    .run();
}

describe('D2+D4 db-lifecycle', () => {
  it('terminalizeActiveRuns 终态化在途 run 并 abort 子进程句柄', () => {
    const now = Date.now();
    insertRun('run-q1', 'queued', now);
    insertRun('run-r1', 'running', now);
    const n = lifecycle.terminalizeActiveRuns();
    expect(n).toBe(2);
    const rows = client.db
      .select({ id: schema.agentRuns.id, status: schema.agentRuns.status, error: schema.agentRuns.error })
      .from(schema.agentRuns)
      .where(inArray(schema.agentRuns.id, ['run-q1', 'run-r1']))
      .all();
    for (const r of rows) {
      expect(r.status).toBe('failed');
      expect(r.error).toContain('DB 换入');
    }
  });

  it('swapDatabaseUnderMaintenance 停 worker → 换库 → 起 worker', () => {
    migrateDb(dbPath('m1.db'));
    migrateDb(dbPath('m2.db'));
    lifecycle.swapDatabaseUnderMaintenance(dbPath('m1.db'));
    ensureBaseRows();
    client.db.insert(schema.issues)
      .values({
        id: 'iss-m1',
        workspaceId: 'ws-local',
        identifier: 'M1',
        title: 'maintenance swap 前库',
        status: 'todo',
        priority: 'none',
        creatorType: 'member',
        creatorId: 'u1',
        position: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const out = lifecycle.swapDatabaseUnderMaintenance(dbPath('m2.db'));
    expect(out.ok).toBe(true);
    expect(out.closed).toBe(true);
    // 消费方自动切到 m2：m1 的 issue 不可见
    expect(
      client.db.select().from(schema.issues).where(eq(schema.issues.id, 'iss-m1')).get(),
    ).toBeUndefined();
    // worker stop/start 被编排调用
    expect(workerMocks.stopRunWorker).toHaveBeenCalled();
    expect(workerMocks.startRunWorker).toHaveBeenCalled();
    expect(workerMocks.stopAutomationWorker).toHaveBeenCalled();
    expect(workerMocks.startAutomationWorker).toHaveBeenCalled();
  });

  it('swap 失败时 closed=false 且 worker 恢复', () => {
    // 目录路径无法作为 DB 打开（better-sqlite3 对不存在文件会创建，目录才会抛错）
    const badPath = mkdtempSync(join(tmpdir(), 'bad-db-dir-'));
    const out = lifecycle.swapDatabaseUnderMaintenance(badPath);
    expect(out.ok).toBe(false);
    expect(out.closed).toBe(false);
    expect(workerMocks.startRunWorker).toHaveBeenCalled(); // finally 恢复
  });
});
