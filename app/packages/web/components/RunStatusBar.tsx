'use client';
import { useRuns, useCancelRun } from '@/lib/api';

export function RunStatusBar({ issueId }: { issueId: string }) {
  const { data: runs = [] } = useRuns(issueId);
  const cancel = useCancelRun();

  const active = runs.find((r) => r.status === 'queued' || r.status === 'running') ?? runs[0];
  if (!active) return <p className="run-status-hint">指派 agent 后自动执行</p>;

  const canStop = active.status === 'queued' || active.status === 'running';

  return (
    <div className="run-status-bar" data-run-status={active.status}>
      <span className="run-status-pill">
        运行 {active.status} · {active.runtime}
        {active.error ? ` · ${active.error}` : ''}
      </span>
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
