'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { ActivityLog, AgentRun, Comment } from '@ma/shared';
import { useActivities, useComments, useRuns } from '@/lib/api';
import {
  mergeIssueStoryline,
  type StorylineItem,
} from '@/lib/issue-storyline';
import { TimelineItemView } from './TimelineItem';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';

const STATUS_ZH: Record<string, string> = {
  backlog: '待规划',
  todo: '待办',
  in_progress: '进行中',
  in_review: '审核中',
  done: '已完成',
  blocked: '阻塞',
  cancelled: '已取消',
};

const RUN_STATUS_ZH: Record<string, string> = {
  queued: '排队中',
  running: '运行中',
  waiting_local_directory: '等待本机目录',
  completed: '已完成',
  failed: '失败',
  timed_out: '超时',
  cancelled: '已取消',
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function activityTitle(event: ActivityLog): { icon: string; title: string; color: string } {
  if (event.eventType === 'run_auto_retry_scheduled') {
    return { icon: '🔁', title: 'Run 自动重试入队', color: 'var(--color-blue, #60a5fa)' };
  }
  switch (event.eventType) {
    case 'status_changed':
      return { icon: '🔄', title: '状态变更', color: 'var(--accent)' };
    case 'assignee_changed':
      return { icon: '👤', title: '指派变更', color: 'var(--color-purple, #a78bfa)' };
    case 'priority_changed':
      return { icon: '⚡', title: '优先级变更', color: 'var(--color-orange, #fb923c)' };
    case 'run_started':
      return { icon: '🚀', title: 'Run 开始', color: 'var(--color-blue, #60a5fa)' };
    case 'run_completed':
      return { icon: '✅', title: 'Run 完成', color: 'var(--color-green, #4ade80)' };
    case 'run_failed':
      return { icon: '❌', title: 'Run 失败', color: 'var(--color-red, #f87171)' };
    case 'run_deferred':
      return { icon: '⏳', title: 'Deferred', color: 'var(--color-orange, #fb923c)' };
    case 'squad_escalated':
      return { icon: '🚨', title: '小队升级', color: 'var(--color-red, #f87171)' };
    case 'comment_created':
      return { icon: '💬', title: '评论', color: 'var(--text-dim)' };
    default:
      return { icon: '📌', title: event.eventType, color: 'var(--text-dim)' };
  }
}

function ActivityStoryRow({ act }: { act: ActivityLog }) {
  const badge = activityTitle(act);
  const p = act.payload as Record<string, unknown> | null | undefined;
  return (
    <div
      className="storyline-item storyline-item--activity"
      data-testid="storyline-item"
      data-kind="activity"
      data-event-type={act.eventType}
    >
      <span className="storyline-item-icon" aria-hidden>
        {badge.icon}
      </span>
      <div className="storyline-item-body">
        <div className="storyline-item-meta">
          <span style={{ fontWeight: 600, fontSize: 13, color: badge.color }}>
            {act.actorName} · {badge.title}
          </span>
          <span className="text-dim text-xs">{formatTime(act.createdAt)}</span>
        </div>
        {p ? (
          <div className="text-sm storyline-item-detail">
            {act.eventType === 'status_changed' ? (
              <span>
                状态由{' '}
                <code className="run-pill">
                  {STATUS_ZH[String(p.from)] ?? String(p.from)}
                </code>{' '}
                变为{' '}
                <code className="run-pill">
                  {STATUS_ZH[String(p.to)] ?? String(p.to)}
                </code>
              </span>
            ) : null}
            {act.eventType === 'priority_changed' ? (
              <span>
                优先级由 <code>{String(p.from ?? '无')}</code> 调整为{' '}
                <code>{String(p.to ?? '无')}</code>
              </span>
            ) : null}
            {act.eventType === 'assignee_changed' ? (
              <span>
                指派调整为: <code>{String(p.to ?? '未指派')}</code>
              </span>
            ) : null}
            {act.eventType === 'run_auto_retry_scheduled' && p.childRunId ? (
              <Link
                href={`/runs/${encodeURIComponent(String(p.childRunId))}`}
                data-testid="storyline-auto-retry-child"
                style={{ textDecoration: 'underline' }}
              >
                查看自动重试子 Run {String(p.childRunId).slice(0, 8)}
              </Link>
            ) : null}
            {p.error ? (
              <span className="text-red" style={{ marginLeft: 4 }}>
                ({String(p.error)})
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RunStoryRow({
  item,
  onOpenRun,
}: {
  item: Extract<StorylineItem, { kind: 'run' }>;
  onOpenRun?: (runId: string) => void;
}) {
  const { runId, status, error, runtime } = item.payload;
  const label = RUN_STATUS_ZH[status] ?? status;
  const clickable = Boolean(onOpenRun);
  return (
    <div
      className={`storyline-item storyline-item--run${clickable ? ' is-clickable' : ''}`}
      data-testid="storyline-item"
      data-kind="run"
      data-run-id={runId}
      data-run-status={status}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onOpenRun?.(runId) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenRun?.(runId);
              }
            }
          : undefined
      }
      title={clickable ? '打开运行时间线' : undefined}
    >
      <span className="storyline-item-icon" aria-hidden>
        ▶️
      </span>
      <div className="storyline-item-body">
        <div className="storyline-item-meta">
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            Run · {label}
            {runtime ? (
              <span className="text-dim" style={{ fontWeight: 400, marginLeft: 6 }}>
                {runtime}
              </span>
            ) : null}
          </span>
          <span className="text-dim text-xs">{formatTime(item.createdAt)}</span>
        </div>
        <div className="text-sm storyline-item-detail text-dim">
          <code className="run-pill">{runId.slice(0, 8)}</code>
          {error ? (
            <span className="text-red" style={{ marginLeft: 8 }}>
              {error}
            </span>
          ) : null}
          {clickable ? (
            <span className="storyline-run-open-hint" style={{ marginLeft: 8 }}>
              查看时间线
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StorylineRows({
  items,
  onOpenRun,
}: {
  items: StorylineItem[];
  onOpenRun?: (runId: string) => void;
}) {
  return (
    <div className="issue-storyline-list" data-testid="issue-storyline-list">
      {items.map((item) => {
        if (item.kind === 'comment') {
          return (
            <div
              key={`c:${item.id}`}
              className="storyline-item storyline-item--comment"
              data-testid="storyline-item"
              data-kind="comment"
            >
              <TimelineItemView item={item.payload} />
            </div>
          );
        }
        if (item.kind === 'activity') {
          return <ActivityStoryRow key={`a:${item.id}`} act={item.payload} />;
        }
        return (
          <RunStoryRow
            key={`r:${item.id}`}
            item={item}
            onOpenRun={onOpenRun}
          />
        );
      })}
    </div>
  );
}

/**
 * Issue 故事线：comment + activity + run 锚点客户端 merge。
 * 可注入数据（测试）或内部拉取 hooks。
 */
export function IssueStoryline({
  issueId,
  comments: commentsProp,
  activities: activitiesProp,
  runs: runsProp,
  onOpenRun,
  compact = false,
}: {
  issueId: string;
  comments?: Comment[] | null;
  activities?: ActivityLog[] | null;
  runs?: AgentRun[] | null;
  /** run 行点击：打开既有 RunEventTimelineDrawer */
  onOpenRun?: (runId: string) => void;
  /** sheet 精简样式 */
  compact?: boolean;
}) {
  const commentsQ = useComments(commentsProp === undefined ? issueId : '');
  const activitiesQ = useActivities(activitiesProp === undefined ? issueId : '');
  const runsQ = useRuns(runsProp === undefined ? issueId : '');

  const comments = commentsProp !== undefined ? commentsProp : commentsQ.data;
  const activities =
    activitiesProp !== undefined ? activitiesProp : activitiesQ.data;
  const runs = runsProp !== undefined ? runsProp : runsQ.data;

  const loading =
    commentsProp === undefined &&
    (commentsQ.isLoading || activitiesQ.isLoading || runsQ.isLoading);
  const isError =
    commentsProp === undefined &&
    (commentsQ.isError || activitiesQ.isError || runsQ.isError);

  const items = useMemo(
    () => mergeIssueStoryline(comments, activities, runs),
    [comments, activities, runs],
  );

  if (loading) {
    return (
      <div
        className={`issue-storyline${compact ? ' issue-storyline--compact' : ''}`}
        data-testid="issue-storyline"
        data-state="loading"
      >
        <Skeleton variant="text" lines={3} />
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className={`issue-storyline${compact ? ' issue-storyline--compact' : ''}`}
        data-testid="issue-storyline"
        data-state="error"
      >
        <ErrorState
          title="故事线加载失败"
          description="无法合并评论 / 活动 / 运行"
          onRetry={() => {
            void commentsQ.refetch();
            void activitiesQ.refetch();
            void runsQ.refetch();
          }}
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={`issue-storyline${compact ? ' issue-storyline--compact' : ''}`}
        data-testid="issue-storyline"
        data-state="empty"
      >
        <p className="text-dim text-sm" data-testid="issue-storyline-empty">
          还没有故事线 — 评论、状态变更与运行会出现在这里
        </p>
      </div>
    );
  }

  return (
    <div
      className={`issue-storyline${compact ? ' issue-storyline--compact' : ''}`}
      data-testid="issue-storyline"
      data-state="ready"
      data-count={items.length}
    >
      <StorylineRows items={items} onOpenRun={onOpenRun} />
    </div>
  );
}
