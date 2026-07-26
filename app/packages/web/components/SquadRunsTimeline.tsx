'use client';

import Link from 'next/link';
import { useWorkspaceRuns, useRetryRun } from '@/lib/api';

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

export function SquadRunsTimeline({ squadId }: { squadId: string }) {
  const { data: runs = [], isLoading, isError, refetch, isFetching } =
    useWorkspaceRuns({ squadId, limit: 30 });
    
  const retry = useRetryRun();
  const escalatedRuns = runs.filter(r => r.failureReason === 'squad_member_escalated' && r.status === 'failed');

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
                  disabled={retry.isPending}
                  onClick={() => {
                    retry.mutate(r.id, {
                      onSuccess: () => refetch()
                    });
                  }}
                >
                  {retry.isPending ? '重试中…' : '重新委派'}
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
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
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
                    ) : (
                      <span className="text-dim">成员</span>
                    )}
                  </td>
                  <td className="text-sm">
                    {r.issueId ? (
                      <Link
                        href={`/issues/${r.issueId}#run-trace`}
                        data-testid="squad-run-issue-link"
                      >
                        {shortId(r.issueId)}
                      </Link>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td className="text-dim text-sm">{relativeTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
