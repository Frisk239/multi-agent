/**
 * Snapshot v1 disaster recovery.
 *
 * The archive intentionally uses an uncompressed ZIP.  Keeping the tiny ZIP
 * writer/reader here avoids adding a runtime dependency to the local server,
 * while still producing a standard `.ma-backup.zip` that other tools can
 * inspect.  SQLite is copied through better-sqlite3's backup API, so WAL state
 * is checkpointed by SQLite rather than copied as a sidecar file.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { getSqliteHardeningInfo, sqlite } from './db/client.js';
import { resolveWorkspaceCwd, type ResolvedWorkspaceCwd } from './workspace-cwd.js';
import { getWikiDirSource } from './wiki/store.js';
import { listProjectWikiRoots } from './wiki/project-wiki-roots.js';
import { buildBackupFileName, ensureBackupDirWritable, resolveBackupDir } from './ops-backup.js';

export const SNAPSHOT_ARCHIVE_VERSION = 1 as const;
export const SNAPSHOT_EXTENSION = '.ma-backup.zip';

export type SnapshotManifestFile = {
  path: string;
  kind: 'database' | 'wiki';
  sizeBytes: number;
  sha256: string;
};

export type SnapshotManifest = {
  archiveVersion: 1;
  createdAt: string;
  dbSchema: string;
  workspace: Pick<ResolvedWorkspaceCwd, 'path' | 'source' | 'configured' | 'exists'>;
  wiki: {
    root: string;
    source: 'env' | 'workspace' | 'cwd';
    /** false when project wiki roots are packed under wiki/projects/<id>/ */
    projectScopedExcluded: boolean;
    excludedProjectWikiRoots: string[];
    /** Included project wiki roots (A4). */
    includedProjectWikiRoots?: Array<{
      projectId: string;
      projectName: string;
      wikiPath: string;
      files: number;
    }>;
    exclusions: string[];
  };
  files: SnapshotManifestFile[];
};

export type SnapshotEntry = {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
  sha256: string;
  valid: boolean;
  validationError?: string;
};

export type SnapshotValidation = {
  valid: boolean;
  name: string;
  path: string;
  sha256: string | null;
  errors: string[];
  manifest?: SnapshotManifest;
  fileCount: number;
  dbBytes: number;
  wikiFiles: number;
};

export type SnapshotDryRun = SnapshotValidation & {
  dryRun: true;
  mutatesLiveState: false;
  report: {
    database: { included: boolean; bytes: number; target: string };
    wiki: {
      includedFiles: number;
      root: string;
      projectScopedExcluded: boolean;
      /** G5-3：受影响 global wiki 页 */
      pages: string[];
      /** G5-3：受影响项目级 Wiki */
      projectPages: NonNullable<
        SnapshotManifest['wiki']['includedProjectWikiRoots']
      >;
    };
    wouldOverwrite: string[];
    actions: string[];
  };
};

export type SnapshotStage = {
  stageId: string;
  snapshotName: string;
  stagePath: string;
  createdAt: string;
  expiresAt: string;
  mutatesLiveState: false;
  database: {
    path: string;
    bytes: number;
    integrity: 'ok' | 'failed';
    schema: string;
  };
  wiki: {
    path: string;
    includedFiles: number;
    projectScopedExcluded: boolean;
    /** 受影响 global wiki 页（wiki/ 前缀剥离）；G5-3 恢复覆盖报告用 */
    pages: string[];
    /** 受影响项目级 Wiki（A4 打包的 project roots） */
    projectPages: NonNullable<
      SnapshotManifest['wiki']['includedProjectWikiRoots']
    >;
  };
};

const SNAPSHOT_STAGE_DIR = '.ma-restore-staging';
const DEFAULT_STAGE_TTL_MS = 60 * 60 * 1000;
const SNAPSHOT_STAGE_ID = /^[0-9a-f-]{36}$/i;

type ZipEntry = { name: string; data: Buffer };

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { date: number; time: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
  };
}

