import type { EnqueueSkipReason } from '@ma/shared';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { squads } from '../db/schema.js';

/**
 * Synchronous lifecycle guard for paths which would create a *new* Squad
 * leader-context run. It intentionally does not participate in worker claim:
 * archive-before-existing queued/running runs must retain their old Squad
 * briefing and continue as historical work.
 */
export type SquadDispatchGate =
  | { ok: true; squad: typeof squads.$inferSelect }
  | {
      ok: false;
      squad: null;
      reason: 'squad_missing';
      detail: string;
    }
  | {
      ok: false;
      squad: typeof squads.$inferSelect;
      reason: 'squad_archived';
      detail: string;
    };

export function checkSquadDispatchGate(squadId: string): SquadDispatchGate {
  const squad = db.select().from(squads).where(eq(squads.id, squadId)).get();
  if (!squad) {
    return {
      ok: false,
      squad: null,
      reason: 'squad_missing',
      detail: `小队不存在: ${squadId}`,
    };
  }
  if (squad.archivedAt != null) {
    return {
      ok: false,
      squad,
      reason: 'squad_archived',
      detail: `小队「${squad.name}」已归档，仅保留历史记录，不能再派发`,
    };
  }
  return { ok: true, squad };
}

export function isSquadArchivedReason(
  reason: EnqueueSkipReason | null | undefined,
): boolean {
  return reason === 'squad_archived';
}
