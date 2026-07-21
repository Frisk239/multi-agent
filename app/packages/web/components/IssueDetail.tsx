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
 */
export function IssueDetail({ id }: { id: string }) {
  const { data: issue, isLoading: il, error: ie } = useIssue(id);
  const { data: comments, isLoading: cl } = useComments(id);
  const { data: runs = [] } = useRuns(id);
  const { data: usage } = useIssueRunUsage(id);
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [execOpen, setExecOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(true);
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
    <div
      className={`issue-detail issue-detail--multica issue-detail--with-props${
        showProps ? '' : ' issue-detail--props-collapsed'
      }`}
      data-testid="issue-detail"
      data-props-open={showProps ? '1' : '0'}
    >
      <div className="issue-detail-layout" data-testid="issue-detail-layout">
        <div className="issue-detail-main" data-testid="issue-detail-main">
          <div className="issue-detail-main-toolbar" data-testid="issue-props-toolbar">
            <button
              type="button"
              className={`issue-props-toggle${showProps ? ' is-open' : ''}`}
              data-testid="issue-props-toggle"
              aria-expanded={showProps}
              aria-controls="issue-props-rail"
              title={showProps ? '收起属性' : '展开属性'}
              onClick={toggleProps}
            >
              <span className="issue-props-toggle-icon" aria-hidden>
                {showProps ? '⟩' : '⟨'}
              </span>
              属性
            </button>
          </div>

          <IssueHeader issue={issue} variant="main" />
          <IssueSubtasks parent={issue} />

          <section className="issue-activity" data-testid="issue-activity">
            <div className="issue-activity-head">
              <h3 className="issue-activity-title">动态</h3>
              <span className="text-dim text-sm">
                {commentCount > 0 ? `${commentCount} 条` : '暂无'}
              </span>
            </div>
            <Timeline items={comments ?? []} />
            <CommentComposer issueId={id} />
          </section>

          <section className="issue-exec-section" data-testid="issue-exec-section">
            <button
              type="button"
              className="issue-exec-toggle"
              data-testid="issue-exec-toggle"
              aria-expanded={execOpen}
              onClick={() => setExecOpen((v) => !v)}
            >
              <span>执行日志</span>
              <span className="text-dim text-sm">
                {historyCount > 0
                  ? live
                    ? `进行中 · ${historyCount} 次运行`
                    : `历史运行（${historyCount}）`
                  : '无运行'}
              </span>
              <span className="issue-exec-chevron" aria-hidden>
                {execOpen ? '▾' : '▸'}
              </span>
            </button>
            {execOpen ? (
              <div className="issue-exec-body" data-testid="issue-exec-body">
                <RunStatusBar
                  issueId={id}
                  onOpenTimeline={(runId) => {
                    setSelectedRunId(runId);
                    setTimelineOpen(true);
                  }}
                />
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
                className="btn-ghost btn-sm"
                data-testid="issue-props-collapse"
                aria-label="收起属性"
                onClick={toggleProps}
              >
                收起
              </button>
            </div>
            <IssueHeader issue={issue} variant="props" />
          </aside>
        ) : null}
      </div>

      <RunEventTimelineDrawer
        run={selectedRun}
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
      />
    </div>
  );
}
