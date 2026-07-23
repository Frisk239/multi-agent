'use client';

import { useState } from 'react';
import Link from 'next/link';
import { classifyRunFailure } from '@ma/shared';
import {
  useRuns,
  useCancelRun,
  useRerunIssue,
  useRetryRun,
  useSquad,
} from '@/lib/api';
import { useRunProgressStore } from '@/lib/ws';
import { MarkdownBody } from './MarkdownBody';

/**
 * Issue 详情 · 当前/最近一次 run 状态。
 * Multica ExecutionLog 行级密度：主操作少；运维深链收到「更多」。
 */
export function RunStatusBar({
  issueId,
  onOpenTimeline,
}: {
  issueId: string;
  onOpenTimeline?: (runId: string) => void;
}) {
  const { data: runs = [] } = useRuns(issueId);
  const cancel = useCancelRun();
  const rerunIssue = useRerunIssue(issueId);
  const retryRun = useRetryRun();
  const progressByRun = useRunProgressStore((s) => s.byRunId);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);

  const active =
    runs.find(
      (r) =>
        r.status === 'queued' ||
        r.status === 'waiting_local_directory' ||
        r.status === 'running',
    ) ?? runs[0];

  const showBriefing = Boolean(active?.isLeader && active?.squadId);
  const { data: squad, isLoading: squadLoading } = useSquad(
    showBriefing && active?.squadId ? active.squadId : '',
  );

  if (!active) {
    return (
      <p className="run-status-hint" data-testid="run-status-empty">
        指派 agent 后自动执行
      </p>
    );
  }

  const canStop =
    active.status === 'queued' ||
    active.status === 'waiting_local_directory' ||
    active.status === 'running';
  const canRerun = active.status === 'failed' || active.status === 'cancelled';
  const progress =
    active.status === 'running' ? progressByRun[active.id]?.trim() : undefined;
  const failure =
    active.status === 'failed' || active.error
      ? classifyRunFailure(active.error)
      : null;
  const isLive =
    active.status === 'queued' ||
    active.status === 'waiting_local_directory' ||
    active.status === 'running';

  const rosterLines =
    squad?.members
      .filter((m) => m.agentId !== squad.leaderId)
      .map((m) => `- ${m.name} — [@${m.name}](mention://agent/${m.agentId})`)
      .join('\n') ?? '';

  const briefingMd = squad
    ? [
        `# Squad Operating Protocol\n${squad.operatingProtocol || '（未配置）'}`,
        `# Squad Roster\n${rosterLines || '（无其他成员）'}`,
        `# Mission Directive\n${squad.missionDirective || '（未配置）'}`,
      ].join('\n\n')
    : '';

  const statusLabel =
    active.status === 'waiting_local_directory'
      ? '等待本地目录锁'
      : active.status === 'queued'
        ? '排队中'
        : active.status === 'running'
          ? '执行中'
          : active.status === 'completed'
            ? '已完成'
            : active.status === 'failed'
              ? '失败'
              : active.status === 'cancelled'
                ? '已取消'
              : active.status;

  return (
    <div
      className={`run-status-bar run-status-bar--compact${isLive ? ' run-status-bar--live' : ''}${
        failure ? ' run-status-bar--failed' : ''
      }`}
      data-run-status={active.status}
      data-run-id={active.id}
      data-testid="run-status-bar"
    >
      <div className="run-status-main">
        <div className="run-status-pill-row">
          <div className="run-status-meta">
            {isLive ? (
              <span className="run-live-dot" aria-hidden data-testid="run-live-dot" />
            ) : null}
            {active.isLeader ? <span className="leader-badge">队长</span> : null}
            <code className={`run-pill run-pill--${active.status}`}>{statusLabel}</code>
            <span className="run-status-runtime text-dim text-sm">{active.runtime}</span>
            {active.error && !failure ? (
              <span className="run-status-err-snip text-dim text-sm" title={active.error}>
                {active.error.slice(0, 80)}
                {active.error.length > 80 ? '…' : ''}
              </span>
            ) : null}
          </div>

          <div className="run-status-actions" data-testid="run-status-actions">
            {canStop ? (
              <button
                type="button"
                className="btn-stop btn-sm"
                data-testid="run-stop"
                onClick={() => cancel.mutate(active.id)}
                disabled={cancel.isPending}
              >
                停止
              </button>
            ) : null}
            {canRerun ? (
              <button
                type="button"
                className="btn-primary btn-sm"
                data-testid="run-fail-rerun"
                disabled={rerunIssue.isPending}
                onClick={() => rerunIssue.mutate({})}
                title="按当前 Issue 指派再排队"
              >
                {rerunIssue.isPending ? '排队中…' : '再执行'}
              </button>
            ) : null}
            {onOpenTimeline ? (
              <button
                type="button"
                className="btn-secondary btn-sm"
                data-testid="run-open-timeline"
                onClick={() => onOpenTimeline(active.id)}
              >
                时间线
              </button>
            ) : (
              <a
                href="#run-trace"
                className="btn-secondary btn-sm"
                data-testid="run-live-to-trace"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('run-trace')?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }}
              >
                轨迹
              </a>
            )}
            {canRerun || failure || canStop ? (
              <button
                type="button"
                className={`btn btn-ghost btn-sm${opsOpen ? ' is-open' : ''}`}
                data-testid="run-ops-more"
                aria-expanded={opsOpen}
                onClick={() => setOpsOpen((v) => !v)}
              >
                {opsOpen ? '收起' : '更多'}
              </button>
            ) : null}
          </div>
        </div>

        {isLive ? (
          <div
            className="run-live-panel"
            data-testid="run-live-panel"
            data-has-progress={progress ? '1' : '0'}
          >
            <div className="run-live-bar" aria-hidden>
              <span className="run-live-bar-fill" />
            </div>
            <p
              className={`run-progress-text${progress ? '' : ' run-progress-text--idle'}`}
              title={progress}
              data-testid={progress ? 'run-live-progress' : 'run-live-waiting'}
            >
              {progress
                ? progress
                : active.status === 'queued'
                  ? '已排队，等待 worker 领取…'
                  : '执行中，等待进度推送…'}
            </p>
          </div>
        ) : null}

        {failure ? (
          <div className="run-failure-box" data-testid="run-failure-box">
            <div className="run-failure-head">
              <strong>{failure.title}</strong>
              <p className="text-sm run-failure-hint">{failure.hint}</p>
            </div>
            {active.error ? (
              <pre className="run-error-pre" data-testid="run-error-pre">
                {active.error}
              </pre>
            ) : null}
          </div>
        ) : null}

        {opsOpen ? (
          <div className="run-ops-drawer" data-testid="run-ops-drawer">
            <div className="run-failure-actions" data-testid="run-failure-actions">
              {canRerun ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  data-testid="run-retry-this"
                  disabled={retryRun.isPending}
                  onClick={() => retryRun.mutate(active.id)}
                  title="按该历史 run 的 agent 再排队"
                >
                  再执行此 run
                </button>
              ) : null}
              <Link
                href={
                  failure?.settingsHref ||
                  (active.status === 'failed' ? '/settings' : '/runtimes')
                }
                className="btn btn-ghost btn-sm"
                data-testid="run-fail-open-diag"
              >
                {failure?.settingsHref === '/runtimes' ? '本机 CLI' : '环境诊断'}
              </Link>
              <Link
                href={`/runs?run=${encodeURIComponent(active.id)}&status=${encodeURIComponent(active.status)}`}
                className="btn btn-ghost btn-sm"
                data-testid="run-fail-open-runs"
              >
                运行页
              </Link>
              {active.error ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-testid="run-fail-copy-error"
                  onClick={() => {
                    void navigator.clipboard?.writeText(active.error ?? '');
                  }}
                >
                  复制错误
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {showBriefing ? (
          <div className="leader-briefing-panel" data-testid="leader-briefing-preview">
            <button
              type="button"
              className="leader-briefing-toggle"
              aria-expanded={briefingOpen}
              onClick={() => setBriefingOpen((o) => !o)}
            >
              <span>小队 Briefing</span>
              <span className="text-dim">
                {squadLoading ? '加载中…' : squad?.name ?? active.squadId}
                {briefingOpen ? ' · 收起' : ' · 展开'}
              </span>
            </button>
            {briefingOpen ? (
              <div className="leader-briefing-body">
                {squadLoading && <p className="text-sm text-dim">加载小队…</p>}
                {!squadLoading && squad ? (
                  <>
                    <p className="leader-briefing-hint">
                      与注入 leader 的三段结构一致（只读；编辑请到小队页）。
                    </p>
                    <MarkdownBody source={briefingMd} />
                    <Link
                      href={`/squads/${squad.id}`}
                      className="btn-secondary btn-sm leader-briefing-link"
                    >
                      打开小队设置
                    </Link>
                  </>
                ) : null}
                {!squadLoading && !squad ? (
                  <p className="text-sm text-dim">无法加载小队详情</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
