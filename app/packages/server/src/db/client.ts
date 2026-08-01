import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import {
  applySqlitePragmas,
  getSqliteHardeningInfo as getHardeningFromDb,
  resolveSqliteBusyTimeoutMs,
  type SqliteHardeningInfo,
} from './sqlite-pragmas.js';

export {
  DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
  applySqlitePragmas,
  readSqlitePragmas,
  resolveSqliteBusyTimeoutMs,
  walCheckpoint,
  type SqliteHardeningInfo,
  type SqliteWalCheckpointMode,
} from './sqlite-pragmas.js';

const DB_PATH = process.env.DB_PATH ?? './dev.db';

export const SQLITE_BUSY_TIMEOUT_MS = resolveSqliteBusyTimeoutMs();

function openDatabase(path: string): Database.Database {
  const s = new Database(path);
  applySqlitePragmas(s, { busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS });
  return s;
}

function createDrizzle(connection: Database.Database) {
  return drizzle(connection, { schema });
}

// D1（reopenable-db-lifecycle）：export let + swapDatabase —— ESM live binding 让全部
// `import { db }` 消费方在换库后自动跟随新实例（验证：src/__test-helpers__/livebind.test.ts）。
// better-sqlite3 同步模型：无跨语句并发，swap 只发生在事件循环间隙，安全。
export let sqlite: Database.Database = openDatabase(DB_PATH);
export let db = createDrizzle(sqlite);

export function getSqliteHardeningInfo(
  database: Database.Database = sqlite,
  path: string = DB_PATH,
): SqliteHardeningInfo {
  return getHardeningFromDb(database, path);
}

/**
 * D1：原子换入新 DB 文件（安全 live restore 的解锁前置）。
 * 调用方必须处于 maintenance 模式（写已阻断）：本函数只保证连接替换本身——
 * 关旧连接、开新连接（pragmas）、重建 drizzle；label 函数是运行时查询，自动读新库。
 * 返回 closed 供调用方决定是否需要进程重启兜底。
 */
export function swapDatabase(newPath: string): { closed: boolean } {
  const next = openDatabase(newPath);
  const old = sqlite;
  sqlite = next;
  db = createDrizzle(next);
  try {
    old.close();
    return { closed: true };
  } catch {
    return { closed: false };
  }
}

// —— label map（spec §4.2 R2）：静态 seed 数据，启动时加载到内存，O(1) 查询 ——
// agent/squad 表的 id -> name 映射，用于 GET issues 时填充 assignee.label
export function resolveAssigneeLabel(
  type: 'member' | 'agent' | 'squad' | null,
  id: string | null,
): string | null {
  if (!type || !id) return null;
  if (type === 'member') {
    const u = db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
    return u?.name ?? '未知成员';
  }
  if (type === 'agent') {
    const a = db.query.agents.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
    return a?.name ?? '未知智能体';
  }
  // squad
  const s = db.query.squads.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
  return s?.name ?? '未知小队';
}

export function resolveAuthorLabel(
  type: 'member' | 'agent',
  id: string,
): string {
  if (type === 'member' && id === 'system') return '系统';
  if (type === 'member') {
    const u = db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
    return u?.name ?? id;
  }
  const a = db.query.agents.findFirst({ where: (t, { eq }) => eq(t.id, id) }).sync();
  return a?.name ?? id;
}

// Slice 41：schema 演进只走 drizzle migrator（见 drizzle/0036_schema_gap_columns.sql）。
// 旧库请 `pnpm --filter @ma/server db:migrate`，勿再在启动路径 inline ALTER。
