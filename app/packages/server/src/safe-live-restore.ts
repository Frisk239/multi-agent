import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { db } from './db/client.js';
import { agentRuns } from './db/schema.js';
import { inArray } from 'drizzle-orm';
import { createSnapshot, extractSnapshotDatabase } from './ops-recovery.js';
import {
  migrateDatabaseFile,
  swapDatabaseUnderMaintenance,
} from './orchestration/db-lifecycle.js';

export type RestoreJournalStatus =
  | 'staged'
  | 'confirmed'
  | 'applying'
  | 'applied'
  | 'rolled_back'
  | 'failed';

export type RestoreJournal = {
  journalId: string;
  stageId: string;
  snapshotName: string;
  status: RestoreJournalStatus;
  createdAt: string;
  updatedAt: string;
  confirmationToken: string;
  confirmationPhrase: string;
  activeRunIds: string[];
  rollbackSnapshotName: string | null;
  liveApplyEnabled: boolean;
  error: string | null;
};

const CONFIRMATION_PHRASE = '恢复此快照';
let maintenance = false;

export function isMaintenanceMode(): boolean {
  return maintenance;
}

export function setMaintenanceMode(value: boolean): void {
  maintenance = value;
}

function backupDir(): string {
  return resolve(process.env.MA_BACKUP_DIR ?? '.ma-backups');
}

function journalDir(): string {
  const p = join(backupDir(), 'restore-journal');
  mkdirSync(p, { recursive: true });
  return p;
}

function journalPath(id: string): string {
  return join(journalDir(), `${id}.json`);
}

function writeJournal(row: RestoreJournal): RestoreJournal {
  writeFileSync(journalPath(row.journalId), `${JSON.stringify(row, null, 2)}\n`, 'utf8');
  return row;
}

export function readRestoreJournal(id: string): RestoreJournal | null {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const p = journalPath(id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as RestoreJournal;
}

export function previewSafeRestore(stageId: string): RestoreJournal {
  if (!/^[0-9a-f-]{36}$/i.test(stageId)) throw new Error('invalid stage id');
  const stagePath = join(backupDir(), '.ma-restore-staging', stageId, 'stage.json');
  if (!existsSync(stagePath)) throw new Error('staged snapshot not found or expired');
  const stage = JSON.parse(readFileSync(stagePath, 'utf8')) as {
    stageId: string;
    snapshotName: string;
    expiresAt: string;
    database: { integrity: string };
  };
  if (stage.stageId !== stageId || stage.database.integrity !== 'ok') {
    throw new Error('staged snapshot is not verified');
  }
  if (Date.parse(stage.expiresAt) <= Date.now()) throw new Error('staged snapshot expired');
  const activeRunIds = db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(inArray(agentRuns.status, ['queued', 'waiting_local_directory', 'running']))
    .all()
    .map((r) => r.id);
  const now = new Date().toISOString();
  return writeJournal({
    journalId: randomUUID(),
    stageId,
    snapshotName: stage.snapshotName,
    status: 'staged',
    createdAt: now,
    updatedAt: now,
    confirmationToken: randomBytes(24).toString('hex'),
    confirmationPhrase: CONFIRMATION_PHRASE,
    activeRunIds,
    rollbackSnapshotName: null,
    // D5（reopenable-db-lifecycle）：db/client 已支持热替换（export let + swapDatabase，
    // live binding 全消费方跟随）；worker stop/start 与在途 run 终态化已编排。
    liveApplyEnabled: true,
    error: null,
  });
}

export async function confirmSafeRestore(input: {
  journalId: string;
  confirmationToken: string;
  confirmationPhrase: string;
}, opts: {
  createRollbackSnapshot?: () => Promise<{ success: boolean; name?: string; error?: string }>;
} = {}): Promise<RestoreJournal> {
  const row = readRestoreJournal(input.journalId);
  if (!row) throw new Error('restore journal not found');
  if (row.status !== 'staged') throw new Error('restore journal is not awaiting confirmation');
  if (
    input.confirmationToken !== row.confirmationToken ||
    input.confirmationPhrase !== row.confirmationPhrase
  ) {
    throw new Error('restore confirmation does not match preview');
  }
  if (!row.liveApplyEnabled) {
    throw new Error(
      'live restore disabled: SQLite/Drizzle is an immutable process singleton; restart-safe reopen seam is required',
    );
  }
  row.status = 'confirmed';
  row.updatedAt = new Date().toISOString();
  writeJournal(row);

  const rollback = await (opts.createRollbackSnapshot ?? (async () => {
    const result = await createSnapshot();
    return result.success
      ? { success: true, name: result.name }
      : { success: false, error: result.error };
  }))();
  if (!rollback.success || !rollback.name) {
    row.status = 'failed';
    row.error = `pre-restore rollback snapshot failed: ${rollback.error ?? 'unknown error'}`;
    row.updatedAt = new Date().toISOString();
    return writeJournal(row);
  }
  row.rollbackSnapshotName = rollback.name;
  row.updatedAt = new Date().toISOString();
  writeJournal(row);

  // D5：live apply —— maintenance 写阻断 → 解压 snapshot DB → migrate → 原子换入。
  // swapDatabaseUnderMaintenance 内部完成：abort 在途子进程 + 终态化 active run（D4）+
  // 停 worker（D2）+ swapDatabase（D1，live binding 全消费方切换）+ 重启 worker。
  // 失败不回滚当前库（rollback snapshot 已生成，人可再走一次 restore），journal 记 failed。
  setMaintenanceMode(true);
  try {
    row.status = 'applying';
    row.updatedAt = new Date().toISOString();
    writeJournal(row);

    const snapshotPath = resolve(backupDir(), row.snapshotName);
    const stagingDir = join(backupDir(), '.ma-restore-staging', row.stageId);
    mkdirSync(stagingDir, { recursive: true });
    const liveDb = join(stagingDir, 'live.db');

    const ex = extractSnapshotDatabase(snapshotPath, liveDb);
    if (!ex.ok) {
      row.status = 'failed';
      row.error = `extract snapshot database failed: ${ex.error}`;
      row.updatedAt = new Date().toISOString();
      return writeJournal(row);
    }
    const mig = migrateDatabaseFile(liveDb);
    if (!mig.ok) {
      row.status = 'failed';
      row.error = `migrate snapshot database failed: ${mig.error}`;
      row.updatedAt = new Date().toISOString();
      return writeJournal(row);
    }
    const swap = swapDatabaseUnderMaintenance(liveDb);
    if (!swap.ok) {
      row.status = 'failed';
      row.error = `db swap failed: ${swap.error ?? 'unknown'}`;
      row.updatedAt = new Date().toISOString();
      return writeJournal(row);
    }
    row.status = 'applied';
    row.updatedAt = new Date().toISOString();
    return writeJournal(row);
  } finally {
    setMaintenanceMode(false);
  }
}
