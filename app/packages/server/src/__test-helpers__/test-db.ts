import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';

/**
 * 仅 migrator 建库（Slice 41 单轨）。
 * 新列必须落在 drizzle/*.sql；禁止在此再 ADD COLUMN 兼容。
 */
export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
  migrate(db, { migrationsFolder });

  return {
    sqlite,
    db,
    cleanup: () => {
      sqlite.close();
    },
  };
}
