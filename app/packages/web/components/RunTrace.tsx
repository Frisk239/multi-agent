'use client';

import Link from 'next/link';
import type { AgentRun } from '@ma/shared';
import { useRunMessages } from '@/lib/api';
import { useRunProgressStore } from '@/lib/ws';

export function RunTrace({
  run,
}: {
  /** 当前选中的 run（由 Issue 详情历史表驱动） */
  run: AgentRun | undefined;
}) {
  const runId = run?.id;
  const { data: messages = [] } = useRunMessages(runId);
  const progressByRun = useRunProgressStore((s) => s.byRunId);
  const progress =
    run && run.status === 'running' ? progressByRun[run.id]?.trim() : undefined;
  const isLive = run?.status === 'queued' || run?.status === 'running';
  const isFailed = run?.status === 'failed' || Boolean(run?.error);

  if (!runId || !run) return null;

  return (
    <section
      id="run-trace"
      className={`run-trace${isLive ? ' run-trace--live' : ''}`}
      data-testid="run-trace"
      data-run-status={run.status}
      data-run-id={run.id}
    >
      <div className="run-trace-header">
        <h3>运行轨迹</h3>
        <span className="text-dim text-sm" data-testid="run-trace-run-id">
          {run.id.slice(0, 8)}…
        </span>
        {isLive ? (
          <span className="run-trace-live-badge" data-testid="run-trace-live-badge">
            live · {run.status}
          </span>
        ) : null}
        <div className="run-trace-header-links" data-testid="run-trace-header-links">
          <Link
            href={`/runs?run=${encodeURIComponent(run.id)}&status=${encodeURIComponent(run.status)}`}
            className="btn-ghost btn-sm"
            data-testid="run-trace-to-runs"
          >
            运行列表
          </Link>
          {run.agentId ? (
            <Link
              href={`/agents/${run.agentId}`}
              className="btn-ghost btn-sm"
              data-testid="run-trace-to-agent"
            >
              智能体
            </Link>
          ) : null}
          {isFailed ? (
            <Link
              href="/settings"
              className="btn-ghost btn-sm"
              data-testid="run-trace-to-settings"
            >
              环境
            </Link>
          ) : null}
        </div>
      </div>
      {isLive && progress ? (
        <p
          className="run-trace-live-progress"
          data-testid="run-trace-live-progress"
          title={progress}
        >
          进度：{progress}
        </p>
      ) : null}
      {messages.length === 0 ? (
        <div className="run-trace-empty" data-testid="run-trace-empty">
          <p>
            {isLive
              ? '执行中…（部分 runtime 如 opencode 执行期间无实时轨迹，结束时才会有摘要，属正常）'
              : isFailed
                ? '无轨迹消息。可再执行或先检查环境/运行时。'
                : '无轨迹消息'}
          </p>
          {isFailed ? (
            <div className="run-trace-empty-actions" data-testid="run-trace-empty-actions">
              <Link
                href="/runs?status=failed"
                className="btn-secondary btn-sm"
                data-testid="run-trace-empty-failed"
              >
                失败运行
              </Link>
              <Link
                href="/settings"
                className="btn-ghost btn-sm"
                data-testid="run-trace-empty-settings"
              >
                环境诊断
              </Link>
              {run.agentId ? (
                <Link
                  href={`/agents/${run.agentId}`}
                  className="btn-ghost btn-sm"
                  data-testid="run-trace-empty-agent"
                >
                  智能体
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="run-trace-list">
          {messages.map((m) => (
            <li key={m.id} className="run-trace-item" data-kind={m.kind}>
              <code>#{m.seq}</code> <strong>{m.kind}</strong>{' '}
              <span className="run-trace-body">{m.body.slice(0, 500)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
