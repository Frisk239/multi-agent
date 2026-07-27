/**
 * Slice 58：Ops DB backup / list
 *
 * 默认目录：`MA_BACKUP_DIR`（绝对或相对 cwd）→ 否则 `process.cwd()/.ma-backups`
 * 仅备份主 SQLite 文件（better-sqlite3 `.backup()`），不做 wiki 整包、不做 restore UI。
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  accessSync,
  constants,
} from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { getSqliteHardeningInfo, sqlite } from './db/client.js';

export const DEFAULT_BACKUP_DIRNAME = '.ma-backups';

export type OpsBackupEntry = {
  name: string;
  path: string;
  size: number;
  mtime: string;
};

export type OpsBackupCreateResult =
  | {
      success: true;
      path: string;
      name: string;
      sizeBytes: number;
      createdAt: string;
      dir: string;
    }
  | {
      success: false;
      error: string;
      code:
        | 'BACKUP_DIR_NOT_WRITABLE'
        | 'BACKUP_FAILED'
        | 'BACKUP_FORBIDDEN_PATH';
      status: 400 | 500 | 503;
    };

export type OpsBackupListResult =
  | {
      success: true;
      dir: string;
      backups: OpsBackupEntry[];
    }
  | {
      success: false;
      error: string;
      code: 'BACKUP_DIR_NOT_READABLE' | 'BACKUP_LIST_FAILED';
      status: 500 | 503;
    };

export function resolveBackupDir(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const raw = env.MA_BACKUP_DIR?.trim();
  if (raw) {
    return isAbsolute(raw) ? resolve(raw) : resolve(cwd, raw);
  }
  return resolve(cwd, DEFAULT_BACKUP_DIRNAME);
}

/** 文件名安全时间戳：2026-07-27T05-26-30-583Z → 20260727T052630Z */
export function backupTimestamp(d = new Date()): string {
  const iso = d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

export function buildBackupFileName(d = new Date()): string {
  return `ma-backup-${backupTimestamp(d)}.db`;
}

function samePath(a: string, b: string): boolean {
  const ra = resolve(a);
  const rb = resolve(b);
  if (process.platform === 'win32') {
    return ra.toLowerCase() === rb.toLowerCase();
  }
  return ra === rb;
}

/** 禁止把备份写到主库路径或其目录外的危险目标（覆盖主库） */
export function isForbiddenBackupTarget(
  targetPath: string,
  liveDbPath: string,
): boolean {
  if (samePath(targetPath, liveDbPath)) return true;
  // 禁止写到主库的 -wal / -shm 旁路名
  if (samePath(targetPath, `${liveDbPath}-wal`)) return true;
  if (samePath(targetPath, `${liveDbPath}-shm`)) return true;
  if (samePath(targetPath, `${liveDbPath}-journal`)) return true;
  return false;
}

export function ensureBackupDirWritable(dir: string): {
  ok: true;
} | {
  ok: false;
  error: string;
} {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      error: `无法创建备份目录: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  try {
    accessSync(dir, constants.W_OK | constants.R_OK);
  } catch (e) {
    return {
      ok: false,
      error: `备份目录不可写: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  try {
    const st = statSync(dir);
    if (!st.isDirectory()) {
      return { ok: false, error: `备份路径不是目录: ${dir}` };
    }
  } catch (e) {
    return {
      ok: false,
      error: `无法访问备份目录: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  return { ok: true };
}

export type CreateDbBackupOpts = {
  database?: Database.Database;
  liveDbPath?: string;
  backupDir?: string;
  now?: Date;
  /** 测试注入：自定义 backup 实现 */
  backupFn?: (filename: string) => Promise<unknown>;
};

export async function createDbBackup(
  opts: CreateDbBackupOpts = {},
): Promise<OpsBackupCreateResult> {
  const database = opts.database ?? sqlite;
  const liveDbPath =
    opts.liveDbPath ??
    (() => {
      try {
        return getSqliteHardeningInfo(database).path;
      } catch {
        return process.env.DB_PATH ?? './dev.db';
      }
    })();
  const dir = opts.backupDir ?? resolveBackupDir();
  const now = opts.now ?? new Date();
  const name = buildBackupFileName(now);
  const targetPath = resolve(dir, name);

  if (isForbiddenBackupTarget(targetPath, liveDbPath)) {
    return {
      success: false,
      error: `禁止覆盖主库路径: ${targetPath}`,
      code: 'BACKUP_FORBIDDEN_PATH',
      status: 400,
    };
  }

  const writable = ensureBackupDirWritable(dir);
  if (!writable.ok) {
    return {
      success: false,
      error: writable.error,
      code: 'BACKUP_DIR_NOT_WRITABLE',
      status: 503,
    };
  }

  try {
    const backupFn =
      opts.backupFn ??
      ((filename: string) => database.backup(filename));
    await backupFn(targetPath);

    if (!existsSync(targetPath)) {
      return {
        success: false,
        error: 'backup 完成但目标文件不存在',
        code: 'BACKUP_FAILED',
        status: 500,
      };
    }
    const st = statSync(targetPath);
    if (st.size <= 0) {
      return {
        success: false,
        error: 'backup 文件大小为 0',
        code: 'BACKUP_FAILED',
        status: 500,
      };
    }

    return {
      success: true,
      path: targetPath,
      name,
      sizeBytes: st.size,
      createdAt: now.toISOString(),
      dir,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'BACKUP_FAILED',
      status: 500,
    };
  }
}

export type ListDbBackupsOpts = {
  backupDir?: string;
};

export function listDbBackups(
  opts: ListDbBackupsOpts = {},
): OpsBackupListResult {
  const dir = opts.backupDir ?? resolveBackupDir();

  if (!existsSync(dir)) {
    // 空列表：目录尚未创建不算失败
    return { success: true, dir, backups: [] };
  }

  try {
    accessSync(dir, constants.R_OK);
  } catch (e) {
    return {
      success: false,
      error: `备份目录不可读: ${e instanceof Error ? e.message : String(e)}`,
      code: 'BACKUP_DIR_NOT_READABLE',
      status: 503,
    };
  }

  try {
    const st = statSync(dir);
    if (!st.isDirectory()) {
      return {
        success: false,
        error: `备份路径不是目录: ${dir}`,
        code: 'BACKUP_LIST_FAILED',
        status: 500,
      };
    }

    const entries = readdirSync(dir)
      .filter((n) => n.endsWith('.db') && !n.endsWith('-wal') && !n.endsWith('-shm'))
      .map((name) => {
        const path = resolve(dir, name);
        try {
          const s = statSync(path);
          if (!s.isFile()) return null;
          return {
            name,
            path,
            size: s.size,
            mtime: s.mtime.toISOString(),
          } satisfies OpsBackupEntry;
        } catch {
          return null;
        }
      })
      .filter((x): x is OpsBackupEntry => x != null)
      .sort((a, b) => (a.mtime < b.mtime ? 1 : a.mtime > b.mtime ? -1 : 0));

    return { success: true, dir, backups: entries };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'BACKUP_LIST_FAILED',
      status: 500,
    };
  }
}