function makeZip(entries: ZipEntry[], now: Date): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const dt = dosDateTime(now);
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const h = Buffer.alloc(30 + name.length);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(dt.time, 10); h.writeUInt16LE(dt.date, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(entry.data.length, 18); h.writeUInt32LE(entry.data.length, 22);
    h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28); name.copy(h, 30);
    local.push(h, entry.data);

    const c = Buffer.alloc(46 + name.length);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(dt.time, 12); c.writeUInt16LE(dt.date, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(entry.data.length, 20); c.writeUInt32LE(entry.data.length, 24);
    c.writeUInt16LE(name.length, 28); c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32);
    c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36); c.writeUInt32LE(0, 38); c.writeUInt32LE(offset, 42); name.copy(c, 46);
    central.push(c);
    offset += h.length + entry.data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralBuf, end]);
}

/**
 * D5（reopenable-db-lifecycle）：从 snapshot zip 解出 DB 文件到目标路径。
 * 供 safe-live-restore 的 apply 生命周期使用；zip 布局为 db/backup.sqlite。
 */
export function extractSnapshotDatabase(
  snapshotPath: string,
  destPath: string,
): { ok: true } | { ok: false; error: string } {
  try {
    const entries = zipEntries(readFileSync(snapshotPath));
    const dbEntry = entries.find((e) => e.name === 'db/backup.sqlite');
    if (!dbEntry) return { ok: false, error: 'snapshot 缺少 db/backup.sqlite' };
    if (dbEntry.data.length === 0) return { ok: false, error: 'snapshot DB 为空' };
    writeFileSync(destPath, dbEntry.data);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function zipEntries(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 0xffff - 22; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0 || eocd + 22 > buf.length) throw new Error('malformed ZIP: missing end record');
  const count = buf.readUInt16LE(eocd + 10);
  const centralSize = buf.readUInt32LE(eocd + 12);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  if (centralOffset + centralSize > buf.length) throw new Error('malformed ZIP: central directory outside archive');
  const out: ZipEntry[] = [];
  let p = centralOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('malformed ZIP: central entry');
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (method !== 0) throw new Error(`unsupported ZIP compression for ${name}`);
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('malformed ZIP: local entry');
    const localNameLen = buf.readUInt16LE(localOffset + 26), localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    if (start + compressed > buf.length) throw new Error('malformed ZIP: entry outside archive');
    out.push({ name, data: Buffer.from(buf.subarray(start, start + compressed)) });
  }
  return out;
}

function sha256(data: Buffer): string { return createHash('sha256').update(data).digest('hex'); }

function safeArchivePath(path: string): boolean {
  if (!path || path.includes('\\') || isAbsolute(path)) return false;
  const parts = path.split('/');
  return parts.every((p) => p.length > 0 && p !== '.' && p !== '..');
}

const EXCLUDED_NAMES = new Set([
  '.env', '.env.local', '.env.production', '.cache', 'node_modules', '.ma-backups',
  '.git', '.runtime', 'runtime', '.runs', 'runs', '.workspaces', 'workspaces', '.tmp', 'tmp',
]);
function excludedWikiPath(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDED_NAMES.has(lower)
    || lower.includes('secret')
    || lower.includes('credential')
    || /\.(pem|key|p12|pfx)$/.test(lower)
    || /(?:\.db|\.sqlite)?-(?:wal|shm)$/.test(lower);
}

