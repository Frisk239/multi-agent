import type Database from 'better-sqlite3';

/** Slice 57：锁等待默认 5s；可用 MA_SQLITE_BUSY_TIMEOUT_MS 覆盖 */
export const DEFAULT_SQLITE_BUSY_TIMEOUT_MS = 5_000;

export type SqliteWalCheckpointMode = 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE';

export type SqliteHardeningInfo = {
  path: string;
  busyTimeoutMs: number;
  journalMode: string;
  foreignKeys: boolean;
};

export function resolveSqliteBusyTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.MA_SQLITE_BUSY_TIMEOUT_MS;
  if (raw == null || String(raw).trim() === '') {
    return DEFAULT_SQLITE_BUSY_TIMEOUT_MS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return DEFAULT_SQLITE_BUSY_TIMEOUT_MS;
  }
  return Math.floor(n);
}

/**
 * 打开 DB 后统一硬化：WAL + FK + busy_timeout。
 * 测试/迁移可用同一入口，避免 pragma 漂移。
 */
export function applySqlitePragmas(
  database: Database.Database,
  opts?: { busyTimeoutMs?: number },
): { busyTimeoutMs: number; journalMode: string } {
  const busyTimeoutMs = opts?.busyTimeoutMs ?? resolveSqliteBusyTimeoutMs();
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma(`busy_timeout = ${busyTimeoutMs}`);
  const journalMode = String(database.pragma('journal_mode', { simple: true }));
  return { busyTimeoutMs, journalMode };
}

export function readSqlitePragmas(database: Database.Database): {
  busyTimeoutMs: number;
  journalMode: string;
  foreignKeys: number;
} {
  return {
    busyTimeoutMs: Number(database.pragma('busy_timeout', { simple: true })),
    journalMode: String(database.pragma('journal_mode', { simple: true })),
    foreignKeys: Number(database.pragma('foreign_keys', { simple: true })),
  };
}

/** 关停路径可选：checkpoint WAL（默认 PASSIVE，不阻塞读者） */
export function walCheckpoint(
  database: Database.Database,
  mode: SqliteWalCheckpointMode = 'PASSIVE',
): unknown {
  return database.pragma(`wal_checkpoint(${mode})`);
}

export function getSqliteHardeningInfo(
  database: Database.Database,
  path: string,
): SqliteHardeningInfo {
  const p = readSqlitePragmas(database);
  return {
    path,
    busyTimeoutMs: p.busyTimeoutMs,
    journalMode: p.journalMode,
    foreignKeys: p.foreignKeys === 1,
  };
}
