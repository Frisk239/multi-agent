/**
 * Migrate/ops · Tolerate duplicate-column / already-applied statements so
 * drifted local dev.db can recover without hand-built DBs.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';

export type SafeMigrateResult = {
  applied: string[];
  skipped: Array<{ file: string; reason: string }>;
  errors: Array<{ file: string; error: string }>;
};

const IGNORABLE =
  /duplicate column name|already exists|duplicate column/i;

/**
 * Apply each .sql file statement-by-statement; ignore duplicate-column errors.
 * Does not replace drizzle journal when fully healthy — use for repair path.
 */
export function safeMigrateSqlFolder(
  sqlite: Database.Database,
  migrationsFolder: string,
): SafeMigrateResult {
  const applied: string[] = [];
  const skipped: Array<{ file: string; reason: string }> = [];
  const errors: Array<{ file: string; error: string }> = [];

  if (!existsSync(migrationsFolder)) {
    errors.push({ file: migrationsFolder, error: 'migrations folder missing' });
    return { applied, skipped, errors };
  }

  const files = readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const full = join(migrationsFolder, file);
    let sql = '';
    try {
      sql = readFileSync(full, 'utf8');
    } catch (e) {
      errors.push({ file, error: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const statements = sql
      .split('--> statement-breakpoint')
      .flatMap((chunk) => chunk.split(';'))
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    let fileApplied = false;
    for (const stmt of statements) {
      try {
        sqlite.exec(stmt);
        fileApplied = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (IGNORABLE.test(msg)) {
          skipped.push({ file, reason: msg });
          continue;
        }
        errors.push({ file, error: msg });
      }
    }
    if (fileApplied) applied.push(file);
  }

  return { applied, skipped, errors };
}

/** True when remaining errors are empty (skipped duplicates are ok). */
export function isSafeMigrateClean(result: SafeMigrateResult): boolean {
  return result.errors.length === 0;
}
