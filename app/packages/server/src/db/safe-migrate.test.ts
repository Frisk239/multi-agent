import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isSafeMigrateClean,
  safeMigrateSqlFolder,
  splitSqlStatements,
  stampMigrationJournal,
} from './safe-migrate.js';

describe('splitSqlStatements', () => {
  // Regression: 0023_runtime_grok.sql has `;` INSIDE a `--` comment. Splitting on
  // `;` before stripping comments turned prose into bogus SQL ("existing rows
  // stay valid") and the repair path reported syntax errors.
  it('ignores semicolons inside line comments', () => {
    const sql = [
      '-- Grok runtime id (SQLite CHECK rebuild not required;',
      '-- drizzle enum is documentation; existing rows stay valid; new value ok).',
      'SELECT 1;',
    ].join('\n');
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1']);
  });

  it('honours drizzle statement-breakpoint ordering', () => {
    const sql = [
      'CREATE TABLE a (id text);',
      '--> statement-breakpoint',
      'CREATE TABLE b (id text);',
    ].join('\n');
    expect(splitSqlStatements(sql)).toEqual([
      'CREATE TABLE a (id text)',
      'CREATE TABLE b (id text)',
    ]);
  });

  it('drops comment-only files without emitting statements', () => {
    expect(splitSqlStatements('-- nothing to do here\n-- really nothing\n')).toEqual([]);
  });
});

describe('safeMigrateSqlFolder', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ma-safe-mig-'));
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies create table then ignores duplicate column', () => {
    writeFileSync(
      join(dir, '0001_init.sql'),
      'CREATE TABLE t (id text primary key);\nALTER TABLE t ADD COLUMN a integer;',
    );
    writeFileSync(
      join(dir, '0002_dup.sql'),
      'ALTER TABLE t ADD COLUMN a integer;',
    );
    const r1 = safeMigrateSqlFolder(db, dir);
    expect(isSafeMigrateClean(r1)).toBe(true);
    expect(r1.skipped.some((s) => /duplicate/i.test(s.reason))).toBe(true);
    const cols = db.prepare('pragma table_info(t)').all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name).sort()).toEqual(['a', 'id']);
  });

  // Regression: replaying an already-applied SQLite table *rebuild* against a
  // populated DB raised UNIQUE/FK failures and stranded an orphan `__new_*`
  // table, leaving dev.db worse than before (observed 2026-07-31).
  it('skips files already recorded in the drizzle journal', () => {
    const rebuild = [
      'CREATE TABLE __new_t (id text primary key);',
      '--> statement-breakpoint',
      'INSERT INTO __new_t (id) SELECT id FROM t;',
      '--> statement-breakpoint',
      'DROP TABLE t;',
      '--> statement-breakpoint',
      'ALTER TABLE __new_t RENAME TO t;',
    ].join('\n');
    writeFileSync(join(dir, '0001_init.sql'), 'CREATE TABLE t (id text primary key);');
    writeFileSync(join(dir, '0002_rebuild.sql'), rebuild);

    // first pass applies both, then we stamp the journal
    expect(isSafeMigrateClean(safeMigrateSqlFolder(db, dir))).toBe(true);
    db.prepare("INSERT INTO t (id) VALUES ('keep-me')").run();
    stampMigrationJournal(db, dir);

    // second pass must be a no-op, not a destructive replay
    const r2 = safeMigrateSqlFolder(db, dir);
    expect(isSafeMigrateClean(r2)).toBe(true);
    expect(r2.applied).toEqual([]);
    expect(r2.skipped.every((s) => /already in drizzle journal/.test(s.reason))).toBe(true);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '__new%'")
      .all();
    expect(tables).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS c FROM t').get()).toEqual({ c: 1 });
  });

  it('stamping is idempotent and makes hashes recognisable', () => {
    writeFileSync(join(dir, '0001_init.sql'), 'CREATE TABLE t (id text primary key);');
    safeMigrateSqlFolder(db, dir);

    const first = stampMigrationJournal(db, dir);
    expect(first.stamped).toEqual(['0001_init.sql']);

    const second = stampMigrationJournal(db, dir);
    expect(second.stamped).toEqual([]);
    expect(second.alreadyPresent).toBe(1);
  });
});
