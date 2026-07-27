import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
  applySqlitePragmas,
  readSqlitePragmas,
  resolveSqliteBusyTimeoutMs,
  walCheckpoint,
  getSqliteHardeningInfo,
} from './sqlite-pragmas.js';

describe('sqlite harden (Slice 57)', () => {
  const dbs: Database.Database[] = [];

  afterEach(() => {
    while (dbs.length) {
      const d = dbs.pop();
      try {
        d?.close();
      } catch {
        /* ignore */
      }
    }
  });

  function openMem(): Database.Database {
    const db = new Database(':memory:');
    dbs.push(db);
    return db;
  }

  it('resolveSqliteBusyTimeoutMs defaults to 5000', () => {
    expect(resolveSqliteBusyTimeoutMs({})).toBe(DEFAULT_SQLITE_BUSY_TIMEOUT_MS);
    expect(DEFAULT_SQLITE_BUSY_TIMEOUT_MS).toBe(5000);
  });

  it('resolveSqliteBusyTimeoutMs reads MA_SQLITE_BUSY_TIMEOUT_MS', () => {
    expect(resolveSqliteBusyTimeoutMs({ MA_SQLITE_BUSY_TIMEOUT_MS: '2500' })).toBe(
      2500,
    );
    expect(resolveSqliteBusyTimeoutMs({ MA_SQLITE_BUSY_TIMEOUT_MS: '0' })).toBe(0);
  });

  it('resolveSqliteBusyTimeoutMs falls back on invalid env', () => {
    expect(resolveSqliteBusyTimeoutMs({ MA_SQLITE_BUSY_TIMEOUT_MS: 'nope' })).toBe(
      DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
    );
    expect(resolveSqliteBusyTimeoutMs({ MA_SQLITE_BUSY_TIMEOUT_MS: '-1' })).toBe(
      DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
    );
  });

  it('applySqlitePragmas sets busy_timeout and keeps WAL + FK', () => {
    const db = openMem();
    const applied = applySqlitePragmas(db, { busyTimeoutMs: 4321 });
    expect(applied.busyTimeoutMs).toBe(4321);

    const read = readSqlitePragmas(db);
    expect(read.busyTimeoutMs).toBe(4321);
    // :memory: may report memory/off for journal; WAL when supported
    expect(typeof read.journalMode).toBe('string');
    expect(read.journalMode.length).toBeGreaterThan(0);
    expect(read.foreignKeys).toBe(1);
  });

  it('PRAGMA busy_timeout round-trips default 5000', () => {
    const db = openMem();
    applySqlitePragmas(db);
    const read = Number(db.pragma('busy_timeout', { simple: true }));
    expect(read).toBe(DEFAULT_SQLITE_BUSY_TIMEOUT_MS);
  });

  it('getSqliteHardeningInfo exposes path + pragmas', () => {
    const db = openMem();
    applySqlitePragmas(db, { busyTimeoutMs: 1111 });
    const info = getSqliteHardeningInfo(db, ':memory:');
    expect(info).toEqual({
      path: ':memory:',
      busyTimeoutMs: 1111,
      journalMode: expect.any(String),
      foreignKeys: true,
    });
  });

  it('walCheckpoint PASSIVE does not throw on memory db', () => {
    const db = openMem();
    applySqlitePragmas(db);
    expect(() => walCheckpoint(db, 'PASSIVE')).not.toThrow();
  });
});
