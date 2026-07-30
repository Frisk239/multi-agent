/**
 * F4 · Global banner severity queue.
 * At most one top-level global banner is shown; higher severity wins.
 */

export type BannerSeverity = 'critical' | 'high' | 'medium' | 'low';

export type BannerCandidate = {
  id: string;
  severity: BannerSeverity;
  /** When false, candidate is ignored. */
  active: boolean;
};

const SEVERITY_RANK: Record<BannerSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type BannerPick = { id: string; rank: number; index: number };

/**
 * Pick at most one active banner id by severity (stable by original order on ties).
 */
export function pickTopBannerId(candidates: BannerCandidate[]): string | null {
  let best: BannerPick | null = null;
  for (let index = 0; index < candidates.length; index++) {
    const c = candidates[index]!;
    if (!c.active) continue;
    const rank = SEVERITY_RANK[c.severity] ?? 99;
    if (
      best === null ||
      rank < best.rank ||
      (rank === best.rank && index < best.index)
    ) {
      best = { id: c.id, rank, index };
    }
  }
  return best === null ? null : best.id;
}

/** Known global banner ids + default severities (layout stack). */
export const GLOBAL_BANNER_SEVERITY = {
  ws: 'critical' as const,
  env: 'high' as const,
  onboarding: 'low' as const,
} as const;
