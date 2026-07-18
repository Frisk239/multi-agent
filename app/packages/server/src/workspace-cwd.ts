// ADR 0003：workspace 根目录解析与持久化（路径非密钥）
import { existsSync, statSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { workspaces } from './db/schema.js';

export type CwdSource = 'env' | 'db' | 'none';

export type ResolvedWorkspaceCwd = {
  path: string | null;
  source: CwdSource;
  exists: boolean;
  configured: boolean;
};

const DEFAULT_WS_ID = 'ws-local';

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function readDbRootPath(workspaceId = DEFAULT_WS_ID): string | null {
  const row = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
  const p = row?.rootPath?.trim();
  return p ? p : null;
}

/** 优先级：env > DB root_path > none */
export function resolveWorkspaceCwd(workspaceId = DEFAULT_WS_ID): ResolvedWorkspaceCwd {
  const env = process.env.MA_WORKSPACE_CWD?.trim() || null;
  if (env) {
    return {
      path: env,
      source: 'env',
      exists: isDirectory(env),
      configured: true,
    };
  }
  const dbPath = readDbRootPath(workspaceId);
  if (dbPath) {
    return {
      path: dbPath,
      source: 'db',
      exists: isDirectory(dbPath),
      configured: true,
    };
  }
  return { path: null, source: 'none', exists: false, configured: false };
}

/** 启动 / 保存后：把有效 cwd 注入进程 env，兼容既有 process.env 读取点 */
export function applyWorkspaceCwdToProcess(workspaceId = DEFAULT_WS_ID): ResolvedWorkspaceCwd {
  const env = process.env.MA_WORKSPACE_CWD?.trim();
  if (env) {
    return resolveWorkspaceCwd(workspaceId);
  }
  const dbPath = readDbRootPath(workspaceId);
  if (dbPath && isDirectory(dbPath)) {
    process.env.MA_WORKSPACE_CWD = dbPath;
  }
  return resolveWorkspaceCwd(workspaceId);
}

export function setWorkspaceRootPath(
  absolutePath: string,
  workspaceId = DEFAULT_WS_ID,
): { ok: true; resolved: ResolvedWorkspaceCwd } | { ok: false; error: string } {
  const path = absolutePath.trim();
  if (!path) return { ok: false, error: '路径不能为空' };
  if (!isDirectory(path)) {
    return { ok: false, error: `路径不存在或不是目录: ${path}` };
  }
  const row = db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).get();
  if (!row) return { ok: false, error: 'workspace 不存在' };
  db.update(workspaces)
    .set({ rootPath: path })
    .where(eq(workspaces.id, workspaceId))
    .run();
  // 保存后立即生效：写入 env（用户显式配置，可覆盖旧 env 空值；若已有 env 则仍以 env 优先）
  if (!process.env.MA_WORKSPACE_CWD?.trim()) {
    process.env.MA_WORKSPACE_CWD = path;
  } else {
    // 运维意图：Settings 保存 = 当前会话也切到该路径
    process.env.MA_WORKSPACE_CWD = path;
  }
  return { ok: true, resolved: resolveWorkspaceCwd(workspaceId) };
}

export function clearWorkspaceRootPath(workspaceId = DEFAULT_WS_ID): ResolvedWorkspaceCwd {
  db.update(workspaces)
    .set({ rootPath: null })
    .where(eq(workspaces.id, workspaceId))
    .run();
  // 不强制 delete env（可能由 shell 注入）；仅清 DB
  return resolveWorkspaceCwd(workspaceId);
}
