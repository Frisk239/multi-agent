// E4：隔离 CLI 工作目录列表 / 清理（仅 ~/.multi-agent 下 run-workspaces 与 chat-sessions）
// 禁止触及 project_local 真仓路径。

import {
  existsSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

export type IsolatedWorkspaceEntry = {
  id: string;
  kind: 'run_workspace' | 'chat_session';
  path: string;
  label: string;
  mtimeMs: number;
};

function multiAgentRoot(): string {
  return join(homedir(), '.multi-agent');
}

function safeUnder(root: string, candidate: string): boolean {
  const r = resolve(root) + sep;
  const c = resolve(candidate) + sep;
  return c.startsWith(r) || resolve(candidate) === resolve(root);
}

function dirMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * 枚举隔离 workdir：
 * - run-workspaces/<ws>/<issue|run-*>/workdir
 * - chat-sessions/<thread>/workdir
 */
export function listIsolatedWorkspaces(): IsolatedWorkspaceEntry[] {
  const root = multiAgentRoot();
  const out: IsolatedWorkspaceEntry[] = [];

  const runRoot = join(root, 'run-workspaces');
  if (existsSync(runRoot)) {
    try {
      for (const ws of readdirSync(runRoot, { withFileTypes: true })) {
        if (!ws.isDirectory()) continue;
        const wsPath = join(runRoot, ws.name);
        for (const slot of readdirSync(wsPath, { withFileTypes: true })) {
          if (!slot.isDirectory()) continue;
          const workdir = join(wsPath, slot.name, 'workdir');
          if (!existsSync(workdir) || !statSync(workdir).isDirectory()) continue;
          out.push({
            id: `run:${ws.name}/${slot.name}`,
            kind: 'run_workspace',
            path: workdir,
            label: `${ws.name} / ${slot.name}`,
            mtimeMs: dirMtime(workdir),
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  const chatRoot = join(root, 'chat-sessions');
  if (existsSync(chatRoot)) {
    try {
      for (const thr of readdirSync(chatRoot, { withFileTypes: true })) {
        if (!thr.isDirectory()) continue;
        const workdir = join(chatRoot, thr.name, 'workdir');
        if (!existsSync(workdir) || !statSync(workdir).isDirectory()) continue;
        out.push({
          id: `chat:${thr.name}`,
          kind: 'chat_session',
          path: workdir,
          label: `chat / ${thr.name}`,
          mtimeMs: dirMtime(workdir),
        });
      }
    } catch {
      /* ignore */
    }
  }

  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

export function cleanupIsolatedWorkspaces(opts: {
  ids?: string[];
  olderThanDays?: number;
}): { deleted: string[]; skipped: string[]; errors: string[] } {
  const all = listIsolatedWorkspaces();
  const byId = new Map(all.map((e) => [e.id, e]));
  const root = multiAgentRoot();
  const deleted: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  let targets: IsolatedWorkspaceEntry[] = [];
  if (opts.ids && opts.ids.length > 0) {
    for (const id of opts.ids) {
      const e = byId.get(id);
      if (e) targets.push(e);
      else skipped.push(id);
    }
  } else if (opts.olderThanDays != null && opts.olderThanDays > 0) {
    const cutoff = Date.now() - opts.olderThanDays * 86_400_000;
    targets = all.filter((e) => e.mtimeMs > 0 && e.mtimeMs < cutoff);
  } else {
    return { deleted, skipped: ['no ids or olderThanDays'], errors };
  }

  for (const e of targets) {
    if (!safeUnder(root, e.path)) {
      errors.push(`${e.id}: path outside ~/.multi-agent`);
      continue;
    }
    // 只删 workdir 的父 slot 目录（issue|run|thread），避免半残
    const slotDir = resolve(e.path, '..');
    if (!safeUnder(root, slotDir)) {
      errors.push(`${e.id}: parent unsafe`);
      continue;
    }
    try {
      rmSync(slotDir, { recursive: true, force: true });
      deleted.push(e.id);
    } catch (err) {
      errors.push(
        `${e.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { deleted, skipped, errors };
}
