'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { classifyRunFailure, type RunMessage } from '@ma/shared';
import {
  useAgent,
  useCancelRun,
  useRetryRun,
  useRun,
  useRunMessages,
} from '@/lib/api';
import { useRunProgressStore } from '@/lib/ws';
import { EmptyState } from './EmptyState';
import { PageBreadcrumb } from './PageBreadcrumb';
import { PageHeaderMore } from './PageHeaderMore';

/**
 * 运行详情 / transcript（学 Multica AgentTranscriptDialog，独立可分享路由）
 * 列表进详情：/runs/:id
 */

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function kindLabel(kind: RunMessage['kind']): string {
  if (kind === 'tool_start') return '工具开始';
  if (kind === 'tool_end') return '工具结束';
  if (kind === 'assistant') return '助手';
  if (kind === 'user') return '用户';
  return '系统';
}

function kindTone(kind: RunMessage['kind']): string {
  if (kind === 'tool_start') return 'tool';
  if (kind === 'tool_end') return 'tool-end';
  if (kind === 'assistant') return 'assistant';
  if (kind === 'user') return 'user';
  return 'system';
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
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

function durationLabel(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return '—';
  const a = new Date(startedAt).getTime();
  const b = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return '—';
  const ms = b - a;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min}m ${rem}s` : `${min}m`;
}

const KIND_FILTERS: { id: '' | RunMessage['kind']; label: string }[] = [
  { id: '', label: '全部' },
  { id: 'assistant', label: '助手' },
  { id: 'tool_start', label: '工具' },
  { id: 'tool_end', label: '工具结束' },
  { id: 'user', label: '用户' },
  { id: 'system', label: '系统' },
];

export function RunDetailPage({ runId }: { runId: string }) {
  const { data: run, isLoading, isError, error, refetch, isFetching } = useRun(runId);
  const { data: messages = [], isFetching: msgFetching } = useRunMessages(runId);
  const { data: agent } = useAgent(run?.agentId ?? '');
  const cancel = useCancelRun();
  const retry = useRetryRun();
  const progressByRun = useRunProgressStore((s) => s.byRunId);
  const [kindFilter, setKindFilter] = useState<'' | RunMessage['kind']>('');

  const isLive = run?.status === 'queued' || run?.status === 'running';
  const progress =
    run && run.status === 'running' ? progressByRun[run.id]?.trim() : undefined;
  const failure =
    run && (run.status === 'failed' || run.error)
      ? classifyRunFailure(run.error)
      : null;

  const filtered = useMemo(() => {
    if (!kindFilter) return messages;
    if (kindFilter === 'tool_start') {
      return messages.filter(
        (m) => m.kind === 'tool_start' || m.kind === 'tool_end',
      );
    }
    return messages.filter((m) => m.kind === kindFilter);
  }, [messages, kindFilter]);

  const toolCount = useMemo(
    () => messages.filter((m) => m.kind === 'tool_start').length,
    [messages],
  );
  const assistantCount = useMemo(
    () => messages.filter((m) => m.kind === 'assistant').length,
    [messages],
  );

  if (isLoading) {
    return <div className="page-container">加载运行…</div>;
  }
  if (isError || !run) {
    return (
      <div className="page-container">
        <EmptyState
          title="运行不存在"
          description={error instanceof Error ? error.message : '请从运行列表重新进入'}
          action={
            <Link href="/runs" className="btn btn-primary btn-sm">
              返回运行
            </Link>
          }
        />
      </div>
    );
  }

  const canStop = run.status === 'queued' || run.status === 'running';
  const canRetry = run.status === 'failed' || run.status === 'cancelled';

  return (
    <div className="page-container run-detail-page" data-testid="run-detail-page">
      <div className="run-detail-top">
        <PageBreadcrumb
          testId="run-detail-breadcrumb"
          items={[
            { label: '运行', href: '/runs' },
            { label: shortId(run.id) },
          ]}
        />
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="run-detail-refresh"
            disabled={isFetching || msgFetching}
            onClick={() => void refetch()}
          >
            {isFetching || msgFetching ? '刷新中…' : '刷新'}
          </button>
          {canStop ? (
            <button
              type="button"
              className="btn-stop btn-sm"
              data-testid="run-detail-cancel"
              disabled={cancel.isPending}
              onClick={() => {
                if (!window.confirm('停止该运行？')) return;
                cancel.mutate(run.id);
              }}
            >
              {cancel.isPending ? '停止中…' : '停止'}
            </button>
          ) : null}
          {canRetry && run.issueId ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="run-detail-retry"
              disabled={retry.isPending}
              onClick={() => retry.mutate(run.id)}
            >
              {retry.isPending ? '排队中…' : '再执行'}
            </button>
          ) : null}
          <PageHeaderMore testId="run-detail-more">
            {run.issueId ? (
              <Link
                href={`/issues/${run.issueId}#run-trace`}
                role="menuitem"
                data-testid="run-detail-to-issue"
              >
                Issue 轨迹
              </Link>
            ) : null}
            <Link
              href={`/agents/${run.agentId}`}
              role="menuitem"
              data-testid="run-detail-to-agent"
            >
              智能体
            </Link>
            <button
              type="button"
              role="menuitem"
              data-testid="run-detail-copy-id"
              onClick={() => void navigator.clipboard?.writeText(run.id)}
            >
              复制 run id
            </button>
            <button
              type="button"
              role="menuitem"
              data-testid="run-detail-copy-events"
              onClick={() => {
                const text = messages
                  .map((m) => `#${m.seq} [${m.kind}] ${m.body}`)
                  .join('\n\n');
                void navigator.clipboard?.writeText(text || '(empty)');
              }}
            >
              复制全部事件
            </button>
          </PageHeaderMore>
        </div>
      </div>

      <header className="run-detail-header" data-testid="run-detail-header">
        <div className="run-detail-title-row">
          <span
            className={`run-pill run-pill--${run.status}`}
            data-testid="run-detail-status"
          >
            {run.status}
          </span>
          {isLive ? (
            <span className="run-trace-live-badge" data-testid="run-detail-live">
              live
            </span>
          ) : null}
          {run.isLeader ? <span className="leader-badge">队长</span> : null}
          <h1 className="run-detail-title">
            {run.kind === 'chat'
              ? '聊天运行'
              : run.kind === 'quick_create'
                ? '快速派活'
                : run.issueId
                  ? `Issue ${shortId(run.issueId)}`
                  : '运行详情'}
          </h1>
        </div>
        <div className="run-detail-meta" data-testid="run-detail-meta">
          <span>
            Agent{' '}
            <Link href={`/agents/${run.agentId}`} className="table-link">
              {agent?.name ?? shortId(run.agentId)}
            </Link>
          </span>
          <span className="text-dim">·</span>
          <span className="text-dim">{run.runtime}</span>
          <span className="text-dim">·</span>
          <span className="text-dim">耗时 {durationLabel(run.startedAt, run.finishedAt)}</span>
          <span className="text-dim">·</span>
          <span className="text-dim">创建 {relativeTime(run.createdAt)}</span>
        </div>
        {isLive && progress ? (
          <p className="run-trace-live-progress" data-testid="run-detail-progress">
            进度：{progress}
          </p>
        ) : null}
        {failure ? (
          <div className="run-failure-box" data-testid="run-detail-failure">
            <strong>{failure.title}</strong>
            <p className="text-sm run-failure-hint">{failure.hint}</p>
            {run.error ? (
              <pre className="run-error-pre">{run.error}</pre>
            ) : null}
          </div>
        ) : null}
        {run.quickPrompt ? (
          <div className="run-detail-prompt" data-testid="run-detail-prompt">
            <div className="issue-section-title">输入</div>
            <pre className="run-detail-prompt-body">{run.quickPrompt}</pre>
          </div>
        ) : null}
      </header>

      <section className="run-detail-transcript" data-testid="run-detail-transcript">
        <div className="run-detail-transcript-head">
          <div className="run-detail-stats" data-testid="run-detail-stats">
            <span className="run-event-stat">事件 {messages.length}</span>
            <span className="run-event-stat">工具 {toolCount}</span>
            <span className="run-event-stat">助手 {assistantCount}</span>
            {kindFilter ? (
              <span className="run-event-stat">显示 {filtered.length}</span>
            ) : null}
          </div>
          <div className="run-detail-filters" data-testid="run-detail-filters" role="tablist">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.id || 'all'}
                type="button"
                role="tab"
                aria-selected={kindFilter === f.id}
                className={`memory-kind-chip${kindFilter === f.id ? ' is-active' : ''}`}
                data-testid={`run-detail-filter-${f.id || 'all'}`}
                onClick={() => setKindFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="run-trace-empty" data-testid="run-detail-empty">
            {isLive
              ? '执行中，尚无结构化事件…（部分 runtime 结束时才落消息）'
              : failure
                ? '无事件消息。可再执行或检查环境/运行时。'
                : kindFilter
                  ? '当前筛选无事件'
                  : '无事件消息'}
          </div>
        ) : (
          <ul className="run-event-list run-event-list--detail" data-testid="run-detail-events">
            {filtered.map((m) => (
              <li
                key={m.id}
                className={`run-event-item run-event-item--${kindTone(m.kind)}`}
                data-kind={m.kind}
                data-testid="run-detail-event"
              >
                <div className="run-event-item-head run-event-item-head--static">
                  <span className={`run-event-chip run-event-chip--${kindTone(m.kind)}`}>
                    {kindLabel(m.kind)}
                  </span>
                  <span className="run-event-seq text-dim">#{m.seq}</span>
                  <span className="run-event-time text-dim">
                    {relativeTime(m.createdAt)}
                  </span>
                </div>
                <pre className="run-event-body">{m.body || '—'}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
