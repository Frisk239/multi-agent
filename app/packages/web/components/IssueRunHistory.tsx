'use client';

import Link from 'next/link';
import type { AgentRun, IssueRunUsage } from '@ma/shared';

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

function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function runDurationMs(r: AgentRun): number | null {
  if (!r.startedAt || !r.finishedAt) return null;
  const a = new Date(r.startedAt).getTime();
  const b = new Date(r.finishedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

const STATUS_ZH: Record<string, string> = {
  queued: '排队',
  running: '执行中',
  completed: '完成',
  failed: '失败',
  cancelled: '取消',
};

function cwdModeShort(mode: string | null | undefined): string | null {
  if (!mode) return null;
  if (mode === 'project_local') return '项目本机';
  if (mode === 'workspace') return '工作区';
  if (mode === 'isolated_issue' || mode === 'isolated_run') return '隔离';
  if (mode === 'chat_scratch') return '聊天隔离';
  if (mode === 'none') return '未就绪';
  return mode;
}

/**
 * Multica「显示历史运行」密度：表精简；时间线为主操作。
 */
export function IssueRunHistory({
  runs,
  selectedRunId,
  onSelect,
  usage,
  onOpenTimeline,
}: {
  runs: AgentRun[];
  selectedRunId: string | undefined;
  onSelect: (runId: string) => void;
  usage?: IssueRunUsage | null;
  onOpenTimeline?: (runId: string) => void;
}) {
  if (runs.length === 0) return null;

  const failedCount = runs.filter((r) => r.status === 'failed').length;
  const rateLabel =
    usage?.successRate == null
      ? null
      : `${Math.round(usage.successRate * 1000) / 10}%`;

  return (
    <section
      className="issue-run-history issue-run-history--compact"
      data-testid="issue-run-history"
      aria-label="运行历史"
    >
      <div className="issue-run-history-header">
        <div className="issue-run-history-title-row">
          <h3 className="issue-section-title">历史</h3>
          <span className="count" data-testid="issue-run-history-count">
            {runs.length}
          </span>
          {failedCount > 0 ? (
            <span className="issue-run-failed-chip" data-testid="issue-run-history-failed">
              失败 {failedCount}
            </span>
          ) : null}
        </div>
        {usage ? (
          <div className="issue-run-usage issue-run-usage--compact" data-testid="issue-run-usage">
            <span>
              <strong data-testid="issue-usage-total">{usage.total}</strong> 次
            </span>
            <span className="text-dim">·</span>
            <span>
              成功 <strong data-testid="issue-usage-rate">{rateLabel ?? '—'}</strong>
            </span>
            <span className="text-dim">·</span>
            <span>
              均耗{' '}
              <strong data-testid="issue-usage-avg">
                {formatDurationMs(usage.avgDurationMs)}
              </strong>
            </span>
          </div>
        ) : (
          <Link
            href="/runs?status=all"
            className="btn btn-ghost btn-sm"
            data-testid="issue-run-history-workspace"
          >
            全部运行
          </Link>
        )}
      </div>

      <ul className="issue-run-rows" data-testid="issue-run-rows">
        {runs.map((r) => {
          const selected = r.id === selectedRunId;
          const live = r.status === 'queued' || r.status === 'running';
          const dur = runDurationMs(r);
          return (
            <li
              key={r.id}
              className={`issue-run-row${selected ? ' is-selected' : ''}${live ? ' is-live' : ''}`}
              data-testid="issue-run-history-row"
              data-run-id={r.id}
              data-run-status={r.status}
              data-selected={selected ? '1' : '0'}
            >
              <button
                type="button"
                className="issue-run-row-main"
                onClick={() => onSelect(r.id)}
                aria-pressed={selected}
                title="选中并查看轨迹"
              >
                {live ? <span className="run-live-dot" aria-hidden /> : null}
                <code className={`run-pill run-pill--${r.status}`}>
                  {STATUS_ZH[r.status] ?? r.status}
                </code>
                {r.isLeader ? <span className="leader-badge">队长</span> : null}
                <span className="issue-run-row-runtime text-sm">{r.runtime}</span>
                {cwdModeShort(r.cwdMode) ? (
                  <span
                    className="issue-run-row-cwd text-dim text-sm"
                    data-testid="issue-run-history-cwd"
                    data-cwd-mode={r.cwdMode ?? ''}
                    title={r.cwdPath ?? undefined}
                  >
                    {cwdModeShort(r.cwdMode)}
                  </span>
                ) : null}
                <span className="issue-run-row-id text-dim text-sm">{shortId(r.id)}</span>
                <span
                  className="issue-run-row-dur text-dim text-sm"
                  data-testid="issue-run-history-duration"
                >
                  {formatDurationMs(dur)}
                </span>
                <span className="issue-run-row-time text-dim text-sm">
                  {relativeTime(r.createdAt)}
                </span>
              </button>
              <div className="issue-run-row-actions" onClick={(e) => e.stopPropagation()}>
                {onOpenTimeline ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-testid="issue-run-history-timeline"
                    onClick={() => onOpenTimeline(r.id)}
                  >
                    时间线
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
