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
export const sqlite = new Database(DB_PATH);
applySqlitePragmas(sqlite, { busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS });

export function getSqliteHardeningInfo(
  database: Database.Database = sqlite,
  path: string = DB_PATH,
): SqliteHardeningInfo {
  return getHardeningFromDb(database, path);
}

export const db = drizzle(sqlite, { schema });

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
