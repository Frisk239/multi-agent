import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, sqlite } from './client.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  isSafeMigrateClean,
  safeMigrateSqlFolder,
  stampMigrationJournal,
} from './safe-migrate.js';

// drizzle-kit generate 产出 ./drizzle/*.sql，此脚本执行它们
// 注意：用 fileURLToPath 而非 .pathname，避免 Windows 上 pathname 产生前导 '/' (/D:/...) 导致路径无效
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
if (!existsSync(migrationsFolder)) {
  console.error(`迁移目录不存在: ${migrationsFolder}，请先跑 pnpm --filter @ma/server db:generate`);
  process.exit(1);
}

try {
  migrate(db, { migrationsFolder });
  console.log('✓ 迁移完成');
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  // Drifted local dev.db: journal vs actual columns (duplicate column etc.)
  if (/duplicate column|Failed to run the query/i.test(msg)) {
    console.warn('[migrate] drizzle migrate failed; trying safeMigrateSqlFolder repair…');
    console.warn(msg.slice(0, 400));
    const repair = safeMigrateSqlFolder(sqlite, migrationsFolder);
    if (!isSafeMigrateClean(repair)) {
      console.error('[migrate] safe repair still has errors:', repair.errors);
      console.error(
        'Recovery: set DB_PATH to a fresh file, re-run db:migrate && db:seed, or delete drifted dev.db after backup.',
      );
      sqlite.close();
      process.exit(1);
    }
    console.log(
      `✓ safe migrate repair ok (applied≈${repair.applied.length}, skipped-dup=${repair.skipped.length})`,
    );
    // Reconcile the journal with what is now physically in the DB, otherwise the
    // next `migrate()` replays the same edited files and fails identically.
    const stamp = stampMigrationJournal(sqlite, migrationsFolder);
    console.log(
      `✓ journal stamped (new=${stamp.stamped.length}, already-present=${stamp.alreadyPresent})`,
    );
  } else {
    sqlite.close();
    throw e;
  }
}
sqlite.close();
