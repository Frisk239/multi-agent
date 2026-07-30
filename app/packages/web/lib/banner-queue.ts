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

/**
 * Pick at most one active banner id by severity (stable by original order on ties).
 */
export function pickTopBannerId(candidates: BannerCandidate[]): string | null {
  let best: { id: string; rank: number; index: number } | null = null;
  candidates.forEach((c, index) => {
    if (!c.active) return;
    const rank = SEVERITY_RANK[c.severity] ?? 99;
    if (!best || rank < best.rank || (rank === best.rank && index < best.index)) {
      best = { id: c.id, rank, index };
    }
  });
  return best?.id ?? null;
}

/** Known global banner ids + default severities (layout stack). */
export const GLOBAL_BANNER_SEVERITY = {
  ws: 'critical' as const,
  env: 'high' as const,
  onboarding: 'low' as const,
} as const;
