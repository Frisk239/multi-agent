import type { ActivityLog, AgentRun, Comment } from '@ma/shared';

/** 客户端合并后的 Issue 故事线条目（Slice 72） */
export type StorylineItem =
  | {
      kind: 'comment';
      id: string;
      createdAt: string;
      payload: Comment;
    }
  | {
      kind: 'activity';
      id: string;
      createdAt: string;
      payload: ActivityLog;
    }
  | {
      kind: 'run';
      id: string;
      createdAt: string;
      payload: {
        runId: string;
        status: string;
        agentId?: string | null;
        error?: string | null;
        runtime?: string | null;
      };
    };

export type MergeIssueStorylineInput = {
  comments?: Comment[] | null;
  activities?: ActivityLog[] | null;
  runs?: AgentRun[] | null;
};

function ts(iso: string | null | undefined): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

function commentIdsFromPayload(payload: ActivityLog['payload']): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const ids: string[] = [];
  for (const key of ['commentId', 'comment_id', 'id'] as const) {
    const v = p[key];
    if (typeof v === 'string' && v.length > 0) ids.push(v);
  }
  return ids;
}

/** Run ids referenced by run lifecycle activities (for storyline de-dup). */
function runIdsFromRunLifecycleActivity(a: ActivityLog): string[] {
  if (typeof a.eventType !== 'string' || !a.eventType.startsWith('run_')) {
    return [];
  }
  if (!a.payload || typeof a.payload !== 'object') return [];
  const p = a.payload as Record<string, unknown>;
  const ids: string[] = [];
  for (const key of ['runId', 'run_id', 'agentRunId', 'agent_run_id'] as const) {
    const v = p[key];
    if (typeof v === 'string' && v.length > 0) ids.push(v);
  }
  return ids;
}

/**
 * 合并 comment + activity + run 锚点，按 createdAt 升序（故事线阅读序）。
 *
 * 去重：
 * - `comment_created` 且 payload 指向已存在 comment → 跳过该 activity
 * - `run_*` activity 且 payload 指向已存在 run → 跳过该 activity（保留 run 锚点）
 * - 同 id 只保留一条（comments / activities / runs 各自 id 前缀隔离）
 */
export function mergeIssueStoryline(
  comments: Comment[] | null | undefined,
  activities: ActivityLog[] | null | undefined,
  runs?: AgentRun[] | null,
): StorylineItem[] {
  const commentList = comments ?? [];
  const activityList = activities ?? [];
  const runList = runs ?? [];

  const commentIdSet = new Set(commentList.map((c) => c.id));
  const items: StorylineItem[] = [];
  const seen = new Set<string>();

  for (const c of commentList) {
    const key = `comment:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      kind: 'comment',
      id: c.id,
      createdAt: c.createdAt,
      payload: c,
    });
  }

  // Prefer the structured run anchor when both a run row and a run_* activity exist.
  const runIdSet = new Set(runList.map((r) => r.id));

  for (const a of activityList) {
    if (a.eventType === 'comment_created') {
      const linked = commentIdsFromPayload(a.payload);
      if (linked.some((id) => commentIdSet.has(id))) {
        continue;
      }
      // 无 commentId 时：若同秒附近已有同 actor 评论，宽松跳过一次重复噪声
      // 单测钉的是显式 commentId 路径；此处仅在 payload 有 commentId 且命中时跳过
    }

    // Hard gap F3: skip run_* activities when a run row already anchors the storyline.
    const runLinked = runIdsFromRunLifecycleActivity(a);
    if (runLinked.some((id) => runIdSet.has(id))) {
      continue;
    }

    const key = `activity:${a.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      kind: 'activity',
      id: a.id,
      createdAt: a.createdAt,
      payload: a,
    });
  }

  for (const r of runList) {
    const key = `run:${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      kind: 'run',
      id: r.id,
      createdAt: r.createdAt,
      payload: {
        runId: r.id,
        status: r.status,
        agentId: r.agentId,
        error: r.error,
        runtime: r.runtime,
      },
    });
  }

  items.sort((a, b) => {
    const d = ts(a.createdAt) - ts(b.createdAt);
    if (d !== 0) return d;
    // 稳定次序：comment < activity < run，再比 id
    const rank = { comment: 0, activity: 1, run: 2 } as const;
    const rd = rank[a.kind] - rank[b.kind];
    if (rd !== 0) return rd;
    return a.id.localeCompare(b.id);
  });

  return items;
}

/** 对象入参形式，便于测试与可选字段 */
export function mergeIssueStorylineFrom(
  input: MergeIssueStorylineInput,
): StorylineItem[] {
  return mergeIssueStoryline(input.comments, input.activities, input.runs);
}
