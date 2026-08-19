import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  chmodSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildBackupFileName,
  createDbBackup,
  ensureBackupDirWritable,
  isForbiddenBackupTarget,
  listDbBackups,
  resolveBackupDir,
  DEFAULT_BACKUP_DIRNAME,
} from './ops-backup.js';

describe('ops backup (Slice 58)', () => {
  const roots: string[] = [];
  const dbs: Database.Database[] = [];

  function mkTmp(prefix: string): string {
    const dir = join(
      tmpdir(),
      `ma-backup-test-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(dir, { recursive: true });
    roots.push(dir);
    return dir;
  }

  function openDb(path: string): Database.Database {
    const db = new Database(path);
    db.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT);');
    db.prepare('INSERT INTO t (v) VALUES (?)').run('hello');
    dbs.push(db);
    return db;
  }

  afterEach(() => {
    while (dbs.length) {
      try {
        dbs.pop()?.close();
      } catch {
        /* ignore */
      }
    }
    for (const r of roots.splice(0)) {
      try {
        // best-effort restore write bit on win/posix
        try {
          chmodSync(r, 0o755);
        } catch {
          /* ignore */
        }
        rmSync(r, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it('resolveBackupDir prefers MA_BACKUP_DIR', () => {
    const cwd = mkTmp('cwd');
    const custom = join(cwd, 'custom-backups');
    expect(resolveBackupDir({ MA_BACKUP_DIR: custom }, cwd)).toBe(resolve(custom));
    expect(resolveBackupDir({}, cwd)).toBe(resolve(cwd, DEFAULT_BACKUP_DIRNAME));
    expect(resolveBackupDir({ MA_BACKUP_DIR: 'rel-b' }, cwd)).toBe(
      resolve(cwd, 'rel-b'),
    );
  });

  it('buildBackupFileName has timestamp and .db', () => {
    const n = buildBackupFileName(new Date('2026-07-27T05:26:30.583Z'));
    expect(n).toMatch(/^ma-backup-20260727T052630Z\.db$/);
  });

  it('isForbiddenBackupTarget blocks live db path', () => {
    const live = resolve('/tmp/live/dev.db');
    expect(isForbiddenBackupTarget(live, live)).toBe(true);
    expect(isForbiddenBackupTarget(`${live}-wal`, live)).toBe(true);
    expect(isForbiddenBackupTarget(resolve('/tmp/other/x.db'), live)).toBe(false);
  });

  it('createDbBackup roundtrip: file exists size>0 and list sees it', async () => {
    const root = mkTmp('round');
    const dbPath = join(root, 'src.db');
    const backupDir = join(root, '.ma-backups');
    const database = openDb(dbPath);

    const created = await createDbBackup({
      database,
      liveDbPath: dbPath,
      backupDir,
      now: new Date('2026-07-27T12:00:00.000Z'),
    });

    expect(created.success).toBe(true);
    if (!created.success) return;

    expect(existsSync(created.path)).toBe(true);
    expect(created.sizeBytes).toBeGreaterThan(0);
    expect(created.name).toBe('ma-backup-20260727T120000Z.db');
    expect(created.createdAt).toBe('2026-07-27T12:00:00.000Z');
    expect(statSync(created.path).size).toBe(created.sizeBytes);
    // This deliberately minimal foreign DB has no agent table, so a backup
    // must be honest that it could not perform the historical-secret scan.
    expect(created.secretSafety.status).toBe('scan_inconclusive');

    // open backup and verify data
    const bdb = new Database(created.path, { readonly: true });
    dbs.push(bdb);
    const row = bdb.prepare('SELECT v FROM t').get() as { v: string };
    expect(row.v).toBe('hello');

    const listed = listDbBackups({ backupDir });
    expect(listed.success).toBe(true);
    if (!listed.success) return;
    expect(listed.backups.length).toBe(1);
    expect(listed.backups[0]!.name).toBe(created.name);
    expect(listed.backups[0]!.size).toBe(created.sizeBytes);
    expect(listed.backups[0]!.path).toBe(created.path);
  });

  it('listDbBackups empty dir / missing dir → empty array', () => {
    const root = mkTmp('empty');
    const missing = join(root, 'nope');
    const empty = join(root, 'empty');
    mkdirSync(empty);

    const a = listDbBackups({ backupDir: missing });
    expect(a).toEqual({ success: true, dir: missing, backups: [] });

    const b = listDbBackups({ backupDir: empty });
    expect(b.success).toBe(true);
    if (b.success) expect(b.backups).toEqual([]);
  });

  it('rejects forbidden target (backup path == live db)', async () => {
    const root = mkTmp('forbid');
    const dbPath = join(root, 'src.db');
    const database = openDb(dbPath);

    // force target name to collide by using backupDir = parent and custom name via
    // inject backupDir that would write into live path: set backupDir to dirname and
    // use fixed now that we control name — still different filename, so instead pass
    // liveDbPath equal to the resolved target by placing live at the target path.
    const backupDir = join(root, 'b');
    mkdirSync(backupDir);
    const wouldBeName = buildBackupFileName(new Date('2026-01-01T00:00:00.000Z'));
    const liveAsTarget = join(backupDir, wouldBeName);
    writeFileSync(liveAsTarget, 'x');

    const res = await createDbBackup({
      database,
      liveDbPath: liveAsTarget,
      backupDir,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.code).toBe('BACKUP_FORBIDDEN_PATH');
  });

  it('unwritable backup dir → BACKUP_DIR_NOT_WRITABLE (posix)', async () => {
    if (process.platform === 'win32') {
      // Windows ACL chmod 不可靠；用 backupFn 抛错覆盖失败码
      const root = mkTmp('win-fail');
      const dbPath = join(root, 'src.db');
      const database = openDb(dbPath);
      const res = await createDbBackup({
        database,
        liveDbPath: dbPath,
        backupDir: join(root, 'b'),
        backupFn: async () => {
          throw new Error('simulated write fail');
        },
      });
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(res.code).toBe('BACKUP_FAILED');
      return;
    }

    const root = mkTmp('ro');
    const dbPath = join(root, 'src.db');
    const database = openDb(dbPath);
    const backupDir = join(root, 'locked');
    mkdirSync(backupDir);
    chmodSync(backupDir, 0o555);

    const res = await createDbBackup({
      database,
      liveDbPath: dbPath,
      backupDir,
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.code).toBe('BACKUP_DIR_NOT_WRITABLE');
  });

  it('backupFn failure → BACKUP_FAILED', async () => {
    const root = mkTmp('fail');
    const dbPath = join(root, 'src.db');
    const database = openDb(dbPath);
    const res = await createDbBackup({
      database,
      liveDbPath: dbPath,
      backupDir: join(root, 'b'),
      backupFn: async () => {
        throw new Error('disk full');
      },
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.code).toBe('BACKUP_FAILED');
    expect(res.error).toMatch(/disk full/);
  });

  it('backup returns an honest legacy-secret advisory without copying a literal into the response', async () => {
    const root = mkTmp('secret-advisory');
    const dbPath = join(root, 'src.db');
    const database = openDb(dbPath);
    database.exec('CREATE TABLE agent (id TEXT PRIMARY KEY, env_vars TEXT, mcp_servers TEXT);');
    database
      .prepare('INSERT INTO agent (id, env_vars, mcp_servers) VALUES (?, ?, ?)')
      .run('agent-1', JSON.stringify([{ key: 'API_TOKEN', value: 'backup-secret-never-return' }]), null);

    const result = await createDbBackup({
      database,
      liveDbPath: dbPath,
      backupDir: join(root, 'b'),
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.secretSafety.status).toBe('known_legacy_literals_detected');
    expect(result.secretSafety.remediation).toMatch(/历史备份/);
    expect(JSON.stringify(result.secretSafety)).not.toContain('backup-secret-never-return');
  });

  it('ensureBackupDirWritable creates nested dir', () => {
    const root = mkTmp('nest');
    const nested = join(root, 'a', 'b', 'c');
    const r = ensureBackupDirWritable(nested);
    expect(r.ok).toBe(true);
    expect(existsSync(nested)).toBe(true);
  });
});
