/**
 * Slice 46 · 看板卡 live 态
 * 从 workspace runs 聚合到单卡展示态（纯函数，便于单测）。
 * G8-1：waiting_local_directory 并入 live，chip 可区分「等目录」。
 */

export type IssueCardLiveInput = {
  /** 该 issue 是否有 queued/running/waiting run；boolean / 计数 / 数组均可 */
  activeRuns?: boolean | number | ReadonlyArray<unknown> | null;
  /**
   * 是否主要为 waiting_local_directory（无 running/queued 时）。
   * 与 active 同时为真时，chip 文案走「等目录」。
   */
  waitingRuns?: boolean | number | ReadonlyArray<unknown> | null;
  /** 该 issue 是否有最近 failed run；boolean / 计数 / 数组均可 */
  recentFailed?: boolean | number | ReadonlyArray<unknown> | null;
};

export type IssueCardLiveKind = 'running' | 'waiting' | null;

export type IssueCardLiveState = {
  /** 有活跃 run（含 waiting）→ 呼吸/脉冲 live */
  live: boolean;
  /** 主要为路径锁等待（无 running/queued 覆盖时） */
  waiting: boolean;
  /** live 时的 chip 语义：running/queued → running；纯 waiting → waiting */
  liveKind: IssueCardLiveKind;
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
 * 规则：有 active → live；waiting 且 live → liveKind=waiting；有 failed 且非 live → showFailed。
 */
export function deriveIssueCardLive(input: IssueCardLiveInput): IssueCardLiveState {
  const live = asPresent(input.activeRuns);
  const waiting = live && asPresent(input.waitingRuns);
  const failed = asPresent(input.recentFailed);
  return {
    live,
    waiting,
    liveKind: !live ? null : waiting ? 'waiting' : 'running',
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
 * 合并 running + queued + waiting_local_directory 等 active 列表为 issue id 集合。
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

/**
 * 仅 waiting 且不在 running/queued 覆盖中的 issue ids（卡面「等目录」chip 用）。
 * running/queued 优先，避免同一 issue 多态时文案冲突。
 */
export function collectWaitingOnlyIssueIds(
  waitingRuns: ReadonlyArray<RunIssueRef> | null | undefined,
  ...runningOrQueuedLists: Array<ReadonlyArray<RunIssueRef> | null | undefined>
): Set<string> {
  const blocked = collectActiveIssueIds(...runningOrQueuedLists);
  const out = new Set<string>();
  if (!waitingRuns) return out;
  for (const r of waitingRuns) {
    if (r.issueId && !blocked.has(r.issueId)) out.add(r.issueId);
  }
  return out;
}
