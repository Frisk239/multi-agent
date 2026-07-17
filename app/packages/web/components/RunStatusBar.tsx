'use client';

import { useRuns, useCancelRun } from '@/lib/api';
import { useRunProgressStore } from '@/lib/ws';

export function RunStatusBar({ issueId }: { issueId: string }) {
  const { data: runs = [] } = useRuns(issueId);
  const cancel = useCancelRun();
  const progressByRun = useRunProgressStore((s) => s.byRunId);

  const active = runs.find((r) => r.status === 'queued' || r.status === 'running') ?? runs[0];
  if (!active) return <p className="run-status-hint">指派 agent 后自动执行</p>;

  const canStop = active.status === 'queued' || active.status === 'running';
  const progress =
    active.status === 'running' ? progressByRun[active.id]?.trim() : undefined;

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
      </div>
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
    </div>
  );
}
