'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AgentRun, IssueRunUsage } from '@ma/shared';
import { useCancelRun, useRetryRun } from '@/lib/api';

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

const ACTIVE_STATUSES = new Set<AgentRun['status']>([
  'queued',
  'waiting_local_directory',
  'running',
]);

function isActiveRun(r: AgentRun): boolean {
  return ACTIVE_STATUSES.has(r.status);
}

function isRetryableRun(r: AgentRun): boolean {
  return r.status === 'failed' || r.status === 'cancelled' || r.status === 'timed_out';
}

function activeElapsedMs(r: AgentRun, now: number): number | null {
  const waitingStarted =
    r.status === 'waiting_local_directory' &&
    typeof r.waitingLocalEnteredAt === 'number'
      ? r.waitingLocalEnteredAt
      : null;
  const started =
    waitingStarted ?? (r.status === 'running' ? r.startedAt : null) ?? r.createdAt;
  const t = new Date(started).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, now - t);
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

const STATUS_ZH: Record<string, string> = {
  queued: '排队',
  waiting_local_directory: '等待目录锁',
  running: '执行中',
  completed: '完成',
  failed: '失败',
  cancelled: '取消',
  timed_out: '超时',
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

/** Multica「显示历史运行」密度：在途/历史分组，时间线与运行页为深链。 */
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
  const activeRuns = runs.filter(isActiveRun);
  const pastRuns = runs.filter((r) => !isActiveRun(r));
  const now = useLiveClock(activeRuns.length > 0);
  const cancel = useCancelRun();
  const retry = useRetryRun();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  if (runs.length === 0) return null;

  const failedCount = runs.filter((r) => r.status === 'failed').length;
  const rateLabel =
    usage?.successRate == null
      ? null
      : `${Math.round(usage.successRate * 1000) / 10}%`;

  // D2：同 issue 隔离目录是否跨 run 复用（cwd_path 相同）
  const isolatedPaths = runs
    .filter((r) => r.cwdMode === 'isolated_issue' && r.cwdPath?.trim())
    .map((r) => r.cwdPath!.trim());
  const reusePath =
    isolatedPaths.length >= 2 && isolatedPaths.every((p) => p === isolatedPaths[0])
      ? isolatedPaths[0]
      : isolatedPaths.length === 1
        ? isolatedPaths[0]
        : null;

  function runHref(runId: string): string {
    return `/runs?run=${encodeURIComponent(runId)}&timeline=1&status=all`;
  }

  function renderRow(r: AgentRun, live: boolean) {
    const selected = r.id === selectedRunId;
    const dur = runDurationMs(r);
    const elapsed = live ? activeElapsedMs(r, now) : null;
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
            {elapsed != null
              ? `${r.status === 'running' ? '已运行' : '已等待'} ${formatDurationMs(elapsed)}`
              : formatDurationMs(dur)}
          </span>
          <span className="issue-run-row-time text-dim text-sm">
            {relativeTime(r.createdAt)}
          </span>
        </button>
        <div className="issue-run-row-actions" onClick={(e) => e.stopPropagation()}>
          {live ? (
            <button
              type="button"
              className="btn btn-stop btn-sm"
              data-testid="issue-run-history-cancel"
              data-run-id={r.id}
              disabled={cancel.isPending && cancellingId === r.id}
              onClick={() => {
                setCancellingId(r.id);
                cancel.mutate(r.id, { onSettled: () => setCancellingId(null) });
              }}
            >
              {cancel.isPending && cancellingId === r.id ? '停止中…' : '停止'}
            </button>
          ) : null}
          {!live && isRetryableRun(r) ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              data-testid="issue-run-history-retry"
              data-run-id={r.id}
              disabled={retry.isPending && retryingId === r.id}
              onClick={() => {
                setRetryingId(r.id);
                retry.mutate(r.id, { onSettled: () => setRetryingId(null) });
              }}
            >
              {retry.isPending && retryingId === r.id ? '重试中…' : '重试此 run'}
            </button>
          ) : null}
          {onOpenTimeline ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid="issue-run-history-timeline"
              data-run-id={r.id}
              onClick={() => onOpenTimeline(r.id)}
            >
              时间线
            </button>
          ) : null}
          <Link href={runHref(r.id)} className="btn btn-ghost btn-sm" data-testid="issue-run-history-transcript">
            运行页
          </Link>
        </div>
      </li>
    );
  }

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
        {reusePath ? (
          <p
            className="issue-run-workdir-reuse text-dim text-sm"
            data-testid="issue-run-workdir-reuse"
            title={reusePath}
          >
            隔离工作目录沿用 · <code className="issue-run-workdir-path">{reusePath}</code>
          </p>
        ) : null}
        {usage ? (
          <div className="issue-run-usage issue-run-usage--compact" data-testid="issue-run-usage">
            <span><strong data-testid="issue-usage-total">{usage.total}</strong> 次</span>
            <span className="text-dim">·</span>
            <span>成功 <strong data-testid="issue-usage-rate">{rateLabel ?? '—'}</strong></span>
            <span className="text-dim">·</span>
            <span>
              均耗 <strong data-testid="issue-usage-avg">{formatDurationMs(usage.avgDurationMs)}</strong>
            </span>
            <span className="text-dim">·</span>
            <span data-testid="issue-usage-cost-chip" title="按本地 model 价表推估；无价表为 uncosted">
              {usage.costUsd != null
                ? `$${usage.costUsd < 0.01 ? usage.costUsd.toFixed(6) : usage.costUsd.toFixed(4)}`
                : 'uncosted'}
            </span>
          </div>
        ) : (
          <Link href="/runs?status=all" className="btn btn-ghost btn-sm" data-testid="issue-run-history-workspace">
            全部运行
          </Link>
        )}
      </div>

      <ul className="issue-run-rows" data-testid="issue-run-rows">
        {activeRuns.length > 0 ? (
          <li className="issue-run-group-heading" data-testid="issue-run-history-active-group">
            在途 · {activeRuns.length}
          </li>
        ) : null}
        {activeRuns.map((run) => renderRow(run, true))}
        {pastRuns.length > 0 ? (
          <li className="issue-run-group-heading" data-testid="issue-run-history-past-group">
            历史 · {pastRuns.length}
          </li>
        ) : null}
        {pastRuns.map((run) => renderRow(run, false))}
      </ul>
    </section>
  );
}
