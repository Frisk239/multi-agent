'use client';

import { useEffect, useMemo, useState } from 'react';
import { useComments, useIssue, useIssueRunUsage, useRuns } from '@/lib/api';
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


const PROPS_OPEN_KEY = 'ma-issue-props-open';

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

/**
 * Multica 对齐：
 * - 主列 = 标题/描述/子 issue/动态/回复 + 执行日志
 * - 右栏 = **属性**（可展开/收拢，不是问答 Helper）G26/G27
 * - G23 事件时间线可展开抽屉
 * - replyZoneTestId：Inbox 等嵌入场景可标 `inbox-reply-zone`
 */
export function IssueDetail({
  id,
  replyZoneTestId,
}: {
  id: string;
  /** 覆盖回复区 testid（Inbox 用 inbox-reply-zone） */
  replyZoneTestId?: string;
}) {
  const { data: issue, isLoading: il, error: ie } = useIssue(id);
  const { data: comments, isLoading: cl } = useComments(id);
  const { data: runs = [] } = useRuns(id);
  const { data: usage } = useIssueRunUsage(id);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [execOpen, setExecOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(true);
  const [activityTab, setActivityTab] = useState<'comments' | 'activity'>('comments');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPropsOpen(readPropsOpen());
    setHydrated(true);
  }, []);

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
    selectedRun?.status === 'queued' || selectedRun?.status === 'running';

  useEffect(() => {
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
  }, [il, cl, ie, issue, id]);

  useEffect(() => {
    if (live) setExecOpen(true);
  }, [live]);

  if (il || cl) return <div className="issue-detail">加载中…</div>;
  if (ie || !issue) return <div className="issue-detail">Issue 不存在</div>;

  const historyCount = runs.length;
  const commentCount = comments?.length ?? 0;
  const showProps = hydrated ? propsOpen : true;

  return (
    <ErrorBoundary resetKeys={[id]}>
      <div
        className={`issue-detail issue-detail--multica issue-detail--with-props${
        showProps ? '' : ' issue-detail--props-collapsed'
      }`}
      data-testid="issue-detail"
      data-props-open={showProps ? '1' : '0'}
    >
      <div className="issue-detail-layout" data-testid="issue-detail-layout">
        <div className="issue-detail-main" data-testid="issue-detail-main">
          <IssueHeader
            issue={issue}
            variant="main"
            endActions={
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
            }
          />
          <IssueSubtasks parent={issue} />

          <section className="issue-activity" data-testid="issue-activity">
            <div className="issue-section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h3 className="issue-section-title" style={{ margin: 0 }}>动态</h3>
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
              </div>
            </div>
            {activityTab === 'comments' ? (
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
            }`}
            data-testid="issue-exec-section"
          >
            <div className="issue-exec-head-row">
              <button
                type="button"
                className="issue-exec-toggle"
                data-testid="issue-exec-toggle"
                aria-expanded={execOpen}
                onClick={() => setExecOpen((v) => !v)}
              >
                <span className="issue-section-title">运行</span>
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
              {selectedRun ? (
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
                  onOpenTimeline={(runId) => {
                    setSelectedRunId(runId);
                    setTimelineOpen(true);
                  }}
                />
                {historyCount > 1 || usage ? (
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
                <RunEventTimelineInline
                  run={selectedRun}
                  onOpenDrawer={() => setTimelineOpen(true)}
                />
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
            {usage ? (
              <div className="issue-props-card mt-4 p-4 border rounded shadow-sm text-sm" data-testid="issue-token-usage">
                <h4 className="font-semibold mb-2">Token 消耗统计</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>Input: <span className="text-dim">{usage.tokensInput || 0}</span></div>
                  <div>Output: <span className="text-dim">{usage.tokensOutput || 0}</span></div>
                  <div>Cache Read: <span className="text-dim">{usage.tokensCacheRead || 0}</span></div>
                  <div>Cache Write: <span className="text-dim">{usage.tokensCacheWrite || 0}</span></div>
                  <div className="col-span-2 font-medium mt-1">Total: {
                    (usage.tokensInput || 0) + (usage.tokensOutput || 0) + (usage.tokensCacheRead || 0) + (usage.tokensCacheWrite || 0)
                  }</div>
                </div>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      <RunEventTimelineDrawer
        run={selectedRun}
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
      />
    </div>
    </ErrorBoundary>
  );
}
