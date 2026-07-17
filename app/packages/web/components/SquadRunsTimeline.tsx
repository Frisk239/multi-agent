'use client';

import Link from 'next/link';
import { useWorkspaceRuns } from '@/lib/api';

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

      {isLoading ? (
        <p className="text-dim text-sm">加载运行…</p>
      ) : isError ? (
        <p className="text-dim text-sm">加载失败</p>
      ) : runs.length === 0 ? (
        <p className="text-dim text-sm" data-testid="squad-runs-empty">
          尚无标记到该小队的 run（指派小队后 leader run 会带 squadId）。
        </p>
      ) : (
        <div className="data-table-wrap">
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
                    <code className={`run-pill run-pill--${r.status}`}>{r.status}</code>
                  </td>
                  <td className="text-sm">
                    {r.isLeader ? (
                      <span className="leader-badge">队长</span>
                    ) : (
                      <span className="text-dim">成员</span>
                    )}
                  </td>
                  <td className="text-sm">
                    {r.issueId ? (
                      <Link href={`/issues/${r.issueId}#run-trace`}>
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
