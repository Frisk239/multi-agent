import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import { applySqlitePragmas } from '../db/sqlite-pragmas.js';
import * as schema from '../db/schema.js';

/**
 * 仅 migrator 建库（Slice 41 单轨）。
 * 新列必须落在 drizzle/*.sql；禁止在此再 ADD COLUMN 兼容。
 */
export function createTestDb() {
  const sqlite = new Database(':memory:');
  // Slice 57：与生产 client 同一硬化入口（WAL / FK / busy_timeout）
  applySqlitePragmas(sqlite);

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
