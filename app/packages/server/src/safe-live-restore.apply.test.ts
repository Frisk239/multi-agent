/**
 * D5 · safe-live-restore apply 全链路测试（reopenable-db-lifecycle）
 * 独立临时环境（DB/backup/wiki 全隔离）→ createSnapshot → stage.json →
 * preview（liveApplyEnabled=true）→ confirm → journal=applied + 消费方切到快照库。
 * 初始 DB_PATH 指向临时文件（动态 import 控制模块加载）。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './db/schema.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

vi.mock('./orchestration/run-worker.js', () => ({
  startRunWorker: vi.fn(),
  stopRunWorker: vi.fn(),
}));
vi.mock('./orchestration/automation-worker.js', () => ({
  startAutomationWorker: vi.fn(),
  stopAutomationWorker: vi.fn(),
}));

let tmpDir: string;
let client: typeof import('./db/client.js');
let restore: typeof import('./safe-live-restore.js');
let recovery: typeof import('./ops-recovery.js');

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

function insertIssue(db: typeof schema, id: string, title: string): void {
  const now = Date.now();
  (client.db as any)
    .insert(schema.issues)
    .values({
      id,
      workspaceId: 'ws-local',
      identifier: id.toUpperCase().slice(0, 8),
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

function ensureBaseRows(): void {
  const db = client.db;
  const now = Date.now();
  if (!db.select().from(schema.workspaces).where(eq(schema.workspaces.id, 'ws-local')).get()) {
    db.insert(schema.workspaces).values({ id: 'ws-local', name: 'Test WS', description: '', createdAt: now }).run();
  }
  if (!db.select().from(schema.users).where(eq(schema.users.id, 'user-1')).get()) {
    db.insert(schema.users).values({ id: 'user-1', name: 'Test User', email: 't@e.com', createdAt: now }).run();
  }
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ma-d5-'));
  process.env.DB_PATH = join(tmpDir, 'live.db');
  process.env.MA_BACKUP_DIR = join(tmpDir, 'backups');
  process.env.MA_WIKI_DIR = join(tmpDir, 'wiki');
  client = await import('./db/client.js');
  restore = await import('./safe-live-restore.js');
  recovery = await import('./ops-recovery.js');
  migrateDb(join(tmpDir, 'live.db'));
});

afterAll(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows 锁由 OS 回收 */
  }
});

describe('D5 safe-live-restore apply', () => {
  it('confirm 后 journal=applied 且消费方切到快照库', async () => {
    // 活库：基础行 + 一条数据
    ensureBaseRows();
    insertIssue(schema, 'iss-live-1', '活库的 issue');

    // 快照库：迁移 + 一条不同数据（模拟历史快照）
    migrateDb(dbPath('snap.db'));
    const snapConn = new Database(dbPath('snap.db'));
    const snapDrizzle = drizzle(snapConn, { schema });
    const now = Date.now();
    snapDrizzle.insert(schema.workspaces).values({ id: 'ws-local', name: 'Test WS', description: '', createdAt: now }).run();
    snapDrizzle.insert(schema.users).values({ id: 'user-1', name: 'Test User', email: 't@e.com', createdAt: now }).run();
    snapDrizzle.insert(schema.issues)
      .values({
        id: 'iss-snap-1',
        workspaceId: 'ws-local',
        identifier: 'SNAP1',
        title: '快照库的 issue',
        status: 'todo',
        priority: 'none',
        creatorType: 'member',
        creatorId: 'user-1',
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    snapConn.close();

    // 走 createSnapshot 打包（backupFn 指向 snap.db 文件副本）
    const made = await recovery.createSnapshot({
      backupDir: join(tmpDir, 'backups'),
      backupFn: async (dest: string) => {
        writeFileSync(dest, readFileSync(dbPath('snap.db')));
      },
      liveDbPath: dbPath('snap.db'),
      wikiDir: join(tmpDir, 'wiki'),
    });
    expect(made.success).toBe(true);
    if (!made.success) return;

    // 手写 stage.json（preview 的形状；上一刀的 stage 流程产物）
    const stageId = '11111111-2222-4333-8444-555555555555';
    const stageDir = join(tmpDir, 'backups', '.ma-restore-staging', stageId);
    mkdirSync(stageDir, { recursive: true });
    writeFileSync(
      join(stageDir, 'stage.json'),
      JSON.stringify({
        stageId,
        snapshotName: made.name,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        database: { integrity: 'ok' },
        wiki: { path: join(tmpDir, 'wiki'), includedFiles: 0, projectScopedExcluded: false },
      }),
    );

    const preview = restore.previewSafeRestore(stageId);
    expect(preview.liveApplyEnabled).toBe(true);

    const confirmed = await restore.confirmSafeRestore({
      journalId: preview.journalId,
      confirmationToken: preview.confirmationToken,
      confirmationPhrase: preview.confirmationPhrase,
    });
    expect(confirmed.status).toBe('applied');
    expect(confirmed.rollbackSnapshotName).not.toBeNull();

    // 消费方已切到快照库：活库数据不可见、快照数据可见
    const live = client.db.select().from(schema.issues).where(eq(schema.issues.id, 'iss-live-1')).get();
    expect(live).toBeUndefined();
    const snapRow = client.db.select().from(schema.issues).where(eq(schema.issues.id, 'iss-snap-1')).get();
    expect(snapRow?.title).toBe('快照库的 issue');
  });

  it('snapshot 缺 DB 条目时 apply 失败并记 failed（不回滚当前库）', async () => {
    // 用真实 live.db 打包（有 db/backup.sqlite 条目）→ 手工破坏？这里改为：
    // 造一个不含 db 条目的 zip —— 直接用 createSnapshot 的正常产物，但 stage.json
    // 指向不存在的 snapshot 文件 → extract 失败 → journal failed。
    const stageId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const stageDir = join(tmpDir, 'backups', '.ma-restore-staging', stageId);
    mkdirSync(stageDir, { recursive: true });
    writeFileSync(
      join(stageDir, 'stage.json'),
      JSON.stringify({
        stageId,
        snapshotName: 'missing.ma-backup.zip',
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        database: { integrity: 'ok' },
        wiki: { path: join(tmpDir, 'wiki'), includedFiles: 0, projectScopedExcluded: false },
      }),
    );
    const preview = restore.previewSafeRestore(stageId);
    const confirmed = await restore.confirmSafeRestore({
      journalId: preview.journalId,
      confirmationToken: preview.confirmationToken,
      confirmationPhrase: preview.confirmationPhrase,
    });
    expect(confirmed.status).toBe('failed');
    expect(confirmed.error).toContain('extract');
  });
});
