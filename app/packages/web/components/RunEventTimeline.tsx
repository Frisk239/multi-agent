'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { AgentRun, RunMessage } from '@ma/shared';
import { useRunMessages } from '@/lib/api';
import { useRunProgressStore } from '@/lib/ws';

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

function previewBody(body: string, max = 280): string {
  const t = body.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function parseToolName(body: string): string | null {
  // 常见：`bash: …` / `Tool: Read` / JSON name
  const m =
    body.match(/^(?:tool[_ ]?name|name)\s*[:=]\s*["']?([\w./-]+)/i) ||
    body.match(/^([A-Za-z][\w./-]{0,40})\s*[:(]/) ||
    body.match(/"name"\s*:\s*"([^"]+)"/);
  return m?.[1] ?? null;
}

export function RunEventTimelineInline({
  run,
  onOpenDrawer,
}: {
  run: AgentRun | undefined;
  onOpenDrawer?: (runId: string) => void;
}) {
  const runId = run?.id;
  const { data: messages = [] } = useRunMessages(runId);
  const progressByRun = useRunProgressStore((s) => s.byRunId);
  const progress =
    run && run.status === 'running' ? progressByRun[run.id]?.trim() : undefined;
  const isLive = run?.status === 'queued' || run?.status === 'running';
  const isFailed = run?.status === 'failed' || Boolean(run?.error);

  const toolCount = useMemo(
    () => messages.filter((m) => m.kind === 'tool_start' || m.kind === 'tool_end').length,
    [messages],
  );

  if (!runId || !run) return null;

  return (
    <section
      id="run-trace"
      className={`run-trace run-event-timeline${isLive ? ' run-trace--live' : ''}`}
      data-testid="run-trace"
      data-run-status={run.status}
      data-run-id={run.id}
    >
      <div className="run-trace-header">
        <div className="run-trace-title-row">
          <h3>事件轨迹</h3>
          <span className="text-dim text-sm" data-testid="run-trace-run-id">
            {run.id.slice(0, 8)}…
          </span>
          {toolCount > 0 ? (
            <span className="run-event-tool-count" data-testid="run-event-tool-count">
              工具 {toolCount}
            </span>
          ) : null}
          {isLive ? (
            <span className="run-trace-live-badge" data-testid="run-trace-live-badge">
              live
            </span>
          ) : null}
        </div>
        <div className="run-trace-header-links" data-testid="run-trace-header-links">
          {onOpenDrawer ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="run-event-open-drawer"
              onClick={() => onOpenDrawer(run.id)}
            >
              展开
            </button>
          ) : null}
          <Link
            href={`/runs?run=${encodeURIComponent(run.id)}&status=${encodeURIComponent(run.status)}`}
            className="btn-ghost btn-sm"
            data-testid="run-trace-to-runs"
          >
            列表
          </Link>
          {isFailed ? (
            <Link
              href="/settings"
              className="btn-ghost btn-sm"
              data-testid="run-trace-to-settings"
            >
              诊断
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
                ? '无事件消息。可再执行或先检查环境/运行时。'
                : '无事件消息'}
          </p>
        </div>
      ) : (
        <ul className="run-event-list" data-testid="run-event-list">
          {messages.map((m) => (
            <RunEventItem key={m.id} message={m} compact />
          ))}
        </ul>
      )}
    </section>
  );
}

function RunEventItem({
  message,
  compact,
}: {
  message: RunMessage;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(!compact && message.kind === 'assistant');
  const tool = parseToolName(message.body);
  const tone = kindTone(message.kind);

  return (
    <li
      className={`run-event-item run-event-item--${tone}`}
      data-testid="run-event-item"
      data-kind={message.kind}
    >
      <button
        type="button"
        className="run-event-item-head"
        data-testid="run-event-item-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`run-event-chip run-event-chip--${tone}`}>
          {tool && (message.kind === 'tool_start' || message.kind === 'tool_end')
            ? tool
            : kindLabel(message.kind)}
        </span>
        <code className="run-event-seq">#{message.seq}</code>
        <span className="run-event-preview">{previewBody(message.body, compact ? 120 : 200)}</span>
        <span className="run-event-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <pre className="run-event-body" data-testid="run-event-body">
          {message.body}
        </pre>
      ) : null}
    </li>
  );
}

/** G23：全屏/抽屉事件时间线（Issue / Runs 共用） */
export function RunEventTimelineDrawer({
  run,
  open,
  onClose,
}: {
  run: AgentRun | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const runId = run?.id;
  const { data: messages = [] } = useRunMessages(open ? runId : undefined);
  const progressByRun = useRunProgressStore((s) => s.byRunId);
  const progress =
    run && run.status === 'running' ? progressByRun[run.id]?.trim() : undefined;
  const isLive = run?.status === 'queued' || run?.status === 'running';

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !run) return null;

  const toolStarts = messages.filter((m) => m.kind === 'tool_start').length;
  const assistants = messages.filter((m) => m.kind === 'assistant').length;

  return (
    <div
      className="run-event-drawer-root"
      data-testid="run-event-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="运行事件时间线"
    >
      <button
        type="button"
        className="run-event-drawer-backdrop"
        aria-label="关闭时间线"
        data-testid="run-event-drawer-backdrop"
        onClick={onClose}
      />
      <div className="run-event-drawer-panel">
        <header className="run-event-drawer-head">
          <div>
            <h2 className="run-event-drawer-title">运行事件时间线</h2>
            <p className="text-dim text-sm" data-testid="run-event-drawer-meta">
              {run.id.slice(0, 8)}… · {run.status}
              {run.runtime ? ` · ${run.runtime}` : ''}
              {isLive ? ' · live' : ''}
            </p>
          </div>
          <div className="run-event-drawer-actions">
            <button
              type="button"
              className="btn-ghost btn-sm"
              data-testid="run-event-copy"
              onClick={() => {
                const text = messages
                  .map((m) => `#${m.seq} [${m.kind}] ${m.body}`)
                  .join('\n\n');
                void navigator.clipboard?.writeText(text || '(empty)');
              }}
            >
              复制
            </button>
            <Link
              href={`/runs?run=${encodeURIComponent(run.id)}&status=all`}
              className="btn-ghost btn-sm"
            >
              运行页
            </Link>
            <button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="run-event-drawer-close"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </header>

        <div className="run-event-drawer-stats" data-testid="run-event-drawer-stats">
          <span className="run-event-stat">事件 {messages.length}</span>
          <span className="run-event-stat">工具 {toolStarts}</span>
          <span className="run-event-stat">助手 {assistants}</span>
        </div>
        {isLive && progress ? (
          <p className="run-trace-live-progress" data-testid="run-event-drawer-progress">
            进度：{progress}
          </p>
        ) : null}

        <div className="run-event-drawer-body">
          {messages.length === 0 ? (
            <div className="run-trace-empty" data-testid="run-event-drawer-empty">
              {isLive
                ? '执行中，尚无结构化事件…'
                : run.error
                  ? `无事件 · 错误：${run.error}`
                  : '无事件消息'}
            </div>
          ) : (
            <ul className="run-event-list run-event-list--drawer">
              {messages.map((m) => (
                <RunEventItem key={m.id} message={m} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
