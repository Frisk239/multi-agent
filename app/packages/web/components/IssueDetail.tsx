'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Issue, IssueStatus } from '@ma/shared';
import { IssueStatus as IssueStatusEnum } from '@ma/shared';
import { API, apiFetch, useComments, useIssue, useIssueRunUsage, useRuns, useUpdateIssue } from '@/lib/api';
import { IssueHeader } from './IssueHeader';
import { Timeline } from './Timeline';
import { CommentComposer } from './CommentComposer';
import { RunStatusBar } from './RunStatusBar';
import { IssueRunHistory } from './IssueRunHistory';
import { IssueSubtasks } from './IssueSubtasks';
import {
  RunEventTimelineDrawer,
  RunEventTimelineInline,
} from './RunEventTimeline';
import { ActivityTimeline } from './ActivityTimeline';
import { ErrorBoundary } from './ErrorBoundary';
import { IssuePrCard } from './IssuePrCard';
import { PageSkeleton } from './Skeleton';
import { AssigneeSelect } from './AssigneeSelect';
import Link from 'next/link';
import { toastSuccess, toastError } from '../lib/toast';

const PROPS_OPEN_KEY = 'ma-issue-props-open';

const STATUS_ZH: Record<IssueStatus, string> = {
  backlog: '待规划',
  todo: '待办',
  in_progress: '进行中',
  in_review: '审核中',
  done: '已完成',
  blocked: '阻塞',
  cancelled: '已取消',
};

const ALL_STATUS = IssueStatusEnum.options;

export type IssueDetailVariant = 'sheet' | 'page';

function pickDefaultRunId(
  runs: { id: string; status: string }[],
): string | undefined {
  return (
    runs.find((r) => r.status === 'queued' || r.status === 'running')?.id ??
    runs[0]?.id
  );
}

function readPropsOpen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(PROPS_OPEN_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return true;
}