function collectFiles(root: string): { path: string; data: Buffer }[] {
  const out: { path: string; data: Buffer }[] = [];
  if (!existsSync(root) || !statSync(root).isDirectory()) return out;
  const visit = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (excludedWikiPath(name)) continue;
      const absolute = join(dir, name);
      const st = lstatSync(absolute);
      // A symlink can escape the configured Wiki root and pull unrelated
      // secrets into an otherwise safe archive.  Snapshot only real files.
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) visit(absolute);
      else if (st.isFile()) out.push({ path: relative(root, absolute).split(sep).join('/'), data: readFileSync(absolute) });
    }
  };
  visit(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function schemaMarker(database: Database.Database): string {
  try { return String((database.pragma('user_version', { simple: true }) as number) ?? 0); } catch { return 'unknown'; }
}

export type CreateSnapshotOpts = {
  database?: Database.Database;
  liveDbPath?: string;
  backupDir?: string;
  wikiDir?: string;
  now?: Date;
  backupFn?: (filename: string) => Promise<unknown>;
  workspace?: ResolvedWorkspaceCwd;
  /** Inject project wiki roots (tests / offline); default = listProjectWikiRoots(). */
  projectWikiRoots?: import('./wiki/project-wiki-roots.js').ProjectWikiRoot[];
};

export async function createSnapshot(opts: CreateSnapshotOpts = {}) {
  const database = opts.database ?? sqlite;
  const liveDbPath = opts.liveDbPath ?? (() => { try { return getSqliteHardeningInfo(database).path; } catch { return process.env.DB_PATH ?? './dev.db'; } })();
  const dir = resolve(opts.backupDir ?? resolveBackupDir());
  const now = opts.now ?? new Date();
  const writable = ensureBackupDirWritable(dir);
  if (!writable.ok) return { success: false as const, code: 'SNAPSHOT_DIR_NOT_WRITABLE', error: writable.error, status: 503 as const };
  const stamp = buildBackupFileName(now).replace(/\.db$/, '').replace(/^ma-backup-/, 'ma-snapshot-');
  // 秒级时间戳同秒内多次 snapshot 会同名互相覆盖（restore 的 rollback snapshot 与
  // 目标快照同秒创建时 rollback 会覆盖目标 zip）——加 3 字节随机后缀保证唯一。
  const name = `${stamp}-${randomBytes(3).toString('hex')}${SNAPSHOT_EXTENSION}`;
  const path = resolve(dir, name);
  if (path === resolve(liveDbPath)) return { success: false as const, code: 'SNAPSHOT_FORBIDDEN_PATH', error: 'snapshot target overlaps live database', status: 400 as const };
  const tempDb = join(dir, `.${name}.${process.pid}.sqlite`);
  const tempZip = join(dir, `.${name}.${process.pid}.tmp`);
  try {
    const backupFn = opts.backupFn ?? ((filename: string) => database.backup(filename));
    await backupFn(tempDb);
    const dbData = readFileSync(tempDb);
    if (dbData.length === 0) throw new Error('database snapshot is zero bytes');
    const wiki = opts.wikiDir ? { path: resolve(opts.wikiDir), source: 'cwd' as const } : getWikiDirSource();
    const wikiRoot = wiki.path;
    const wikiFiles = collectFiles(wikiRoot);
    // A4 · pack project-scoped {localPath}/wiki when present
    let projectRoots: ReturnType<typeof listProjectWikiRoots> =
      opts.projectWikiRoots ?? [];
    if (!opts.projectWikiRoots) {
      try {
        projectRoots = listProjectWikiRoots();
      } catch {
        projectRoots = [];
      }
    }
    const includedProjectWikiRoots: NonNullable<
      SnapshotManifest['wiki']['includedProjectWikiRoots']
    > = [];
    const projectWikiEntries: ZipEntry[] = [];
    const projectWikiFiles: SnapshotManifestFile[] = [];
    for (const root of projectRoots) {
      if (!root.exists) continue;
      const filesInProject = collectFiles(root.wikiPath);
      if (filesInProject.length === 0) {
        // still report coverage even if empty wiki dir missing files
        includedProjectWikiRoots.push({
          projectId: root.projectId,
          projectName: root.projectName,
          wikiPath: root.wikiPath,
          files: 0,
        });
        continue;
      }
      includedProjectWikiRoots.push({
        projectId: root.projectId,
        projectName: root.projectName,
        wikiPath: root.wikiPath,
        files: filesInProject.length,
      });
      for (const f of filesInProject) {
        const zipPath = `wiki/projects/${root.projectId}/${f.path}`;
        projectWikiEntries.push({ name: zipPath, data: f.data });
        projectWikiFiles.push({
          path: zipPath,
          kind: 'wiki',
          sizeBytes: f.data.length,
          sha256: sha256(f.data),
        });
      }
    }
    const files: SnapshotManifestFile[] = [
      { path: 'db/backup.sqlite', kind: 'database', sizeBytes: dbData.length, sha256: sha256(dbData) },
      ...wikiFiles.map((f) => ({ path: `wiki/${f.path}`, kind: 'wiki' as const, sizeBytes: f.data.length, sha256: sha256(f.data) })),
      ...projectWikiFiles,
    ];
    const manifest: SnapshotManifest = {
      archiveVersion: SNAPSHOT_ARCHIVE_VERSION,
      createdAt: now.toISOString(),
      dbSchema: schemaMarker(database),
      workspace: opts.workspace ?? (() => {
        try { return resolveWorkspaceCwd(); }
        catch { return { path: null, source: 'none' as const, configured: false, exists: false }; }
      })(),
      wiki: {
        root: wikiRoot,
        source: opts.wikiDir ? 'cwd' : wiki.source,
        projectScopedExcluded: false,
        excludedProjectWikiRoots: projectRoots
          .filter((r) => !r.exists)
          .map((r) => r.wikiPath),
        includedProjectWikiRoots,
        exclusions: [...EXCLUDED_NAMES, 'secret*/credential*', '*.pem/*.key'],
      },
      files,
    };
    const manifestData = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const entries: ZipEntry[] = [
      { name: 'manifest.json', data: manifestData },
      { name: 'db/backup.sqlite', data: dbData },
      ...wikiFiles.map((f) => ({ name: `wiki/${f.path}`, data: f.data })),
      ...projectWikiEntries,
    ];
    writeFileSync(tempZip, makeZip(entries, now));
    renameSync(tempZip, path);
    const archive = readFileSync(path);
    return { success: true as const, name, path, sizeBytes: archive.length, createdAt: now.toISOString(), sha256: sha256(archive), manifest };
  } catch (e) {
    return { success: false as const, code: 'SNAPSHOT_FAILED', error: e instanceof Error ? e.message : String(e), status: 500 as const };
  } finally {
    try { rmSync(tempDb, { force: true }); } catch { /* ignore */ }
    try { rmSync(tempZip, { force: true }); } catch { /* ignore */ }
  }
}

function validationError(name: string, path: string, errors: string[], sha: string | null = null): SnapshotValidation {
  return { valid: false, name, path, sha256: sha, errors, fileCount: 0, dbBytes: 0, wikiFiles: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isManifestFile(value: unknown): value is SnapshotManifestFile {
  if (!isRecord(value)) return false;
  return (
    typeof value.path === 'string'
    && (value.kind === 'database' || value.kind === 'wiki')
    && Number.isInteger(value.sizeBytes)
    && Number(value.sizeBytes) >= 0
    && typeof value.sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(value.sha256)
  );
}

function isSnapshotManifest(value: unknown): value is SnapshotManifest {
  if (!isRecord(value) || value.archiveVersion !== SNAPSHOT_ARCHIVE_VERSION || typeof value.createdAt !== 'string') return false;
  const workspace = value.workspace;
  const wiki = value.wiki;
  if (!isRecord(workspace) || !isRecord(wiki) || !Array.isArray(value.files)) return false;
  const workspaceValid = (
    (typeof workspace.path === 'string' || workspace.path === null)
    && (workspace.source === 'env' || workspace.source === 'db' || workspace.source === 'none')
    && typeof workspace.configured === 'boolean'
    && typeof workspace.exists === 'boolean'
  );
  const wikiValid = (
    typeof wiki.root === 'string'
    && (wiki.source === 'env' || wiki.source === 'workspace' || wiki.source === 'cwd')
    && typeof wiki.projectScopedExcluded === 'boolean'
    && Array.isArray(wiki.excludedProjectWikiRoots)
    && wiki.excludedProjectWikiRoots.every((item) => typeof item === 'string')
    && Array.isArray(wiki.exclusions)
    && wiki.exclusions.every((item) => typeof item === 'string')
  );
  return workspaceValid && wikiValid && value.files.every(isManifestFile);
}

export function validateSnapshot(path: string): SnapshotValidation {
  const name = basename(path);
  if (!name.endsWith(SNAPSHOT_EXTENSION)) return validationError(name, path, ['snapshot must use .ma-backup.zip extension']);
  if (!existsSync(path)) return validationError(name, path, ['snapshot does not exist']);
  let data: Buffer;
  try { data = readFileSync(path); } catch (e) { return validationError(name, path, [`snapshot unreadable: ${e instanceof Error ? e.message : String(e)}`]); }
  const archiveHash = sha256(data);
  let entries: ZipEntry[];
  try { entries = zipEntries(data); } catch (e) { return validationError(name, path, [e instanceof Error ? e.message : String(e)], archiveHash); }
  const errors: string[] = [];
  const byName = new Map<string, Buffer>();
  for (const entry of entries) {
    if (!safeArchivePath(entry.name)) errors.push(`path traversal rejected: ${entry.name}`);
    if (byName.has(entry.name)) errors.push(`duplicate archive path: ${entry.name}`);
    byName.set(entry.name, entry.data);
  }
  const manifestBytes = byName.get('manifest.json');
  if (!manifestBytes) return validationError(name, path, [...errors, 'missing manifest.json'], archiveHash);
  let manifest: SnapshotManifest | undefined;
  let parsedManifest: unknown;
  try { parsedManifest = JSON.parse(manifestBytes.toString('utf8')) as unknown; } catch { errors.push('malformed manifest.json'); }
  const rawManifestFiles = isRecord(parsedManifest) && Array.isArray(parsedManifest.files) ? parsedManifest.files : [];
  if (!isRecord(parsedManifest)) {
    errors.push('manifest.json must contain an object');
  } else {
    if (parsedManifest.archiveVersion !== SNAPSHOT_ARCHIVE_VERSION) errors.push(`unknown archive version: ${String(parsedManifest.archiveVersion)}`);
    if (!Array.isArray(parsedManifest.files)) errors.push('manifest file list is malformed');
    else rawManifestFiles.forEach((file, index) => {
      if (!isManifestFile(file)) errors.push(`manifest file entry ${index} is malformed`);
    });
    if (!isSnapshotManifest(parsedManifest)) errors.push('manifest metadata is malformed');
    else manifest = parsedManifest;
  }
  const validManifestFiles = rawManifestFiles.filter(isManifestFile);
  const manifestPaths = new Set(validManifestFiles.map((f) => f.path));
  if (manifestPaths.size !== validManifestFiles.length) errors.push('duplicate manifest file path');
  if (!manifestPaths.has('db/backup.sqlite')) {
    errors.push('manifest is missing database file entry');
  }
  for (const entry of entries) {
    if (entry.name !== 'manifest.json' && !manifestPaths.has(entry.name)) {
      errors.push(`unlisted archive file: ${entry.name}`);
    }
  }
  const db = byName.get('db/backup.sqlite');
  if (!db || db.length === 0) errors.push('database entry is missing or zero bytes');
  let fileCount = 0, dbBytes = db?.length ?? 0, wikiFiles = 0;
  for (const f of validManifestFiles) {
    fileCount++;
    if (!safeArchivePath(f.path)) { errors.push(`path traversal rejected: ${f.path}`); continue; }
    const actual = byName.get(f.path);
    if (!actual) { errors.push(`missing archive file: ${f.path}`); continue; }
    if (actual.length !== f.sizeBytes) errors.push(`size mismatch: ${f.path}`);
    if (sha256(actual) !== f.sha256) errors.push(`hash mismatch: ${f.path}`);
    if (f.kind === 'database') dbBytes = actual.length;
    if (f.kind === 'wiki') wikiFiles++;
  }
  return { valid: errors.length === 0, name, path, sha256: archiveHash, errors, manifest, fileCount, dbBytes, wikiFiles };
}

function resolveSnapshotPath(input: string | undefined, backupDir: string): string {
  const raw = (input ?? '').trim();
  if (!raw) throw new Error('snapshot name is required');
  const candidate = isAbsolute(raw) ? resolve(raw) : resolve(backupDir, raw);
  const base = resolve(backupDir);
  const rel = relative(base, candidate);
  if (rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel)) throw new Error('snapshot path traversal rejected');
  return candidate;
}

export function listSnapshots(opts: { backupDir?: string } = {}) {
  const dir = resolve(opts.backupDir ?? resolveBackupDir());
  if (!existsSync(dir)) return { success: true as const, dir, snapshots: [] as SnapshotEntry[] };
  try {
    const snapshots = readdirSync(dir).filter((n) => n.endsWith(SNAPSHOT_EXTENSION)).map((name) => {
      const path = resolve(dir, name); const st = statSync(path); const valid = validateSnapshot(path);
      return { name, path, sizeBytes: st.size, createdAt: st.mtime.toISOString(), sha256: valid.sha256 ?? sha256(readFileSync(path)), valid: valid.valid, ...(valid.valid ? {} : { validationError: valid.errors.join('; ') }) } satisfies SnapshotEntry;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { success: true as const, dir, snapshots };
  } catch (e) { return { success: false as const, code: 'SNAPSHOT_LIST_FAILED', error: e instanceof Error ? e.message : String(e), status: 500 as const }; }
}

export function validateSnapshotByName(input: string | undefined, opts: { backupDir?: string } = {}): SnapshotValidation {
  const dir = resolve(opts.backupDir ?? resolveBackupDir());
  try { const path = resolveSnapshotPath(input, dir); return validateSnapshot(path); }
  catch (e) { return validationError(input ?? '', '', [e instanceof Error ? e.message : String(e)]); }
}

export function dryRunRestore(input: string | undefined, opts: { backupDir?: string; workspace?: ResolvedWorkspaceCwd } = {}): SnapshotDryRun {
  const v = validateSnapshotByName(input, opts);
  const m = v.manifest;
  const wikiPages =
    m?.files
      .filter(
        (f) =>
          f.kind === 'wiki' &&
          f.path.startsWith('wiki/') &&
          !f.path.startsWith('wiki/projects/'),
      )
      .map((f) => f.path.slice('wiki/'.length)) ?? [];
  return {
    ...v,
    dryRun: true,
    mutatesLiveState: false,
    report: {
      database: { included: v.dbBytes > 0, bytes: v.dbBytes, target: opts.workspace?.path ? join(opts.workspace.path, 'dev.db') : 'live SQLite database' },
      wiki: {
        includedFiles: v.wikiFiles,
        root: m?.wiki.root ?? 'configured global Wiki root',
        projectScopedExcluded: m?.wiki.projectScopedExcluded ?? false,
        /** G5-3：受影响 global wiki 页（覆盖报告） */
        pages: wikiPages,
        /** G5-3：受影响项目级 Wiki（覆盖报告） */
        projectPages: m?.wiki.includedProjectWikiRoots ?? [],
      },
      wouldOverwrite: [],
      actions: v.valid ? ['validate archive', 'stage database and Wiki entries (not executed)', 'await explicit restore implementation'] : [],
    },
  };
}

type SnapshotStageFailure = {
  success: false;
  code: 'SNAPSHOT_STAGE_DIR_NOT_WRITABLE' | 'SNAPSHOT_STAGE_INVALID' | 'SNAPSHOT_STAGE_FAILED' | 'SNAPSHOT_STAGE_NOT_FOUND';
  error: string;
  status: 400 | 404 | 500 | 503;
  validation?: SnapshotValidation;
};

export type StageSnapshotRestoreOpts = {
  backupDir?: string;
  now?: Date;
  stageTtlMs?: number;
};

function stageRoot(backupDir: string): string {
  return join(resolve(backupDir), SNAPSHOT_STAGE_DIR);
}

function cleanupExpiredStages(root: string, now: Date): number {
  if (!existsSync(root)) return 0;
  let removed = 0;
  for (const name of readdirSync(root)) {
    if (!SNAPSHOT_STAGE_ID.test(name)) continue;
    const stagePath = join(root, name);
    const metadataPath = join(stagePath, 'stage.json');
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as { expiresAt?: string };
      if (typeof metadata.expiresAt === 'string' && Date.parse(metadata.expiresAt) <= now.getTime()) {
        rmSync(stagePath, { recursive: true, force: true });
        removed++;
      }
    } catch {
      // Unknown/incomplete staging directories are left for an explicit
      // operator cleanup; never delete a directory without an expiry marker.
    }
  }
  return removed;
}

function stageFailure(
  code: SnapshotStageFailure['code'],
  error: string,
  status: SnapshotStageFailure['status'],
  validation?: SnapshotValidation,
): SnapshotStageFailure {
  return { success: false, code, error, status, ...(validation ? { validation } : {}) };
}

/**
 * Extract a validated archive into an isolated, expiring staging directory.
 * This is deliberately not a restore: live DB/Wiki paths are never opened for
 * write and no worker state is changed. The staged SQLite is opened read-only
 * and must pass integrity_check before the stage is exposed to the UI.
 */
export function stageSnapshotRestore(
  input: string | undefined,
  opts: StageSnapshotRestoreOpts = {},
): SnapshotStage | SnapshotStageFailure {
  const backupDir = resolve(opts.backupDir ?? resolveBackupDir());
  const writable = ensureBackupDirWritable(backupDir);
  if (!writable.ok) return stageFailure('SNAPSHOT_STAGE_DIR_NOT_WRITABLE', writable.error, 503);

  const now = opts.now ?? new Date();
  const validation = validateSnapshotByName(input, { backupDir });
  if (!validation.valid) {
    return stageFailure(
      validation.errors.some((e) => /required|traversal/.test(e)) ? 'SNAPSHOT_STAGE_INVALID' : 'SNAPSHOT_STAGE_FAILED',
      validation.errors.join('; ') || 'snapshot validation failed',
      validation.errors.some((e) => /required|traversal/.test(e)) ? 400 : 500,
      validation,
    );
  }

  const sourcePath = validation.path;
  const stageId = randomUUID();
  const root = stageRoot(backupDir);
  const temporaryPath = join(root, `.${stageId}.tmp`);
  const finalPath = join(root, stageId);
  const expiresAt = new Date(now.getTime() + Math.max(1, opts.stageTtlMs ?? DEFAULT_STAGE_TTL_MS));
  let stagedDb: Database.Database | undefined;
  try {
    cleanupExpiredStages(root, now);
    mkdirSync(temporaryPath, { recursive: true });
    const entries = zipEntries(readFileSync(sourcePath));
    for (const entry of entries) {
      if (entry.name === 'manifest.json') continue;
      if (!safeArchivePath(entry.name)) throw new Error(`path traversal rejected: ${entry.name}`);
      const target = resolve(temporaryPath, entry.name);
      const targetRelative = relative(temporaryPath, target);
      if (targetRelative.startsWith('..' + sep) || targetRelative === '..' || isAbsolute(targetRelative)) {
        throw new Error(`staging path traversal rejected: ${entry.name}`);
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, entry.data);
    }

    const dbPath = join(temporaryPath, 'db', 'backup.sqlite');
    stagedDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    const integrityRow = stagedDb.prepare('PRAGMA integrity_check').get() as { integrity_check?: unknown } | undefined;
    const integrity = integrityRow?.integrity_check === 'ok' ? 'ok' : 'failed';
    const schema = String(stagedDb.pragma('user_version', { simple: true }) ?? '0');
    if (integrity !== 'ok') throw new Error('staged database integrity_check failed');
    if (validation.manifest?.dbSchema !== schema) {
      throw new Error(`staged database schema mismatch: expected ${validation.manifest?.dbSchema ?? 'unknown'}, got ${schema}`);
    }
    stagedDb.close();
    stagedDb = undefined;

    const stage: SnapshotStage = {
      stageId,
      snapshotName: validation.name,
      stagePath: finalPath,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      mutatesLiveState: false,
      database: {
        path: join(finalPath, 'db', 'backup.sqlite'),
        bytes: validation.dbBytes,
        integrity: 'ok',
        schema,
      },
      wiki: {
        path: join(finalPath, 'wiki'),
        includedFiles: validation.wikiFiles,
        projectScopedExcluded: false,
        pages:
          validation.manifest?.files
            .filter(
              (f) =>
                f.kind === 'wiki' &&
                f.path.startsWith('wiki/') &&
                !f.path.startsWith('wiki/projects/'),
            )
            .map((f) => f.path.slice('wiki/'.length)) ?? [],
        projectPages:
          validation.manifest?.wiki.includedProjectWikiRoots ?? [],
      },
    };
    writeFileSync(join(temporaryPath, 'stage.json'), `${JSON.stringify(stage, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, finalPath);
    return stage;
  } catch (e) {
    try { stagedDb?.close(); } catch { /* ignore */ }
    try { rmSync(temporaryPath, { recursive: true, force: true }); } catch { /* ignore */ }
    return stageFailure('SNAPSHOT_STAGE_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}

export function removeSnapshotStage(stageId: string | undefined, opts: { backupDir?: string } = {}) {
  const id = (stageId ?? '').trim();
  if (!SNAPSHOT_STAGE_ID.test(id)) return stageFailure('SNAPSHOT_STAGE_INVALID', 'invalid staging id', 400);
  const path = join(stageRoot(opts.backupDir ?? resolveBackupDir()), id);
  if (!existsSync(path)) return stageFailure('SNAPSHOT_STAGE_NOT_FOUND', 'staging package does not exist', 404);
  try {
    rmSync(path, { recursive: true, force: true });
    return { success: true as const, stageId: id };
  } catch (e) {
    return stageFailure('SNAPSHOT_STAGE_FAILED', e instanceof Error ? e.message : String(e), 500);
  }
}
