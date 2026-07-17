'use client';

import Link from 'next/link';
import { classifyRunFailure } from '@ma/shared';
import { useRuns, useCancelRun, useRerunIssue, useRetryRun } from '@/lib/api';
import { useRunProgressStore } from '@/lib/ws';

export function RunStatusBar({ issueId }: { issueId: string }) {
  const { data: runs = [] } = useRuns(issueId);
  const cancel = useCancelRun();
  const rerunIssue = useRerunIssue(issueId);
  const retryRun = useRetryRun();
  const progressByRun = useRunProgressStore((s) => s.byRunId);

  const active = runs.find((r) => r.status === 'queued' || r.status === 'running') ?? runs[0];
  if (!active) return <p className="run-status-hint">指派 agent 后自动执行</p>;

  const canStop = active.status === 'queued' || active.status === 'running';
  const canRerun = active.status === 'failed' || active.status === 'cancelled';
  const progress =
    active.status === 'running' ? progressByRun[active.id]?.trim() : undefined;
  const failure =
    active.status === 'failed' || active.error
      ? classifyRunFailure(active.error)
      : null;

  return (
    <div className="run-status-bar" data-run-status={active.status}>
      <div className="run-status-main">
        <span className="run-status-pill">
          {active.isLeader && <span className="leader-badge">队长</span>}
          运行 {active.status} · {active.runtime}
          {active.error ? ` · ${active.error}` : ''}
        </span>
        {progress ? (
          <p className="run-progress-text" title={progress}>
            {progress}
          </p>
        ) : null}
        {failure ? (
          <div className="run-failure-box">
            <strong>{failure.title}</strong>
            <p className="text-sm">{failure.hint}</p>
            {active.error ? <pre className="run-error-pre">{active.error}</pre> : null}
            <div className="run-failure-actions">
              {failure.settingsHref ? (
                <Link href={failure.settingsHref} className="btn-secondary btn-sm">
                  打开诊断
                </Link>
              ) : null}
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  if (active.error) void navigator.clipboard?.writeText(active.error);
                }}
              >
                复制错误
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="run-status-actions">
        {canStop && (
          <button
            type="button"
            className="btn-stop"
            onClick={() => cancel.mutate(active.id)}
            disabled={cancel.isPending}
          >
            停止
          </button>
        )}
        {canRerun && (
          <>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={rerunIssue.isPending}
              onClick={() => rerunIssue.mutate({})}
              title="按当前 Issue 指派再排队"
            >
              再执行 Issue
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={retryRun.isPending}
              onClick={() => retryRun.mutate(active.id)}
              title="按该历史 run 的 agent 再排队"
            >
              再执行此 run
            </button>
          </>
        )}
      </div>
    </div>
  );
}