/** Sheet 轻量：状态 + 指派（全量属性进全页 / details） */
function IssueSheetMeta({ issue }: { issue: Issue }) {
  const update = useUpdateIssue();
  return (
    <div className="issue-sheet-meta" data-testid="issue-sheet-meta">
      <label className="issue-priority-field">
        <span className="issue-meta-k">状态</span>
        <select
          className="status-select"
          value={issue.status}
          onChange={(e) =>
            update.mutate({
              id: issue.id,
              input: { status: e.target.value as IssueStatus },
            })
          }
          aria-label="状态"
          data-testid="issue-sheet-status"
        >
          {ALL_STATUS.map((s) => (
            <option key={s} value={s}>
              {STATUS_ZH[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="issue-meta-assignee" data-testid="issue-sheet-assignee">
        <span className="issue-meta-k">负责人</span>
        <AssigneeSelect issueId={issue.id} currentAssignee={issue.assignee} />
      </div>
    </div>
  );
}

/**
 * Multica 对齐：
 * - 主列 = 标题/描述/子 issue/动态/回复 + 执行日志
 * - 右栏 = **属性**（可展开/收拢，不是问答 Helper）G26/G27
 * - G23 事件时间线可展开抽屉
 * - replyZoneTestId：Inbox 等嵌入场景可标 `inbox-reply-zone`
 * - variant=sheet：侧滑轻量（标题/状态/指派/评论/最近 run + 错误条）
 */
export function IssueDetail({
  id,
  replyZoneTestId,
  variant = 'page',
}: {
  id: string;
  /** 覆盖回复区 testid（Inbox 用 inbox-reply-zone） */
  replyZoneTestId?: string;
  /** sheet=看板侧滑轻量；page=全页/Inbox 默认 */
  variant?: IssueDetailVariant;
}) {
  const isSheet = variant === 'sheet';
  const { data: issue, isLoading: il, error: ie } = useIssue(id);
  const { data: comments, isLoading: cl } = useComments(id);
  const { data: runs = [] } = useRuns(id);
  const { data: usage } = useIssueRunUsage(isSheet ? '' : id);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [execOpen, setExecOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(true);
  const [activityTab, setActivityTab] = useState<'comments' | 'activity'>('comments');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (isSheet) {
      setHydrated(true);
      return;
    }
    setPropsOpen(readPropsOpen());
    setHydrated(true);
  }, [isSheet]);

  function toggleProps() {
    setPropsOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(PROPS_OPEN_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const defaultRunId = useMemo(() => pickDefaultRunId(runs), [runs]);

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(undefined);
      return;
    }
    setSelectedRunId((prev) => {
      if (prev && runs.some((r) => r.id === prev)) return prev;
      return defaultRunId;
    });
  }, [runs, defaultRunId]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId),
    [runs, selectedRunId],
  );

  const live =
    selectedRun?.status === 'queued' ||
    selectedRun?.status === 'waiting_local_directory' ||
    selectedRun?.status === 'running';
  const runFailed =
    selectedRun?.status === 'failed' ||
    selectedRun?.status === 'timed_out' ||
    Boolean(selectedRun?.error);

  useEffect(() => {
    if (isSheet) return;
    if (il || cl || ie || !issue) return;
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#run-trace') return;
    setExecOpen(true);
    const t = window.setTimeout(() => {
      document.getElementById('run-trace')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, [il, cl, ie, issue, id, isSheet]);

  useEffect(() => {
    if (live) setExecOpen(true);
    else if (isSheet && runFailed) setExecOpen(true);
  }, [live, isSheet, runFailed]);

  if (il || cl) {
    return (
      <div className="issue-detail" data-testid="issue-detail-loading">
        <PageSkeleton />
      </div>
    );
  }
  if (ie || !issue) return <div className="issue-detail">Issue 不存在</div>;

  const historyCount = runs.length;
  const commentCount = comments?.length ?? 0;
  const showProps = !isSheet && (hydrated ? propsOpen : true);

  return (
    <ErrorBoundary resetKeys={[id, variant]}>
      <div
        className={`issue-detail issue-detail--multica${
          isSheet
            ? ' issue-detail--sheet'
            : ` issue-detail--with-props${showProps ? '' : ' issue-detail--props-collapsed'}`
        }`}
        data-testid="issue-detail"
        data-variant={variant}
        data-props-open={isSheet ? '0' : showProps ? '1' : '0'}
      >
        <div className="issue-detail-layout" data-testid="issue-detail-layout">
          <div className="issue-detail-main" data-testid="issue-detail-main">
            <IssueHeader
              issue={issue}
              variant="main"
              endActions={
                isSheet ? (
                  <Link
                    href={`/issues/${issue.id}`}
                    className="btn btn-ghost btn-sm"
                    data-testid="issue-sheet-open-fullpage"
                    title="打开全页详情（属性、知识沉淀、完整日志）"
                  >
                    全页详情
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={`btn btn-ghost btn-sm issue-props-toggle${
                      showProps ? ' is-open' : ''
                    }`}
                    data-testid="issue-props-toggle"
                    aria-expanded={showProps}
                    aria-controls="issue-props-rail"
                    title={showProps ? '收起属性' : '展开属性'}
                    onClick={toggleProps}
                  >
                    {showProps ? '隐藏属性' : '属性'}
                  </button>
                )
              }
            />

            {isSheet ? <IssueSheetMeta issue={issue} /> : null}

            {!isSheet && issue.status === 'done' ? (
              <div className="issue-knowledge-actions bg-slate-50 border border-slate-200 rounded p-4 mb-4 flex items-center justify-between shadow-sm">
                <div>
                  <h4 className="text-sm font-semibold mb-1">已完成，建议沉淀经验</h4>
                  <p className="text-xs text-dim">
                    将执行过程记录至团队 Wiki 或自动提取至 Agent 记忆库，加速未来解决类似问题。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/wiki/new?title=${encodeURIComponent(issue.title)}&issueId=${issue.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    📚 沉淀至 Wiki
                  </Link>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      try {
                        toastSuccess('正在提取 Memory...');
                        const res = await apiFetch(`${API}/memory`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            issueId: issue.id,
                            text: issue.title + '\n' + (issue.description || ''),
                          }),
                        });
                        if (!res.ok) {
                          const text = await res.text();
                          try {
                            const json = JSON.parse(text);
                            throw new Error(json.error || res.statusText);
                          } catch {
                            throw new Error(res.statusText);
                          }
                        }
                        toastSuccess('已记录至 Memory');
                      } catch (e: any) {
                        toastError(`Memory 记录失败: ${e.message}`);
                      }
                    }}
                  >
                    🧠 记录为 Memory
                  </button>
                </div>
              </div>
            ) : null}

            {isSheet ? (
              <details className="issue-sheet-more" data-testid="issue-sheet-more">
                <summary className="issue-sheet-more-summary">更多（子任务 / 全页属性）</summary>
                <div className="issue-sheet-more-body">
                  <IssueSubtasks parent={issue} />
                  <p className="text-dim text-sm" data-testid="issue-sheet-more-hint">
                    标签、项目、自定义字段、PR、Token 与知识沉淀请打开
                    <Link href={`/issues/${issue.id}`} className="table-link">
                      全页详情
                    </Link>
                    。
                  </p>
                </div>
              </details>
            ) : (
              <IssueSubtasks parent={issue} />
            )}

            <section className="issue-activity" data-testid="issue-activity">
              <div
                className="issue-section-head"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 className="issue-section-title" style={{ margin: 0 }}>
                    {isSheet ? '评论' : '动态'}
                  </h3>
                  {isSheet ? (
                    <span className="text-dim text-sm" data-testid="issue-sheet-comment-count">
                      {commentCount}
                    </span>
                  ) : (
                    <div className="kanban-view-tabs" role="tablist" style={{ margin: 0 }}>
                      <button
                        type="button"
                        role="tab"
                        className={`kanban-scope-tab${activityTab === 'comments' ? ' is-active' : ''}`}
                        aria-selected={activityTab === 'comments'}
                        data-testid="activity-tab-comments"
                        onClick={() => setActivityTab('comments')}
                      >
                        评论 ({commentCount})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={`kanban-scope-tab${activityTab === 'activity' ? ' is-active' : ''}`}
                        aria-selected={activityTab === 'activity'}
                        data-testid="activity-tab-log"
                        onClick={() => setActivityTab('activity')}
                      >
                        活动事件流
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {isSheet || activityTab === 'comments' ? (
                <>
                  <Timeline items={comments ?? []} hideHeader />
                  <div
                    className="issue-reply-zone"
                    data-testid={replyZoneTestId ?? 'issue-reply-zone'}
                  >
                    <div className="issue-reply-zone-label text-dim text-sm">读后即回</div>
                    <CommentComposer issueId={id} />
                  </div>
                </>
              ) : (
                <ActivityTimeline issueId={id} />
              )}
            </section>

            <section
              className={`issue-exec-section${execOpen ? ' is-open' : ''}${
                live ? ' is-live' : ''
              }${isSheet ? ' issue-exec-section--sheet' : ''}`}
              data-testid="issue-exec-section"
              data-sheet-light={isSheet ? '1' : '0'}
            >
              <div className="issue-exec-head-row">
                <button
                  type="button"
                  className="issue-exec-toggle"
                  data-testid="issue-exec-toggle"
                  aria-expanded={execOpen}
                  onClick={() => setExecOpen((v) => !v)}
                >
                  <span className="issue-section-title">
                    {isSheet ? '最近运行' : '运行'}
                  </span>
                  <span className="text-dim text-sm" data-testid="issue-exec-summary">
                    {historyCount > 0
                      ? live
                        ? `进行中 · ${historyCount}`
                        : selectedRun?.status === 'failed'
                          ? `失败 · ${historyCount}`
                          : `${historyCount} 次`
                      : '尚未执行'}
                  </span>
                  <span className="issue-exec-chevron" aria-hidden>
                    {execOpen ? '▾' : '▸'}
                  </span>
                </button>
                {!isSheet && selectedRun ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-testid="issue-open-timeline"
                    title="打开运行事件时间线"
                    onClick={() => {
                      setExecOpen(true);
                      setTimelineOpen(true);
                    }}
                  >
                    时间线
                  </button>
                ) : null}
              </div>
              {execOpen ? (
                <div className="issue-exec-body" data-testid="issue-exec-body">
                  <RunStatusBar
                    issueId={id}
                    onOpenTimeline={
                      isSheet
                        ? undefined
                        : (runId) => {
                            setSelectedRunId(runId);
                            setTimelineOpen(true);
                          }
                    }
                  />
                  {!isSheet && (historyCount > 1 || usage) ? (
                    <IssueRunHistory
                      runs={runs}
                      selectedRunId={selectedRunId}
                      onSelect={setSelectedRunId}
                      usage={usage}
                      onOpenTimeline={(runId) => {
                        setSelectedRunId(runId);
                        setTimelineOpen(true);
                      }}
                    />
                  ) : null}
                  {!isSheet ? (
                    <RunEventTimelineInline
                      run={selectedRun}
                      onOpenDrawer={() => setTimelineOpen(true)}
                    />
                  ) : historyCount > 1 ? (
                    <p className="text-dim text-sm" data-testid="issue-sheet-run-more">
                      另有 {historyCount - 1} 次历史运行，详见
                      <Link href={`/issues/${issue.id}#run-trace`} className="table-link">
                        全页执行日志
                      </Link>
                      。
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>

          {showProps ? (
            <aside
              id="issue-props-rail"
              className="issue-props-rail"
              data-testid="issue-props-rail"
            >
              <div className="issue-props-rail-head">
                <h3 className="issue-props-rail-title">属性</h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-testid="issue-props-collapse"
                  aria-label="收起属性"
                  onClick={toggleProps}
                >
                  收起
                </button>
              </div>
              <IssueHeader issue={issue} variant="props" />
              <IssuePrCard issue={issue} />
              {usage ? (
                <div
                  className="issue-props-card mt-4 p-4 border rounded shadow-sm text-sm"
                  data-testid="issue-token-usage"
                >
                  <h4 className="font-semibold mb-2">Token 消耗统计</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      Input: <span className="text-dim">{usage.tokensInput || 0}</span>
                    </div>
                    <div>
                      Output: <span className="text-dim">{usage.tokensOutput || 0}</span>
                    </div>
                    <div>
                      Cache Read:{' '}
                      <span className="text-dim">{usage.tokensCacheRead || 0}</span>
                    </div>
                    <div>
                      Cache Write:{' '}
                      <span className="text-dim">{usage.tokensCacheWrite || 0}</span>
                    </div>
                    <div className="col-span-2 font-medium mt-1">
                      Total:{' '}
                      {(usage.tokensInput || 0) +
                        (usage.tokensOutput || 0) +
                        (usage.tokensCacheRead || 0) +
                        (usage.tokensCacheWrite || 0)}
                    </div>
                    <div className="col-span-2 mt-1" data-testid="issue-usage-cost">
                      费用:{' '}
                      <span
                        className={
                          usage.costUsd != null
                            ? 'text-emerald-400 font-mono'
                            : 'text-amber-400'
                        }
                      >
                        {usage.costUsd != null
                          ? `$${
                              usage.costUsd < 0.01
                                ? usage.costUsd.toFixed(6)
                                : usage.costUsd.toFixed(4)
                            }`
                          : 'uncosted'}
                      </span>
                      {(usage.uncostedRuns ?? 0) > 0 ? (
                        <span className="text-dim text-xs ml-1">
                          · {usage.uncostedRuns} uncosted
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>

        {!isSheet ? (
          <RunEventTimelineDrawer
            run={selectedRun}
            open={timelineOpen}
            onClose={() => setTimelineOpen(false)}
          />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}
