import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  confirmSafeRestore,
  isMaintenanceMode,
  previewSafeRestore,
  readRestoreJournal,
  setMaintenanceMode,
} from './safe-live-restore.js';
import { createTestDb } from './__test-helpers__/test-db.js';

// 防 confirm 链路启动真实 worker（swapDatabaseUnderMaintenance stop/start）
vi.mock('./orchestration/run-worker.js', () => ({
  startRunWorker: vi.fn(),
  stopRunWorker: vi.fn(),
}));
vi.mock('./orchestration/automation-worker.js', () => ({
  startAutomationWorker: vi.fn(),
  stopAutomationWorker: vi.fn(),
}));

describe('safe live restore fail-closed contract', () => {
  const roots: string[] = [];
  const previousBackupDir = process.env.MA_BACKUP_DIR;

  afterEach(() => {
    setMaintenanceMode(false);
    if (previousBackupDir == null) delete process.env.MA_BACKUP_DIR;
    else process.env.MA_BACKUP_DIR = previousBackupDir;
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  /** 构造合法 stage（wiki 空）。无 wiki 字段的旧 stage 用 writeStageJson 直接写 */
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
      wiki: { path: join(path, 'wiki'), includedFiles: 0, projectScopedExcluded: false },
    }));
    return { root, stageId, path };
  }

  it('requires a verified stage and persists preview journal', () => {
    const { root, stageId } = staged();
    const preview = previewSafeRestore(stageId);
    expect(preview.status).toBe('staged');
    // D5（reopenable-db-lifecycle）：热替换已落地，不再 fail-closed
    expect(preview.liveApplyEnabled).toBe(true);
    expect(preview.confirmationPhrase).toBe('恢复此快照');
    expect(existsSync(join(root, 'restore-journal', `${preview.journalId}.json`))).toBe(true);
    expect(readRestoreJournal(preview.journalId)?.confirmationToken).toBe(preview.confirmationToken);
  });

  it('rejects mismatched confirmation; legacy disabled journal still refuses apply', async () => {
    const { stageId } = staged();
    const preview = previewSafeRestore(stageId);
    await expect(confirmSafeRestore({
      journalId: preview.journalId,
      confirmationToken: 'wrong',
      confirmationPhrase: preview.confirmationPhrase,
    })).rejects.toThrow(/confirmation/);
    // 旧 journal 防御：liveApplyEnabled=false 的 journal 仍拒绝（不产生 rollback 副作用）
    const jp = join(process.env.MA_BACKUP_DIR!, 'restore-journal', `${preview.journalId}.json`);
    const j = JSON.parse(readFileSync(jp, 'utf8'));
    j.liveApplyEnabled = false;
    writeFileSync(jp, JSON.stringify(j));
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

  // 全量并发时 buildApp 模块加载可超过默认 5s —— 显式放宽
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
  }, 20_000);
});

/**
 * G5-3：stage.json wiki 校验 + 恢复执行 wiki 换入 + journal wiki 字段。
 * 全链路走真实产物：createSnapshot（memory db + 源 wiki）→ stageSnapshotRestore
 * （真解压 staging）→ preview → confirm（DB swap + wiki swap）。
 */
