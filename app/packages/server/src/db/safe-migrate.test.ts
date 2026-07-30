import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isSafeMigrateClean, safeMigrateSqlFolder } from './safe-migrate.js';

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
});
