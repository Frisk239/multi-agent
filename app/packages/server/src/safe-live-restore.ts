import { randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { db } from './db/client.js';
import { agentRuns } from './db/schema.js';
import { inArray } from 'drizzle-orm';
import { createSnapshot, extractSnapshotDatabase } from './ops-recovery.js';
import {
  migrateDatabaseFile,
  swapDatabaseUnderMaintenance,
} from './orchestration/db-lifecycle.js';
import { getWikiDir } from './wiki/store.js';

export type RestoreJournalStatus =
  | 'staged'
  | 'confirmed'
  | 'applying'
  | 'applied'
  | 'rolled_back'
  | 'failed';

/** G5-3：恢复时 Wiki 目录换入的 journal 记录 */
export type RestoreJournalWiki = {
  status: 'pending' | 'swapped' | 'skipped' | 'failed';
  /** 换入前 live wiki 根（preview 时刻） */
  liveRoot: string | null;
  /** staging 内的 wiki 根 */
  stagedRoot: string | null;
  includedFiles: number;
  /** swap 成功后旧 wiki 目录的保留位置（审计/回滚用；null=未移动或已清理） */
  movedOldTo: string | null;
  error: string | null;
};

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
  wiki: RestoreJournalWiki;
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
  const parsed = JSON.parse(readFileSync(p, 'utf8')) as Partial<RestoreJournal>;
  // 兼容旧 journal（G5-3 前无 wiki 字段）
  if (!parsed.wiki) {
    parsed.wiki = {
      status: 'pending',
      liveRoot: null,
      stagedRoot: null,
      includedFiles: 0,
      movedOldTo: null,
      error: null,
    };
  }
  return parsed as RestoreJournal;
}

/** G5-3：恢复执行时的 Wiki 目录换入结果 */
export type WikiSwapOutcome = {
  status: 'swapped' | 'skipped' | 'failed';
  liveRoot: string;
  stagedRoot: string;
  movedOldTo: string | null;
  error: string | null;
};

/**
 * G5-3：把 staging 解压的 wiki 目录原子换入 live wiki 根。
 * 旧目录先 rename 到同级备份（同盘保证 rename 原子性），新目录 rename 进；
 * 失败时把旧目录放回。swap 成功保留旧备份（journal.movedOldTo 供审计/手动清理）。
 */
export function swapWikiUnderMaintenance(
  stageId: string,
  opts: { backupDir?: string; liveWikiRoot?: string } = {},
): WikiSwapOutcome {
  const stagingDir = join(
    resolve(opts.backupDir ?? process.env.MA_BACKUP_DIR ?? '.ma-backups'),
    '.ma-restore-staging',
    stageId,
  );
  const stagedRoot = join(stagingDir, 'wiki');
  const liveRoot = resolve(opts.liveWikiRoot ?? getWikiDir());
  // 快照 wiki 为空（includedFiles=0）：无可换入
  if (!existsSync(stagedRoot)) {
    return { status: 'skipped', liveRoot, stagedRoot, movedOldTo: null, error: null };
  }
  const movedOldTo = join(dirname(liveRoot), `.wiki.restore-bak.${stageId}`);
  try {
    if (existsSync(liveRoot)) {
      renameSync(liveRoot, movedOldTo);
    }
    try {
      renameSync(stagedRoot, liveRoot);
    } catch (e) {
      // 换入失败：放回旧 wiki，保持现场
      if (existsSync(movedOldTo)) {
        try {
          renameSync(movedOldTo, liveRoot);
        } catch {
          /* 放回失败时旧目录仍在 movedOldTo，journal 会记录 */
        }
      }
      throw e;
    }
    return { status: 'swapped', liveRoot, stagedRoot, movedOldTo, error: null };
  } catch (e) {
    return {
      status: 'failed',
      liveRoot,
      stagedRoot,
      movedOldTo: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
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
    wiki?: {
      path?: unknown;
      includedFiles?: unknown;
      projectScopedExcluded?: unknown;
      pages?: unknown;
      projectPages?: unknown;
    };
  };
  if (stage.stageId !== stageId || stage.database.integrity !== 'ok') {
    throw new Error('staged snapshot is not verified');
  }
  // G5-3：stage 校验扩展 —— wiki 元数据必须完整（path/includedFiles），
  // includedFiles > 0 时 staging wiki 目录必须实际存在（roots 可恢复）。
  const wikiMeta = stage.wiki;
  const wikiIncludedFiles =
    typeof wikiMeta?.includedFiles === 'number' && wikiMeta.includedFiles >= 0
      ? wikiMeta.includedFiles
      : null;
  if (typeof wikiMeta?.path !== 'string' || wikiIncludedFiles == null) {
    throw new Error(
      'staged snapshot has incomplete Wiki metadata (re-stage to include Wiki roots)',
    );
  }
  if (wikiIncludedFiles > 0 && !existsSync(wikiMeta.path)) {
    throw new Error(`staged Wiki directory missing: ${wikiMeta.path}`);
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
    wiki: {
      status: 'pending',
      liveRoot: getWikiDir(),
      stagedRoot: wikiMeta.path,
      includedFiles: wikiIncludedFiles,
      movedOldTo: null,
      error: null,
    },
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
    // G5-3：DB 换入成功后执行 Wiki 目录换入（同 maintenance 窗口内）。
    // swap 失败 → journal failed（DB 已换、wiki 未换，error 说明现场）。
    const wikiSwap = swapWikiUnderMaintenance(row.stageId);
    row.wiki = {
      status: wikiSwap.status,
      liveRoot: wikiSwap.liveRoot,
      stagedRoot: wikiSwap.stagedRoot,
      includedFiles: row.wiki.includedFiles,
      movedOldTo: wikiSwap.movedOldTo,
      error: wikiSwap.error,
    };
    if (wikiSwap.status === 'failed') {
      row.status = 'failed';
      row.error = `wiki swap failed: ${wikiSwap.error ?? 'unknown'}（DB 已换入；旧 wiki 保留在 ${wikiSwap.movedOldTo ?? '原位'}）`;
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