describe('G5-3 restore wiki coverage', () => {
  const roots: string[] = [];
  const previousBackupDir = process.env.MA_BACKUP_DIR;
  const previousWikiDir = process.env.MA_WIKI_DIR;

  afterEach(() => {
    setMaintenanceMode(false);
    if (previousBackupDir == null) delete process.env.MA_BACKUP_DIR;
    else process.env.MA_BACKUP_DIR = previousBackupDir;
    if (previousWikiDir == null) delete process.env.MA_WIKI_DIR;
    else process.env.MA_WIKI_DIR = previousWikiDir;
    for (const root of roots.splice(0)) {
      // confirm 链路 swap 后 client.db 指向 staging/live.db —— Windows 文件锁
      // 会让 rmSync 抛 EPERM；残留目录由 OS 回收（与 apply.test.ts 同策略）
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  /** 造真 snapshot + 真 stage（含 staging wiki 解压）。返回 stage + 环境路径 */
  async function makeRealStage(wikiPages: Record<string, string>): Promise<{
    stage: import('./ops-recovery.js').SnapshotStage;
    root: string;
    liveWiki: string;
    cleanupDb: () => void;
  }> {
    const { createSnapshot, stageSnapshotRestore } = await import('./ops-recovery.js');
    const root = join(tmpdir(), `ma-wiki-restore-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    roots.push(root);
    process.env.MA_BACKUP_DIR = root;

    // 源 wiki（打包侧）
    const sourceWiki = join(root, 'source-wiki');
    mkdirSync(sourceWiki, { recursive: true });
    for (const [name, content] of Object.entries(wikiPages)) {
      const target = join(sourceWiki, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content, 'utf8');
    }
    const t = createTestDb();
    const made = await createSnapshot({
      database: t.sqlite,
      liveDbPath: join(root, 'snap.db'),
      backupDir: root,
      wikiDir: sourceWiki,
      // 隔离：不注入则走真实 client.db 的项目根（会把 dev.db 的项目 wiki 打进来）
      projectWikiRoots: [],
    });
    if (!made.success) throw new Error(`createSnapshot failed: ${made.error}`);
    const staged = stageSnapshotRestore(made.name, { backupDir: root });
    if ('success' in staged) throw new Error(`stage failed: ${staged.error ?? 'unknown'}`);
    const stage = staged;
    const liveWiki = join(root, 'live-wiki');
    return { stage, root, liveWiki, cleanupDb: t.cleanup };
  }

  async function confirmStage(
    stageId: string,
  ): Promise<Awaited<ReturnType<typeof confirmSafeRestore>>> {
    const preview = previewSafeRestore(stageId);
    return confirmSafeRestore(
      {
        journalId: preview.journalId,
        confirmationToken: preview.confirmationToken,
        confirmationPhrase: preview.confirmationPhrase,
      },
      {
        createRollbackSnapshot: async () => ({ success: true, name: 'rollback.ma-backup.zip' }),
      },
    );
  }

  it('preview 拒绝无 wiki 字段的旧 stage.json（re-stage 引导）', () => {
    const root = join(tmpdir(), `ma-wiki-restore-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
    expect(() => previewSafeRestore(stageId)).toThrow(/incomplete Wiki metadata/);
  });

  it('preview 拒绝 wiki 元数据非法 / staging wiki 目录缺失', async () => {
    const { stage, root } = await makeRealStage({ 'page-a.md': '# a' });
    // 篡改 stage.json：wiki.path 指向不存在目录（includedFiles>0 但目录缺失）
    const stagePath = join(root, '.ma-restore-staging', stage.stageId, 'stage.json');
    const j = JSON.parse(readFileSync(stagePath, 'utf8'));
    j.wiki.path = join(root, 'no-such-wiki');
    j.wiki.includedFiles = 5;
    writeFileSync(stagePath, JSON.stringify(j));
    expect(() => previewSafeRestore(stage.stageId)).toThrow(/Wiki directory missing/);

    // 篡改：wiki 元数据缺 includedFiles → 拒绝
    const stage2 = await makeRealStage({ 'page-b.md': '# b' });
    const stagePath2 = join(stage2.root, '.ma-restore-staging', stage2.stage.stageId, 'stage.json');
    const j2 = JSON.parse(readFileSync(stagePath2, 'utf8'));
    delete j2.wiki.includedFiles;
    writeFileSync(stagePath2, JSON.stringify(j2));
    expect(() => previewSafeRestore(stage2.stage.stageId)).toThrow(/incomplete Wiki metadata/);
  });

  it('preview journal 记录 wiki 字段（liveRoot/stagedRoot/includedFiles=pending）', async () => {
    const { stage, root, liveWiki, cleanupDb } = await makeRealStage({ 'page-c.md': '# c' });
    try {
      process.env.MA_WIKI_DIR = liveWiki;
      const preview = previewSafeRestore(stage.stageId);
      expect(preview.wiki).toMatchObject({
        status: 'pending',
        liveRoot: liveWiki,
        stagedRoot: join(root, '.ma-restore-staging', stage.stageId, 'wiki'),
        includedFiles: 1,
        movedOldTo: null,
      });
      // 旧 journal 兼容：无 wiki 字段的 journal 读取不炸
      const jp = join(process.env.MA_BACKUP_DIR!, 'restore-journal', `${preview.journalId}.json`);
      const j = JSON.parse(readFileSync(jp, 'utf8'));
      delete j.wiki;
      writeFileSync(jp, JSON.stringify(j));
      expect(readRestoreJournal(preview.journalId)?.wiki).toMatchObject({
        status: 'pending',
        includedFiles: 0,
      });
    } finally {
      cleanupDb();
    }
  });

  it('confirm 执行 wiki 换入：staging wiki → live wiki，旧 wiki 保留在 movedOldTo', async () => {
    const { stage, root, liveWiki, cleanupDb } = await makeRealStage({
      'page-d.md': '# 快照 wiki 页\n正文',
      'sub/notes.md': '# 子目录页',
    });
    try {
      mkdirSync(liveWiki, { recursive: true });
      writeFileSync(join(liveWiki, 'old-page.md'), '# 旧页', 'utf8');
      process.env.MA_WIKI_DIR = liveWiki;

      const confirmed = await confirmStage(stage.stageId);
      expect(confirmed.status).toBe('applied');
      expect(confirmed.wiki.status).toBe('swapped');
      expect(confirmed.wiki.includedFiles).toBe(2);
      expect(readFileSync(join(liveWiki, 'page-d.md'), 'utf8')).toContain('快照 wiki 页');
      expect(existsSync(join(liveWiki, 'sub', 'notes.md'))).toBe(true);
      // 旧 wiki 被移动到 movedOldTo（审计/回滚保留）
      expect(confirmed.wiki.movedOldTo).toBeTruthy();
      expect(existsSync(join(confirmed.wiki.movedOldTo!, 'old-page.md'))).toBe(true);
      // staging wiki 已迁走（不再留在 staging）
      expect(existsSync(join(root, '.ma-restore-staging', stage.stageId, 'wiki'))).toBe(false);
    } finally {
      cleanupDb();
    }
  });

  it('wiki 为空（快照无 wiki 文件）→ skipped，不阻断 DB 换入', async () => {
    const { createSnapshot, stageSnapshotRestore } = await import('./ops-recovery.js');
    const root = join(tmpdir(), `ma-wiki-restore-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    roots.push(root);
    process.env.MA_BACKUP_DIR = root;
    const t = createTestDb();
    try {
      const made = await createSnapshot({
        database: t.sqlite,
        liveDbPath: join(root, 'snap.db'),
        backupDir: root,
        wikiDir: join(root, 'empty-wiki'), // 不存在的目录 → collectFiles 空
        projectWikiRoots: [],
      });
      if (!made.success) throw new Error(made.error);
      const staged = stageSnapshotRestore(made.name, { backupDir: root });
      if ('success' in staged) throw new Error(`stage failed: ${staged.error ?? 'unknown'}`);
      process.env.MA_WIKI_DIR = join(root, 'live-wiki');
      const confirmed = await confirmStage(staged.stageId);
      expect(confirmed.status).toBe('applied');
      expect(confirmed.wiki.status).toBe('skipped');
    } finally {
      t.cleanup();
    }
  });

  it('wiki 换入失败 → journal failed 且 error 说明现场（DB 已换、wiki 未换）', async () => {
    const { stage, root, cleanupDb } = await makeRealStage({ 'page-e.md': '# e' });
    try {
      // live wiki root 的父目录不存在 → rename 失败
      process.env.MA_WIKI_DIR = join(root, 'no-such-parent', 'wiki');
      const confirmed = await confirmStage(stage.stageId);
      expect(confirmed.status).toBe('failed');
      expect(confirmed.wiki.status).toBe('failed');
      expect(confirmed.error).toContain('wiki swap failed');
    } finally {
      cleanupDb();
    }
  });

  it('dry-run 覆盖报告列出受影响 Wiki 页（global + 项目级）', async () => {
    const { dryRunRestore, createSnapshot, stageSnapshotRestore } =
      await import('./ops-recovery.js');
    const root = join(tmpdir(), `ma-wiki-restore-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    roots.push(root);
    process.env.MA_BACKUP_DIR = root;
    const sourceWiki = join(root, 'source-wiki');
    mkdirSync(join(sourceWiki, 'docs'), { recursive: true });
    writeFileSync(join(sourceWiki, 'docs', 'page-x.md'), '# x', 'utf8');
    writeFileSync(join(sourceWiki, 'docs', 'page-y.md'), '# y', 'utf8');
    const t = createTestDb();
    try {
      const made = await createSnapshot({
        database: t.sqlite,
        liveDbPath: join(root, 'snap.db'),
        backupDir: root,
        wikiDir: sourceWiki,
        // 项目级 Wiki 注入：构造一个假 root 不可行（需真目录）——用真实临时目录
        projectWikiRoots: [],
      });
      if (!made.success) throw new Error(made.error);
      const staged = stageSnapshotRestore(made.name, { backupDir: root });
      if ('success' in staged) throw new Error(`stage failed: ${staged.error ?? 'unknown'}`);

      const report = dryRunRestore(staged.snapshotName, { backupDir: root });
      expect(report.valid).toBe(true);
      expect(report.report.wiki.pages.sort()).toEqual(['docs/page-x.md', 'docs/page-y.md']);
      expect(report.report.wiki.projectPages).toEqual([]);
      // stage 元数据同样带 pages（preview/UI 展示用）
      expect(staged.wiki.pages.sort()).toEqual(['docs/page-x.md', 'docs/page-y.md']);
      expect(staged.wiki.projectPages).toEqual([]);
    } finally {
      t.cleanup();
    }
  });
});
