/**
 * Slice 46 · 看板卡 live 态
 * 从 workspace runs 聚合到单卡展示态（纯函数，便于单测）。
 */

export type IssueCardLiveInput = {
  /** 该 issue 是否有 queued/running run；boolean / 计数 / 数组均可 */
  activeRuns?: boolean | number | ReadonlyArray<unknown> | null;
  /** 该 issue 是否有最近 failed run；boolean / 计数 / 数组均可 */
  recentFailed?: boolean | number | ReadonlyArray<unknown> | null;
};

export type IssueCardLiveState = {
  /** 有活跃 run → 呼吸/脉冲 live */
  live: boolean;
  /** 有最近失败（不论是否被 live 覆盖） */
  failed: boolean;
  /** 展示失败标记：failed 且非 live（active 优先，避免噪声叠层） */
  showFailed: boolean;
};

function asPresent(v: boolean | number | ReadonlyArray<unknown> | null | undefined): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0;
  return v.length > 0;
}

/**
 * 从 runs 标记推导卡面 live/failed 展示态。
 * 规则：有 active → live；有 failed 且非 live → showFailed。
 */
export function deriveIssueCardLive(input: IssueCardLiveInput): IssueCardLiveState {
  const live = asPresent(input.activeRuns);
  const failed = asPresent(input.recentFailed);
  return {
    live,
    failed,
    showFailed: failed && !live,
  };
}

export type RunIssueRef = {
  issueId?: string | null;
};

/** 从 runs 列表收集有 issueId 的 issue 集合（active / failed 共用） */
export function issueIdsFromRuns(
  runs: ReadonlyArray<RunIssueRef> | null | undefined,
): Set<string> {
  const s = new Set<string>();
  if (!runs) return s;
  for (const r of runs) {
    if (r.issueId) s.add(r.issueId);
  }
  return s;
}

/**
 * 合并 running + queued 等 active 列表为 issue id 集合。
 */
export function collectActiveIssueIds(
  ...runLists: Array<ReadonlyArray<RunIssueRef> | null | undefined>
): Set<string> {
  const s = new Set<string>();
  for (const list of runLists) {
    if (!list) continue;
    for (const r of list) {
      if (r.issueId) s.add(r.issueId);
    }
  }
  return s;
}
