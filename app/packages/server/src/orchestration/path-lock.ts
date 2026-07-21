// C1 UX Trust：同 project_local 本机目录简易串行（学 Multica path mutex 语义，非文件锁）。
// 仅 cwd_mode=project_local 占锁；isolated / chat_scratch / workspace 不锁。

import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  agentRuns,
  chatThreads,
  issues,
  projects,
} from '../db/schema.js';
import {
  isUsableLocalDirectory,
  normalizeProjectLocalPath,
  resolveRunCwd,
} from '../runtime/resolve-run-cwd.js';
import type { AgentRun } from '@ma/shared';

export type PathHolder = {
  id: string;
  issueId: string | null;
  agentId: string;
  cwdPath: string;
};

/** Win 友好：绝对路径 normalize + lower，统一斜杠 */
export function normalizePathLockKey(path: string): string {
  const n = normalizeProjectLocalPath(path.trim());
  if (!n) return '';
  return n.replace(/\\/g, '/').toLowerCase();
}

export function findRunningProjectLocalHolder(
  path: string,
  excludeRunId?: string | null,
): PathHolder | null {
  const key = normalizePathLockKey(path);
  if (!key) return null;

  const rows = db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, 'running'))
    .all();

  for (const row of rows) {
    if (excludeRunId && row.id === excludeRunId) continue;
    if ((row.cwdMode as string | null) !== 'project_local') continue;
    const p = row.cwdPath?.trim();
    if (!p) continue;
    if (normalizePathLockKey(p) === key) {
      return {
        id: row.id,
        issueId: row.issueId ?? null,
        agentId: row.agentId,
        cwdPath: p,
      };
    }
  }
  return null;
}

/**
 * 从 run 行解析「若开工将使用的」项目本机路径（不创建隔离目录）。
 * 无 project / 路径无效 → null（不参与 path 锁）。
 */
export function resolveIntendedProjectLocalPath(
  runRow: typeof agentRuns.$inferSelect,
): string | null {
  const kind = (runRow.kind as string) ?? 'issue';
  let raw: string | null = null;

  if (kind === 'chat' && runRow.chatThreadId) {
    const thr = db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.id, runRow.chatThreadId))
      .get();
    if (thr?.projectId) {
      const proj = db
        .select()
        .from(projects)
        .where(eq(projects.id, thr.projectId))
        .get();
      raw = proj?.localPath?.trim() || null;
    }
  } else if (kind === 'quick_create' && runRow.projectId) {
    const proj = db
      .select()
      .from(projects)
      .where(eq(projects.id, runRow.projectId))
      .get();
    raw = proj?.localPath?.trim() || null;
  } else if (runRow.issueId && kind !== 'chat') {
    const issueRow = db
      .select()
      .from(issues)
      .where(eq(issues.id, runRow.issueId))
      .get();
    if (issueRow?.projectId) {
      const proj = db
        .select()
        .from(projects)
        .where(eq(projects.id, issueRow.projectId))
        .get();
      raw = proj?.localPath?.trim() || null;
    }
  }

  // 已落库的 project_local 优先（含排队时预写）
  if (!raw && runRow.cwdMode === 'project_local' && runRow.cwdPath?.trim()) {
    raw = runRow.cwdPath.trim();
  }

  if (!raw) return null;
  const path = normalizeProjectLocalPath(raw);
  if (!path || !isUsableLocalDirectory(path)) return null;
  return path;
}

/** claim 前：是否应因 path 被占而跳过（仍保持 queued） */
export function shouldDeferClaimForPath(
  runRow: typeof agentRuns.$inferSelect,
  /** 本 tick 已 claim 的 path key，防同批双开 */
  claimedKeysThisTick?: Set<string>,
): { defer: true; path: string; holder: PathHolder | null } | { defer: false; path: string | null } {
  const path = resolveIntendedProjectLocalPath(runRow);
  if (!path) return { defer: false, path: null };

  const key = normalizePathLockKey(path);
  if (claimedKeysThisTick?.has(key)) {
    const holder = findRunningProjectLocalHolder(path, runRow.id);
    return { defer: true, path, holder };
  }

  const holder = findRunningProjectLocalHolder(path, runRow.id);
  if (holder) return { defer: true, path, holder };
  return { defer: false, path };
}

/** 预写 cwd 审计，便于排队 UI 显示「项目本机」路径 */
export function stampProjectLocalCwdPreview(
  runId: string,
  path: string,
): void {
  try {
    db.update(agentRuns)
      .set({ cwdPath: path, cwdMode: 'project_local' })
      .where(eq(agentRuns.id, runId))
      .run();
  } catch {
    /* ignore */
  }
}

export function attachPathLockFields(run: AgentRun): AgentRun {
  if (run.status !== 'queued' && run.status !== 'running') {
    return {
      ...run,
      pathWaitReason: null,
      pathBlockedByRunId: null,
      pathHolding: false,
    };
  }

  let path =
    run.cwdMode === 'project_local' && run.cwdPath?.trim()
      ? run.cwdPath.trim()
      : null;

  // queued 尚未 stamp 时：无法从 AgentRun 反查 DB project——list 层应用 row 再 enrich
  if (!path) {
    return {
      ...run,
      pathWaitReason: null,
      pathBlockedByRunId: null,
      pathHolding: false,
    };
  }

  if (run.status === 'running' && run.cwdMode === 'project_local') {
    return {
      ...run,
      pathWaitReason: null,
      pathBlockedByRunId: null,
      pathHolding: true,
    };
  }

  if (run.status === 'queued') {
    const holder = findRunningProjectLocalHolder(path, run.id);
    if (holder) {
      return {
        ...run,
        pathWaitReason: 'path_busy',
        pathBlockedByRunId: holder.id,
        pathHolding: false,
      };
    }
  }

  return {
    ...run,
    pathWaitReason: null,
    pathBlockedByRunId: null,
    pathHolding: false,
  };
}

/**
 * 从 DB 行 enrich（queued 无 cwd 时解析 intended path）。
 */
export function enrichRunRowWithPathLock(
  row: typeof agentRuns.$inferSelect,
  base: AgentRun,
): AgentRun {
  let run = base;
  if (
    (row.status === 'queued' || row.status === 'running') &&
    !(run.cwdMode === 'project_local' && run.cwdPath)
  ) {
    const intended = resolveIntendedProjectLocalPath(row);
    if (intended) {
      // 仅展示用，不写库（写库在 worker defer 时做）
      run = {
        ...run,
        cwdPath: run.cwdPath ?? intended,
        cwdMode: run.cwdMode ?? 'project_local',
      };
    }
  }
  return attachPathLockFields(run);
}

/** 自检 / 脚本：解析 + 占锁探测 */
export function pathLockSelfCheck(pathA: string, pathB: string): {
  sameKey: boolean;
  keyA: string;
  keyB: string;
} {
  return {
    sameKey: normalizePathLockKey(pathA) === normalizePathLockKey(pathB),
    keyA: normalizePathLockKey(pathA),
    keyB: normalizePathLockKey(pathB),
  };
}

// re-export for tests that only need resolve shape
export { resolveRunCwd };
