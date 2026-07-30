import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createSnapshot,
  dryRunRestore,
  listSnapshots,
  validateSnapshot,
  validateSnapshotByName,
} from './ops-recovery.js';

describe('snapshot v1 disaster recovery', () => {
  const roots: string[] = [];
  const dbs: Database.Database[] = [];
  function root() {
    const p = join(tmpdir(), `ma-snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(p, { recursive: true }); roots.push(p); return p;
  }
  afterEach(() => {
    while (dbs.length) dbs.pop()?.close();
    for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
  });

  it('creates deterministic manifest with DB and global Wiki files', async () => {
    const r = root(); const dbPath = join(r, 'live.db'); const backupDir = join(r, 'backups'); const wikiDir = join(r, 'wiki');
    mkdirSync(wikiDir); writeFileSync(join(wikiDir, 'index.md'), '# Index\n'); writeFileSync(join(wikiDir, 'page.md'), '# Page\n');
    writeFileSync(join(wikiDir, '.env'), 'secret');
    const db = new Database(dbPath); dbs.push(db); db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO t(value) VALUES (\'ok\')');
    const opts = { database: db, liveDbPath: dbPath, backupDir, wikiDir, now: new Date('2026-07-30T00:00:00.000Z'), workspace: { path: r, source: 'db' as const, configured: true, exists: true } };
    const a = await createSnapshot(opts); const b = await createSnapshot(opts);
    expect(a.success && b.success).toBe(true); if (!a.success || !b.success) return;
    expect(readFileSync(a.path).equals(readFileSync(b.path))).toBe(true);
    expect(a.manifest.archiveVersion).toBe(1); expect(a.manifest.files.map((f) => f.path)).toContain('db/backup.sqlite');
    expect(a.manifest.files.map((f) => f.path)).toContain('wiki/page.md');
    expect(a.manifest.files.map((f) => f.path)).not.toContain('wiki/.env');
    const listed = listSnapshots({ backupDir }); expect(listed.success).toBe(true); if (listed.success) expect(listed.snapshots[0]?.valid).toBe(true);
  });

  it('rejects tampered data, malformed archive, and traversal manifest paths', async () => {
    const r = root(); const dbPath = join(r, 'live.db'); const backupDir = join(r, 'backups'); const wikiDir = join(r, 'wiki'); mkdirSync(wikiDir); writeFileSync(join(wikiDir, 'page.md'), 'page');
    const db = new Database(dbPath); dbs.push(db); db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (1)');
    const made = await createSnapshot({ database: db, liveDbPath: dbPath, backupDir, wikiDir, now: new Date('2026-07-30T00:00:00Z') }); expect(made.success).toBe(true); if (!made.success) return;
    const original = readFileSync(made.path); const tamperAt = original.indexOf(Buffer.from('page')); expect(tamperAt).toBeGreaterThan(0);
    const tampered = Buffer.from(original); tampered[tamperAt] = tampered[tamperAt]! ^ 0xff; writeFileSync(made.path, tampered);
    expect(validateSnapshot(made.path).valid).toBe(false);
    writeFileSync(made.path, Buffer.from('not a zip')); expect(validateSnapshot(made.path).errors.join(' ')).toMatch(/ZIP|malformed/i);
    expect(validateSnapshotByName('../outside.ma-backup.zip', { backupDir }).errors.join(' ')).toMatch(/traversal/i);
  });

  it('dry-run returns a report and does not mutate live files', async () => {
    const r = root(); const dbPath = join(r, 'live.db'); const backupDir = join(r, 'backups'); const wikiDir = join(r, 'wiki'); mkdirSync(wikiDir); writeFileSync(join(wikiDir, 'page.md'), 'before');
    const db = new Database(dbPath); dbs.push(db); db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY); INSERT INTO t VALUES (1)');
    const made = await createSnapshot({ database: db, liveDbPath: dbPath, backupDir, wikiDir, now: new Date('2026-07-30T00:00:00Z') }); expect(made.success).toBe(true); if (!made.success) return;
    const beforeDb = readFileSync(dbPath); const beforeWiki = readFileSync(join(wikiDir, 'page.md'));
    const report = dryRunRestore(made.name, { backupDir });
    expect(report.dryRun).toBe(true); expect(report.mutatesLiveState).toBe(false); expect(report.valid).toBe(true); expect(report.report.wouldOverwrite).toEqual([]);
    expect(readFileSync(dbPath).equals(beforeDb)).toBe(true); expect(readFileSync(join(wikiDir, 'page.md')).equals(beforeWiki)).toBe(true); expect(existsSync(made.path)).toBe(true);
  });
});
