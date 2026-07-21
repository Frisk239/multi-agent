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
  /** G23：打开事件时间线弹层 */
  onOpenTimeline?: (runId: string) => void;
}) {
  if (runs.length === 0) return null;

  const failedCount = runs.filter((r) => r.status === 'failed').length;
  const issueId = runs.find((r) => r.issueId)?.issueId ?? usage?.issueId;
  const rateLabel =
    usage?.successRate == null
      ? null
      : `${Math.round(usage.successRate * 1000) / 10}%`;

  return (
    <section
      className="issue-run-history"
      data-testid="issue-run-history"
      aria-label="运行历史"
    >
      <div className="issue-run-history-header">
        <h3>运行历史</h3>
        <span className="count" data-testid="issue-run-history-count">
          {runs.length}
        </span>
        <div className="issue-run-history-links" data-testid="issue-run-history-links">
          {issueId ? (
            <Link
              href={`/runs?status=all`}
              className="btn-ghost btn-sm"
              data-testid="issue-run-history-workspace"
              title="打开工作区运行页"
            >
              工作区运行
            </Link>
          ) : null}
          {failedCount > 0 ? (
            <Link
              href="/runs?status=failed"
              className="btn-secondary btn-sm"
              data-testid="issue-run-history-failed"
            >
              失败 · {failedCount}
            </Link>
          ) : null}
        </div>
      </div>

      {usage ? (
        <div className="issue-run-usage" data-testid="issue-run-usage" aria-label="运行用量">
          <div className="issue-run-usage-grid">
            <div className="issue-run-usage-item">
              <span className="issue-run-usage-label">运行次数</span>
              <span className="issue-run-usage-value" data-testid="issue-usage-total">
                {usage.total}
              </span>
            </div>
            <div className="issue-run-usage-item">
              <span className="issue-run-usage-label">成功率</span>
              <span className="issue-run-usage-value" data-testid="issue-usage-rate">
                {rateLabel ?? '—'}
              </span>
            </div>
            <div className="issue-run-usage-item">
              <span className="issue-run-usage-label">平均耗时</span>
              <span className="issue-run-usage-value" data-testid="issue-usage-avg">
                {formatDurationMs(usage.avgDurationMs)}
              </span>
            </div>
            <div className="issue-run-usage-item">
              <span className="issue-run-usage-label">累计耗时</span>
              <span className="issue-run-usage-value" data-testid="issue-usage-total-dur">
                {formatDurationMs(usage.totalDurationMs)}
              </span>
            </div>
          </div>
          <div className="issue-run-usage-meta text-dim text-sm" data-testid="issue-usage-meta">
            completed {usage.completed} · failed {usage.failed}
            {usage.active > 0 ? ` · 在途 ${usage.active}` : ''}
            {usage.cancelled > 0 ? ` · 取消 ${usage.cancelled}` : ''}
            {' · '}
            Token 计量本地 CLI 暂不可用
          </div>
        </div>
      ) : null}

      <div className="data-table-wrap">
        <table className="data-table issue-run-history-table">
          <thead>
            <tr>
              <th>状态</th>
              <th>Runtime</th>
              <th>Run</th>
              <th>耗时</th>
              <th>创建</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const selected = r.id === selectedRunId;
              const live = r.status === 'queued' || r.status === 'running';
              const dur = runDurationMs(r);
              return (
                <tr
                  key={r.id}
                  className={`issue-run-history-row${selected ? ' is-selected' : ''}${live ? ' is-live' : ''}`}
                  data-testid="issue-run-history-row"
                  data-run-id={r.id}
                  data-run-status={r.status}
                  data-selected={selected ? '1' : '0'}
                  onClick={() => onSelect(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(r.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={selected}
                  title="点击查看该 run 的轨迹"
                >
                  <td>
                    <code className={`run-pill run-pill--${r.status}`}>{r.status}</code>
                    {r.isLeader ? (
                      <span className="leader-badge" style={{ marginLeft: 6 }}>
                        队长
                      </span>
                    ) : null}
                  </td>
                  <td className="text-sm">
                    <Link
                      href={`/agents?runtime=${encodeURIComponent(r.runtime)}`}
                      className="runs-inline-filter"
                      data-testid="issue-run-history-runtime"
                      title="筛选同 runtime 智能体"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.runtime}
                    </Link>
                  </td>
                  <td>
                    <code className="text-sm">{shortId(r.id)}</code>
                  </td>
                  <td className="text-dim text-sm" data-testid="issue-run-history-duration">
                    {formatDurationMs(dur)}
                  </td>
                  <td className="text-dim text-sm">{relativeTime(r.createdAt)}</td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    {onOpenTimeline ? (
                      <button
                        type="button"
                        className="runs-inline-filter"
                        data-testid="issue-run-history-timeline"
                        title="打开事件时间线"
                        onClick={() => onOpenTimeline(r.id)}
                      >
                        时间线
                      </button>
                    ) : null}
                    <Link
                      href={`/runs?run=${encodeURIComponent(r.id)}&status=${encodeURIComponent(r.status)}`}
                      className="runs-inline-filter"
                      data-testid="issue-run-history-open-runs"
                      title="在运行列表高亮"
                    >
                      列表
                    </Link>
                    {r.agentId ? (
                      <Link
                        href={`/agents/${r.agentId}`}
                        className="runs-inline-filter"
                        data-testid="issue-run-history-open-agent"
                        title="打开执行智能体"
                      >
                        智能体
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
