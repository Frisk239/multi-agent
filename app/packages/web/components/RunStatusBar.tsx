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

export function RunStatusBar({ issueId }: { issueId: string }) {
  const { data: runs = [] } = useRuns(issueId);
  const cancel = useCancelRun();
  const rerunIssue = useRerunIssue(issueId);
  const retryRun = useRetryRun();
  const progressByRun = useRunProgressStore((s) => s.byRunId);
  const [briefingOpen, setBriefingOpen] = useState(true);

  const active = runs.find((r) => r.status === 'queued' || r.status === 'running') ?? runs[0];

  // hooks 须在 early return 之前（Rules of Hooks）
  const showBriefing = Boolean(active?.isLeader && active?.squadId);
  const { data: squad, isLoading: squadLoading } = useSquad(
    showBriefing && active?.squadId ? active.squadId : '',
  );

  if (!active) return <p className="run-status-hint">指派 agent 后自动执行</p>;

  const canStop = active.status === 'queued' || active.status === 'running';
  const canRerun = active.status === 'failed' || active.status === 'cancelled';
  const progress =
    active.status === 'running' ? progressByRun[active.id]?.trim() : undefined;
  const failure =
    active.status === 'failed' || active.error
      ? classifyRunFailure(active.error)
      : null;

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

  const isLive = active.status === 'queued' || active.status === 'running';

  return (
    <div
      className={`run-status-bar${isLive ? ' run-status-bar--live' : ''}`}
      data-run-status={active.status}
      data-run-id={active.id}
      data-testid="run-status-bar"
    >
      <div className="run-status-main">
        <div className="run-status-pill-row">
          <span className="run-status-pill">
            {active.isLeader && <span className="leader-badge">队长</span>}
            {isLive ? (
              <span className="run-live-dot" aria-hidden="true" data-testid="run-live-dot" />
            ) : null}
            运行 {active.status} · {active.runtime}
            {active.error ? ` · ${active.error}` : ''}
          </span>
          {isLive ? (
            <div className="run-live-actions" data-testid="run-live-entry">
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
                看轨迹
              </a>
              <Link
                href={`/runs?run=${encodeURIComponent(active.id)}&status=${encodeURIComponent(active.status)}`}
                className="btn-secondary btn-sm"
                data-testid="run-live-to-runs"
              >
                运行列表
              </Link>
            </div>
          ) : null}
        </div>
        {isLive ? (
          <div
            className="run-live-panel"
            data-testid="run-live-panel"
            data-has-progress={progress ? '1' : '0'}
          >
            <div className="run-live-bar" aria-hidden="true">
              <span className="run-live-bar-fill" />
            </div>
            {progress ? (
              <p className="run-progress-text" title={progress} data-testid="run-live-progress">
                {progress}
              </p>
            ) : (
              <p className="run-progress-text run-progress-text--idle" data-testid="run-live-waiting">
                {active.status === 'queued'
                  ? '已排队，等待 worker 领取…'
                  : '执行中，等待进度推送…'}
              </p>
            )}
          </div>
        ) : progress ? (
          <p className="run-progress-text" title={progress}>
            {progress}
          </p>
        ) : null}
        {failure ? (
          <div className="run-failure-box">
            <strong>{failure.title}</strong>
            <p className="text-sm">{failure.hint}</p>
            {active.error ? <pre className="run-error-pre">{active.error}</pre> : null}
            <div className="run-failure-actions" data-testid="run-failure-actions">
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
              {failure.settingsHref ? (
                <Link
                  href={failure.settingsHref}
                  className="btn-secondary btn-sm"
                  data-testid="run-fail-open-diag"
                >
                  {failure.settingsHref === '/runtimes' ? '打开运行时' : '打开诊断'}
                </Link>
              ) : (
                <Link
                  href="/settings"
                  className="btn-secondary btn-sm"
                  data-testid="run-fail-open-diag"
                >
                  打开诊断
                </Link>
              )}
              <Link
                href={`/runs?run=${encodeURIComponent(active.id)}&status=${encodeURIComponent(active.status)}`}
                className="btn-secondary btn-sm"
                data-testid="run-fail-open-runs"
              >
                在运行列表中查看
              </Link>
              <Link
                href="/?failed=1"
                className="btn-ghost btn-sm"
                data-testid="run-fail-open-board"
              >
                看板仅失败
              </Link>
              <Link
                href="/inbox?kind=run_failed&read=unread"
                className="btn-ghost btn-sm"
                data-testid="run-fail-open-inbox"
              >
                收件箱失败
              </Link>
              {active.agentId ? (
                <Link
                  href={`/agents/${encodeURIComponent(active.agentId)}`}
                  className="btn-ghost btn-sm"
                  data-testid="run-fail-open-agent"
                >
                  执行智能体
                </Link>
              ) : null}
              {active.squadId ? (
                <Link
                  href={`/squads/${encodeURIComponent(active.squadId)}`}
                  className="btn-ghost btn-sm"
                  data-testid="run-fail-open-squad"
                >
                  小队
                </Link>
              ) : null}
              <button
                type="button"
                className="btn-secondary btn-sm"
                data-testid="run-fail-copy-error"
                onClick={() => {
                  if (active.error) void navigator.clipboard?.writeText(active.error);
                }}
              >
                复制错误
              </button>
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
              <span>小队 Briefing 预览</span>
              <span className="text-dim">
                {squadLoading ? '加载中…' : squad?.name ?? active.squadId}
                {briefingOpen ? ' · 收起' : ' · 展开'}
              </span>
            </button>
            {briefingOpen && (
              <div className="leader-briefing-body">
                {squadLoading && <p className="text-sm text-dim">加载小队…</p>}
                {!squadLoading && squad && (
                  <>
                    <p className="leader-briefing-hint">
                      与注入 leader 执行 prompt 的三段结构一致（只读；编辑请到小队页）。
                    </p>
                    <MarkdownBody source={briefingMd} />
                    <Link
                      href={`/squads/${squad.id}`}
                      className="btn-secondary btn-sm leader-briefing-link"
                    >
                      打开小队设置
                    </Link>
                  </>
                )}
                {!squadLoading && !squad && (
                  <p className="text-sm text-dim">无法加载小队详情</p>
                )}
              </div>
            )}
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
