import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';

/** 与 client.ts 启动兼容 ALTER 对齐，让 migrate-only 内存库可按当前 schema 插入 */
function applyCompatAlters(sqlite: Database.Database): void {
  const ensureCol = (table: string, col: string, ddl: string) => {
    const info = sqlite.pragma(`table_info(${table})`) as Array<{ name: string }>;
    if (info.length === 0) return;
    if (!info.some((c) => c.name === col)) {
      sqlite.exec(ddl);
    }
  };

  ensureCol('agent', 'allowed_paths', 'ALTER TABLE agent ADD COLUMN allowed_paths TEXT;');
  ensureCol('agent_run', 'parent_run_id', 'ALTER TABLE agent_run ADD COLUMN parent_run_id TEXT;');
  ensureCol('issue', 'custom_fields', 'ALTER TABLE issue ADD COLUMN custom_fields TEXT;');
  ensureCol(
    'automation_rule',
    'cron_expression',
    'ALTER TABLE automation_rule ADD COLUMN cron_expression TEXT;',
  );
  ensureCol('memory_item', 'valid_at', 'ALTER TABLE memory_item ADD COLUMN valid_at INTEGER;');
  ensureCol('memory_item', 'invalid_at', 'ALTER TABLE memory_item ADD COLUMN invalid_at INTEGER;');
  // 0035 已在 journal；旧库兼容仍保留
  ensureCol(
    'wiki_ingest_job',
    'next_attempt_at',
    'ALTER TABLE wiki_ingest_job ADD COLUMN next_attempt_at INTEGER;',
  );
}

export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
  migrate(db, { migrationsFolder });
  applyCompatAlters(sqlite);

  return {
    sqlite,
    db,
    cleanup: () => {
      sqlite.close();
    },
  };
}
