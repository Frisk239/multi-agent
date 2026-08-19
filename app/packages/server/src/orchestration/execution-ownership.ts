import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runExecutionOwners } from '../db/schema.js';
import {
  captureProcessIdentity,
} from '../runtime/process-identity.js';

type ExecutionOwnerRow = {
  pid: number | null;
  fingerprint: string | null;
};

export type ExecutionOwnerVerification =
  | { verified: true; pid: number }
  | {
      verified: false;
      reason:
        | 'missing_owner'
        | 'identity_unavailable'
        | 'fingerprint_mismatch'
        | 'unsafe_process_group';
      pid: number | null;
    };

/**
 * Persist a child-process owner after spawn. Only the start fingerprint is
 * stored; neither argv nor environment values are ever written to SQLite.
 */
export function recordExecutionOwnership(
  runId: string,
  pid: number,
  cwdPath: string | null,
  now = Date.now(),
  capture: typeof captureProcessIdentity = captureProcessIdentity,
): { recorded: boolean; reason?: 'identity_unavailable' } {
  const identity = capture(pid);
  if (!identity) return { recorded: false, reason: 'identity_unavailable' };

  db.insert(runExecutionOwners)
    .values({
      runId,
      pid: identity.pid,
      fingerprint: identity.fingerprint,
      cwdPath,
      recordedAt: now,
    })
    .onConflictDoUpdate({
      target: runExecutionOwners.runId,
      set: {
        pid: identity.pid,
        fingerprint: identity.fingerprint,
        cwdPath,
        recordedAt: now,
      },
    })
    .run();

  return { recorded: true };
}

/** Normal executor completion clears the active ownership record. */
export function clearExecutionOwnership(runId: string): void {
  db.delete(runExecutionOwners)
    .where(eq(runExecutionOwners.runId, runId))
    .run();
}

/** Read the active owner sidecar for one run, if it survived a process crash. */
export function getExecutionOwnership(
  runId: string,
): (typeof runExecutionOwners.$inferSelect) | undefined {
  return db.select()
    .from(runExecutionOwners)
    .where(eq(runExecutionOwners.runId, runId))
    .get();
}

/**
 * Re-read the OS identity at recovery time. Any incomplete/changed evidence is
 * a hard "do not kill" result.
 */
export function verifyExecutionOwnership(
  row: ExecutionOwnerRow,
  capture: typeof captureProcessIdentity = captureProcessIdentity,
): ExecutionOwnerVerification {
  const pid = row.pid;
  const fingerprint = row.fingerprint;
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0 || !fingerprint?.trim()) {
    return { verified: false, reason: 'missing_owner', pid: pid ?? null };
  }

  // Distinguish unavailable evidence from a genuine mismatch for diagnostics;
  // both outcomes deliberately prohibit automatic termination.
  const current = capture(pid);
  if (!current) return { verified: false, reason: 'identity_unavailable', pid };
  if (current.fingerprint !== fingerprint) {
    return { verified: false, reason: 'fingerprint_mismatch', pid };
  }
  if (!current.canKillTree) {
    return { verified: false, reason: 'unsafe_process_group', pid };
  }
  return { verified: true, pid };
}
