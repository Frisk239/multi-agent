import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  confirmSafeRestore,
  isMaintenanceMode,
  previewSafeRestore,
  readRestoreJournal,
  setMaintenanceMode,
} from './safe-live-restore.js';

describe('safe live restore fail-closed contract', () => {
  const roots: string[] = [];
  const previousBackupDir = process.env.MA_BACKUP_DIR;

  afterEach(() => {
    setMaintenanceMode(false);
    if (previousBackupDir == null) delete process.env.MA_BACKUP_DIR;
    else process.env.MA_BACKUP_DIR = previousBackupDir;
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function staged() {
    const root = join(tmpdir(), `ma-safe-restore-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    roots.push(root);
    process.env.MA_BACKUP_DIR = root;
    const stageId = crypto.randomUUID();
    const path = join(root, '.ma-restore-staging', stageId);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'stage.json'), JSON.stringify({
      stageId,
      snapshotName: 'verified.ma-backup.zip',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      database: { integrity: 'ok' },
    }));
    return { root, stageId };
  }

  it('requires a verified stage and persists preview journal', () => {
    const { root, stageId } = staged();
    const preview = previewSafeRestore(stageId);
    expect(preview.status).toBe('staged');
    expect(preview.liveApplyEnabled).toBe(false);
    expect(preview.confirmationPhrase).toBe('恢复此快照');
    expect(existsSync(join(root, 'restore-journal', `${preview.journalId}.json`))).toBe(true);
    expect(readRestoreJournal(preview.journalId)?.confirmationToken).toBe(preview.confirmationToken);
  });

  it('rejects mismatched confirmation and refuses disabled apply without side effects', async () => {
    const { stageId } = staged();
    const preview = previewSafeRestore(stageId);
    await expect(confirmSafeRestore({
      journalId: preview.journalId,
      confirmationToken: 'wrong',
      confirmationPhrase: preview.confirmationPhrase,
    })).rejects.toThrow(/confirmation/);
    let rollbackCalls = 0;
    await expect(confirmSafeRestore({
      journalId: preview.journalId,
      confirmationToken: preview.confirmationToken,
      confirmationPhrase: preview.confirmationPhrase,
    }, {
      createRollbackSnapshot: async () => {
        rollbackCalls += 1;
        return { success: true, name: 'rollback.ma-backup.zip' };
      },
    })).rejects.toThrow(/live restore disabled/i);
    expect(rollbackCalls).toBe(0);
    expect(readRestoreJournal(preview.journalId)?.status).toBe('staged');
    expect(isMaintenanceMode()).toBe(false);
  });

  it('blocks ordinary writes while maintenance is active and keeps reads available', async () => {
    const { buildApp } = await import('./app.js');
    const app = await buildApp();
    setMaintenanceMode(true);
    try {
      const write = await app.inject({
        method: 'POST',
        url: '/api/issues',
        payload: {},
      });
      expect(write.statusCode).toBe(503);
      expect(write.json()).toMatchObject({ code: 'MAINTENANCE_MODE' });

      const read = await app.inject({ method: 'GET', url: '/healthz' });
      expect(read.statusCode).not.toBe(503);
    } finally {
      setMaintenanceMode(false);
      await app.close();
    }
  });
});
