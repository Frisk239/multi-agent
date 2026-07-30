/**
 * A4 · Enumerate project-scoped wiki roots for disaster snapshot coverage.
 */
import { existsSync, statSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { projects } from '../db/schema.js';

export type ProjectWikiRoot = {
  projectId: string;
  projectName: string;
  localPath: string;
  wikiPath: string;
  exists: boolean;
};

function isUsableDir(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Pure: map project rows to wiki roots under {localPath}/wiki.
 */
export function mapProjectsToWikiRoots(
  rows: Array<{ id: string; name: string; localPath?: string | null }>,
): ProjectWikiRoot[] {
  const out: ProjectWikiRoot[] = [];
  for (const row of rows) {
    const local = row.localPath?.trim() ?? '';
    if (!local) continue;
    const abs = isAbsolute(local) ? resolve(local) : '';
    if (!abs) continue;
    const wikiPath = join(abs, 'wiki');
    out.push({
      projectId: row.id,
      projectName: row.name,
      localPath: abs,
      wikiPath,
      exists: isUsableDir(wikiPath) || isUsableDir(abs),
    });
  }
  return out;
}

/** Load from DB and map. */
export function listProjectWikiRoots(): ProjectWikiRoot[] {
  const rows = db
    .select({
      id: projects.id,
      name: projects.name,
      localPath: projects.localPath,
    })
    .from(projects)
    .all();
  return mapProjectsToWikiRoots(rows);
}
