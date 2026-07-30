'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AgentRun } from '@ma/shared';
import { useCancelRun, useWorkspaceRuns, useRetryRun } from '@/lib/api';

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  return new Date(iso).toLocaleString();
}

const ACTIVE_STATUSES = new Set<AgentRun['status']>([
  'queued',
  'waiting_local_directory',
  'running',
]);

function isActiveRun(run: AgentRun): boolean {
  return ACTIVE_STATUSES.has(run.status);
}

function isRetryableRun(run: AgentRun): boolean {
  return run.status === 'failed' || run.status === 'cancelled' || run.status === 'timed_out';
}

function formatElapsed(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function activeElapsedMs(run: AgentRun, now: number): number | null {
  const waitingStarted =
    run.status === 'waiting_local_directory' &&
    typeof run.waitingLocalEnteredAt === 'number'
      ? run.waitingLocalEnteredAt
      : null;
  const started =
    waitingStarted ?? (run.status === 'running' ? run.startedAt : null) ?? run.createdAt;
  const t = new Date(started).getTime();
  return Number.isFinite(t) ? Math.max(0, now - t) : null;
}

function useLiveClock(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return now;
}

export function SquadRunsTimeline({ squadId }: { squadId: string }) {
  const { data: runs = [], isLoading, isError, refetch, isFetching } =
    useWorkspaceRuns({ squadId, limit: 30, refetchActive: true });

  const activeRuns = runs.filter(isActiveRun);
  const pastRuns = runs.filter((r) => !isActiveRun(r));
  const now = useLiveClock(activeRuns.length > 0);
  const cancel = useCancelRun();
  const retry = useRetryRun();
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const escalatedRuns = runs.filter(r => r.failureReason === 'squad_member_escalated' && r.status === 'failed');

  function runHref(runId: string): string {
    return `/runs?run=${encodeURIComponent(runId)}&timeline=1&status=all`;
  }

  function retryRun(runId: string) {
    setRetryingId(runId);
    retry.mutate(runId, {
      onSuccess: () => {
        setRetryingId(null);
        void refetch();
      },
      onError: () => setRetryingId(null),
    });
  }

  return (
    <section
      className="squad-runs-timeline"
      data-testid="squad-runs-timeline"
      data-squad-id={squadId}
    >
      <div className="squad-runs-timeline-header">
        <h3>小队运行</h3>
        <span className="count" data-testid="squad-runs-count">
          {runs.length}
        </span>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? '刷新中…' : '刷新'}
        </button>
        <Link
          href={`/runs?squad=${encodeURIComponent(squadId)}`}
          className="btn-secondary btn-sm"
          data-testid="squad-runs-to-runs"
        >
          在运行页打开
        </Link>
      </div>

      {escalatedRuns.length > 0 && (
        <div className="squad-readiness-alert" style={{ marginBottom: 16 }} data-testid="squad-escalation-alert">
          <div style={{ fontWeight: 'bold', color: 'var(--color-danger, #ef4444)', marginBottom: 8 }}>
            升级警告 (Escalation Alerts)
          </div>
          <p style={{ margin: '0 0 8px 0' }}>发现 {escalatedRuns.length} 个成员任务执行异常，已触发升级。</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {escalatedRuns.map(r => (
              <li key={r.id} style={{ marginBottom: 4 }}>
                <Link href={`/issues/${r.issueId}#run-trace`}>{shortId(r.id)}</Link>
                <span className="text-dim"> - {r.error || '执行异常'}</span>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  style={{ marginLeft: 8 }}
                  disabled={retry.isPending && retryingId === r.id}
                  onClick={() => retryRun(r.id)}
                >
                  {retry.isPending && retryingId === r.id ? '重试中…' : '重新委派'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? (
        <p className="text-dim text-sm">加载运行…</p>
      ) : isError ? (
        <p className="text-dim text-sm">加载失败</p>
      ) : runs.length === 0 ? (
        <div className="text-dim text-sm" data-testid="squad-runs-empty">
          <p>尚无标记到该小队的 run（指派小队后 leader run 会带 squadId）。</p>
          <div className="agent-runs-empty-actions">
            <Link
              href={`/?assignee=squad:${encodeURIComponent(squadId)}`}
              className="btn-secondary btn-sm"
              data-testid="squad-runs-empty-board"
            >
              看板指派
            </Link>
            <Link
              href={`/runs?squad=${encodeURIComponent(squadId)}&status=failed`}
              className="btn-ghost btn-sm"
              data-testid="squad-runs-empty-failed"
            >
              失败运行
            </Link>
          </div>
        </div>
      ) : (
        <div className="data-table-wrap">
          {runs.some((r) => r.status === 'failed') ? (
            <div className="agent-runs-toolbar" data-testid="squad-runs-toolbar">
              <Link
                href={`/runs?squad=${encodeURIComponent(squadId)}&status=failed`}
                className="btn-secondary btn-sm"
                data-testid="squad-runs-workspace-failed"
              >
                工作区失败 · {runs.filter((r) => r.status === 'failed').length}
              </Link>
              <Link
                href={`/runs?squad=${encodeURIComponent(squadId)}&status=active`}
                className="btn-ghost btn-sm"
                data-testid="squad-runs-workspace-active"
              >
                在途
              </Link>
            </div>
          ) : null}
          <table className="data-table" data-testid="squad-runs-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>角色</th>
                <th>Issue</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {activeRuns.length > 0 ? (
                <tr className="squad-run-group-heading" data-testid="squad-runs-active-group">
                  <td colSpan={5}>在途 · {activeRuns.length}</td>
                </tr>
              ) : null}
              {activeRuns.map((r) => {
                const elapsed = activeElapsedMs(r, now);
                return (
                  <tr
                    key={r.id}
                    data-testid="squad-run-row"
                    data-run-id={r.id}
                    data-run-status={r.status}
                    data-is-leader={r.isLeader ? '1' : '0'}
                  >
                    <td>
                      <Link
                        href={`/runs?squad=${encodeURIComponent(squadId)}&status=${encodeURIComponent(r.status)}`}
                        className={`run-pill run-pill--${r.status} run-pill--link`}
                        data-testid="squad-run-status-link"
                        data-status={r.status}
                        title="在工作区运行中筛选"
                      >
                        {r.status}
                      </Link>
                    </td>
                    <td className="text-sm">
                      {r.isLeader ? (
                        <Link
                          href={`/runs?squad=${encodeURIComponent(squadId)}&leader=1`}
                          className="leader-badge"
                          data-testid="squad-run-leader-filter"
                          title="仅队长 run"
                        >
                          队长
                        </Link>
                      ) : <span className="text-dim">成员</span>}
                    </td>
                    <td className="text-sm">
                      {r.issueId ? (
                        <Link href={`/issues/${r.issueId}#run-trace`} data-testid="squad-run-issue-link">
                          {shortId(r.issueId)}
                        </Link>
                      ) : <span className="text-dim">—</span>}
                    </td>
                    <td className="text-dim text-sm">
                      {relativeTime(r.createdAt)} ·{' '}
                      <span data-testid="squad-run-elapsed">
                        {r.status === 'running' ? '已运行' : '已等待'} {formatElapsed(elapsed)}
                      </span>
                    </td>
                    <td className="squad-run-actions">
                      <button
                        type="button"
                        className="btn btn-stop btn-sm"
                        data-testid="squad-run-cancel"
                        data-run-id={r.id}
                        disabled={cancel.isPending && cancellingId === r.id}
                        onClick={() => {
                          setCancellingId(r.id);
                          cancel.mutate(r.id, { onSettled: () => setCancellingId(null) });
                        }}
                      >
                        {cancel.isPending && cancellingId === r.id ? '停止中…' : '停止'}
                      </button>
                      <Link href={runHref(r.id)} className="btn btn-ghost btn-sm" data-testid="squad-run-transcript">
                        运行页
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {pastRuns.length > 0 ? (
                <tr className="squad-run-group-heading" data-testid="squad-runs-past-group">
                  <td colSpan={5}>历史 · {pastRuns.length}</td>
                </tr>
              ) : null}
              {pastRuns.map((r) => (
                <tr
                  key={r.id}
                  data-testid="squad-run-row"
                  data-run-id={r.id}
                  data-run-status={r.status}
                  data-is-leader={r.isLeader ? '1' : '0'}
                >
                  <td>
                    <Link
                      href={`/runs?squad=${encodeURIComponent(squadId)}&status=${encodeURIComponent(r.status)}`}
                      className={`run-pill run-pill--${r.status} run-pill--link`}
                      data-testid="squad-run-status-link"
                      data-status={r.status}
                      title="在工作区运行中筛选"
                    >
                      {r.status}
                    </Link>
                  </td>
                  <td className="text-sm">
                    {r.isLeader ? (
                      <Link href={`/runs?squad=${encodeURIComponent(squadId)}&leader=1`} className="leader-badge" data-testid="squad-run-leader-filter" title="仅队长 run">
                        队长
                      </Link>
                    ) : <span className="text-dim">成员</span>}
                  </td>
                  <td className="text-sm">
                    {r.issueId ? (
                      <Link href={`/issues/${r.issueId}#run-trace`} data-testid="squad-run-issue-link">
                        {shortId(r.issueId)}
                      </Link>
                    ) : <span className="text-dim">—</span>}
                  </td>
                  <td className="text-dim text-sm">{relativeTime(r.createdAt)}</td>
                  <td className="squad-run-actions">
                    {isRetryableRun(r) ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        data-testid="squad-run-retry"
                        data-run-id={r.id}
                        disabled={retry.isPending && retryingId === r.id}
                        onClick={() => retryRun(r.id)}
                      >
                        {retry.isPending && retryingId === r.id ? '重试中…' : '重试此 run'}
                      </button>
                    ) : null}
                    <Link href={runHref(r.id)} className="btn btn-ghost btn-sm" data-testid="squad-run-transcript">
                      运行页
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
