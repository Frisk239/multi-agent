/**
 * Migrate/ops · Tolerate duplicate-column / already-applied statements so
 * drifted local dev.db can recover without hand-built DBs.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';

export type SafeMigrateResult = {
  applied: string[];
  skipped: Array<{ file: string; reason: string }>;
  errors: Array<{ file: string; error: string }>;
};

const IGNORABLE =
  /duplicate column name|already exists|already another table or index/i;

/**
 * Split a drizzle .sql file into executable statements.
 *
 * Two hazards this handles (both caused real dev.db corruption on 2026-07-31):
 *  1. `--` line comments may themselves contain `;` (e.g. 0023_runtime_grok.sql
 *     "…rebuild not required;"). Splitting on `;` first turns comment prose into
 *     bogus statements like `existing rows stay valid` → syntax error. So strip
 *     comments BEFORE splitting.
 *  2. drizzle's own delimiter is `--> statement-breakpoint`; honour it first so
 *     multi-statement table rebuilds stay in order.
 */
export function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split(/\r?\n/)
    // keep drizzle's breakpoint marker, drop every other comment line
    .filter((line) => {
      const t = line.trim();
      return t.startsWith('--> statement-breakpoint') || !t.startsWith('--');
    })
    .join('\n');

  return withoutComments
    .split('--> statement-breakpoint')
    .flatMap((chunk) => chunk.split(';'))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** sha256 of raw file content — matches drizzle's readMigrationFiles hashing. */
function sqlFileHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Hashes already recorded in drizzle's journal table, if that table exists. */
function appliedHashes(sqlite: Database.Database): Set<string> {
  try {
    const rows = sqlite
      .prepare('SELECT hash FROM __drizzle_migrations')
      .all() as Array<{ hash: string }>;
    return new Set(rows.map((r) => r.hash));
  } catch {
    // fresh DB / no journal table yet → nothing applied
    return new Set();
  }
}

/**
 * Apply each .sql file statement-by-statement; ignore duplicate-column errors.
 * Does not replace drizzle journal when fully healthy — use for repair path.
 *
 * `skipAppliedByHash` (default true) skips files whose hash is already in the
 * journal. This matters because several migrations are SQLite table *rebuilds*
 * (`CREATE TABLE __new_x` → `INSERT … SELECT` → `DROP` → `RENAME`). Replaying
 * those against a populated DB raises UNIQUE/FK failures and can strand an
 * orphan `__new_*` table, leaving the DB worse than before.
 */
export function safeMigrateSqlFolder(
  sqlite: Database.Database,
  migrationsFolder: string,
  opts: { skipAppliedByHash?: boolean } = {},
): SafeMigrateResult {
  const skipApplied = opts.skipAppliedByHash ?? true;
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

  const journalHashes = skipApplied ? appliedHashes(sqlite) : new Set<string>();

  for (const file of files) {
    const full = join(migrationsFolder, file);
    let sql = '';
    try {
      sql = readFileSync(full, 'utf8');
    } catch (e) {
      errors.push({ file, error: e instanceof Error ? e.message : String(e) });
      continue;
    }

    if (journalHashes.has(sqlFileHash(sql))) {
      skipped.push({ file, reason: 'already in drizzle journal (hash match)' });
      continue;
    }

    const statements = splitSqlStatements(sql);

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

/**
 * Record every migration file's current hash in drizzle's journal so a later
 * `migrate()` is a no-op.
 *
 * Why this is needed: editing an already-applied .sql file changes its hash, so
 * drizzle stops recognising it and replays the ALTER — which then fails with
 * "duplicate column". On 2026-07-31 dev.db had three such files (0021 / 0035 /
 * 0036), which wedged every subsequent migration. Stamping reconciles the
 * journal with what is physically in the DB.
 *
 * created_at must be the migration's `when` from meta/_journal.json, because
 * drizzle's migrator compares `folderMillis > max(created_at)` to decide what to
 * run.
 */
export function stampMigrationJournal(
  sqlite: Database.Database,
  migrationsFolder: string,
): { stamped: string[]; alreadyPresent: number } {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at numeric
     )`,
  );

  const metaPath = join(migrationsFolder, 'meta', '_journal.json');
  const whenByTag = new Map<string, number>();
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as {
      entries?: Array<{ tag: string; when: number }>;
    };
    for (const e of meta.entries ?? []) whenByTag.set(e.tag, e.when);
  }

  const present = appliedHashes(sqlite);
  const insert = sqlite.prepare(
    'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
  );

  const stamped: string[] = [];
  let alreadyPresent = 0;

  const files = readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const hash = sqlFileHash(readFileSync(join(migrationsFolder, file), 'utf8'));
    if (present.has(hash)) {
      alreadyPresent++;
      continue;
    }
    const tag = file.replace(/\.sql$/, '');
    // fall back to file order when meta/_journal.json is missing the tag
    const when = whenByTag.get(tag) ?? Date.now();
    insert.run(hash, when);
    present.add(hash);
    stamped.push(file);
  }

  return { stamped, alreadyPresent };
}
