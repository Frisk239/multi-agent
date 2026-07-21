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
import {
  chatThreadHref,
  qcRetryHref,
  runRecoveryKind,
} from '@/lib/run-recovery';
import { useRunProgressStore } from '@/lib/ws';
import { EmptyState } from './EmptyState';
import { PageBreadcrumb } from './PageBreadcrumb';
import { PageHeaderMore } from './PageHeaderMore';

/**
 * 运行详情 / transcript
 * 学 Multica Agent 最近工作「轨迹」弹层：顶栏 meta chips + 工具/助手事件时间线
 * 路由：/runs/:id
 */

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

function kindLabel(kind: RunMessage['kind']): string {
  if (kind === 'tool_start') return '工具';
  if (kind === 'tool_end') return '工具结束';
  if (kind === 'assistant') return 'Agent';
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

function clockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

/** A2 UX Trust：cwd mode → 中文标签 */
function cwdModeLabel(mode: string | null | undefined): string {
  switch (mode) {
    case 'project_local':
      return '项目本机';
    case 'workspace':
      return '工作区';
    case 'isolated_issue':
    case 'isolated_run':
      return '隔离';
    case 'chat_scratch':
      return '聊天隔离';
    case 'none':
      return '未就绪';
    default:
      return mode ? mode : '未知';
  }
}

function toolNameFromBody(body: string): string | null {
  try {
    const j = JSON.parse(body) as { name?: string };
    if (j?.name) return String(j.name);
  } catch {
    /* not json */
  }
  const m =
    body.match(/^(?:tool[_ ]?name|name)\s*[:=]\s*["']?([\w./-]+)/i) ||
    body.match(/^([A-Za-z][\w./-]{0,40})\s*[:(]/);
  return m?.[1] ?? null;
}

function previewBody(body: string, max = 420): string {
  const t = body.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

const KIND_FILTERS: { id: '' | RunMessage['kind']; label: string }[] = [
  { id: '', label: '全部' },
  { id: 'assistant', label: 'Agent' },
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  const statusZh =
    run?.status === 'completed'
      ? '已完成'
      : run?.status === 'failed'
        ? '失败'
        : run?.status === 'running'
          ? '执行中'
          : run?.status === 'queued'
            ? '排队'
            : run?.status === 'cancelled'
              ? '已取消'
              : run?.status;

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
  const recovery = runRecoveryKind(run);
  const chatHref = chatThreadHref(run);

  return (
    <div
      className="page-container run-detail-page run-detail-page--multica"
      data-testid="run-detail-page"
    >
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
          {recovery === 'issue_retry' ? (
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
          {recovery === 'open_chat' && chatHref ? (
            <Link
              href={chatHref}
              className="btn btn-primary btn-sm"
              data-testid="run-detail-open-chat"
              title="回会话重发，勿调用 Issue 再执行"
            >
              打开会话
            </Link>
          ) : null}
          {recovery === 'qc_redispatch' ? (
            <Link
              href={qcRetryHref(run)}
              className="btn btn-secondary btn-sm"
              data-testid="run-detail-qc-redispatch"
              title="无 Issue 的快速派活请重新派活"
            >
              重派
            </Link>
          ) : null}
          {canStop && chatHref ? (
            <Link
              href={chatHref}
              className="btn btn-secondary btn-sm"
              data-testid="run-detail-open-chat-live"
            >
              打开会话
            </Link>
          ) : null}
          <PageHeaderMore testId="run-detail-more">
            {run.issueId ? (
              <Link
                href={`/issues/${run.issueId}`}
                role="menuitem"
                data-testid="run-detail-to-issue"
              >
                打开 Issue
              </Link>
            ) : null}
            {chatHref ? (
              <Link
                href={chatHref}
                role="menuitem"
                data-testid="run-detail-to-chat"
              >
                打开聊天会话
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

      {/* Multica 式顶栏：agent + 状态 chips + 统计 */}
      <header className="run-detail-sheet-head" data-testid="run-detail-header">
        <div className="run-detail-sheet-title-row">
          <Link
            href={`/agents/${run.agentId}`}
            className="run-detail-agent-link"
            data-testid="run-detail-agent"
          >
            {agent?.name ?? shortId(run.agentId)}
          </Link>
          <span
            className={`run-pill run-pill--${run.status}`}
            data-testid="run-detail-status"
          >
            {statusZh}
          </span>
          {isLive ? (
            <span className="run-trace-live-badge" data-testid="run-detail-live">
              live
            </span>
          ) : null}
          {run.isLeader ? <span className="leader-badge">队长</span> : null}
        </div>

        <div className="run-detail-chip-row" data-testid="run-detail-meta">
          <span className="run-detail-chip">{run.runtime}</span>
          {run.issueId ? (
            <Link
              href={`/issues/${run.issueId}`}
              className="run-detail-chip run-detail-chip--link"
              data-testid="run-detail-issue-chip"
            >
              Issue {shortId(run.issueId)}
            </Link>
          ) : chatHref ? (
            <Link
              href={chatHref}
              className="run-detail-chip run-detail-chip--link"
              data-testid="run-detail-chat-chip"
            >
              聊天会话
            </Link>
          ) : (
            <span className="run-detail-chip">
              {run.kind === 'chat'
                ? '聊天'
                : run.kind === 'quick_create'
                  ? '快速派活'
                  : run.kind}
            </span>
          )}
          <span className="run-detail-chip">
            耗时 {durationLabel(run.startedAt, run.finishedAt)}
          </span>
          <span className="run-detail-chip">工具 {toolCount}</span>
          <span className="run-detail-chip">事件 {messages.length}</span>
          <span className="run-detail-chip">助手 {assistantCount}</span>
          <span className="run-detail-chip text-dim">
            {run.createdAt ? new Date(run.createdAt).toLocaleString() : ''}
          </span>
        </div>

        {run.cwdMode || run.cwdPath ? (
          <div
            className="run-detail-cwd"
            data-testid="run-cwd"
            data-cwd-mode={run.cwdMode ?? 'unknown'}
            title={run.cwdPath ?? undefined}
          >
            <span className="run-detail-cwd-label">
              工作目录 · {cwdModeLabel(run.cwdMode)}
            </span>
            {run.cwdPath ? (
              <code className="run-detail-cwd-path" data-testid="run-cwd-path">
                {run.cwdPath}
              </code>
            ) : (
              <span className="text-dim">（无路径）</span>
            )}
          </div>
        ) : null}

        {isLive && progress ? (
          <p className="run-trace-live-progress" data-testid="run-detail-progress">
            进度：{progress}
          </p>
        ) : null}

        {failure ? (
          <div className="run-failure-box" data-testid="run-detail-failure">
            <strong>{failure.title}</strong>
            <p className="text-sm run-failure-hint">{failure.hint}</p>
            {run.error ? <pre className="run-error-pre">{run.error}</pre> : null}
          </div>
        ) : null}

        {run.quickPrompt ? (
          <details className="run-detail-prompt-fold" data-testid="run-detail-prompt">
            <summary>输入 / prompt</summary>
            <pre className="run-detail-prompt-body">{run.quickPrompt}</pre>
          </details>
        ) : null}
      </header>

      <section className="run-detail-transcript" data-testid="run-detail-transcript">
        <div className="run-detail-transcript-head">
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
          <span className="text-dim text-sm">
            {kindFilter ? `显示 ${filtered.length}` : `共 ${messages.length} 条`}
          </span>
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
          <ol className="run-transcript-list" data-testid="run-detail-events">
            {filtered.map((m) => {
              const tool = toolNameFromBody(m.body);
              const isLong = (m.body?.length ?? 0) > 280;
              const open = expanded[m.id] ?? !isLong;
              const label =
                m.kind === 'tool_start' || m.kind === 'tool_end'
                  ? tool || kindLabel(m.kind)
                  : kindLabel(m.kind);
              return (
                <li
                  key={m.id}
                  className={`run-transcript-row run-transcript-row--${kindTone(m.kind)}`}
                  data-kind={m.kind}
                  data-testid="run-detail-event"
                >
                  <button
                    type="button"
                    className={`run-transcript-chip run-event-chip--${kindTone(m.kind)}`}
                    onClick={() =>
                      setExpanded((s) => ({ ...s, [m.id]: !(s[m.id] ?? !isLong) }))
                    }
                    title="展开/折叠"
                  >
                    {label}
                  </button>
                  <div className="run-transcript-body-wrap">
                    {isLong ? (
                      <button
                        type="button"
                        className="run-transcript-toggle"
                        onClick={() =>
                          setExpanded((s) => ({
                            ...s,
                            [m.id]: !(s[m.id] ?? false),
                          }))
                        }
                      >
                        {open ? '▾' : '▸'}
                      </button>
                    ) : (
                      <span className="run-transcript-toggle-spacer" />
                    )}
                    <div className="run-transcript-text">
                      {open ? m.body || '—' : previewBody(m.body || '—')}
                    </div>
                  </div>
                  <div className="run-transcript-meta text-dim">
                    <span>#{m.seq}</span>
                    <span>{clockTime(m.createdAt) || relativeTime(m.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
