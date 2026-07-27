'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { classifyRunFailure, type AgentRun, type RunMessage } from '@ma/shared';
import { useRetryRun, useRunMessages, useChildRuns } from '@/lib/api';
import {
  filterRunEventView,
  kindToneOf,
  pairArgsLinePreview,
  pairCollapsedPreview,
  pairRunToolEvents,
  parseToolName,
  parseToolPayload,
  previewBody,
  type RunEventDrawerFilter,
  type RunEventViewItem,
} from '@/lib/run-event-pairs';
import {
  isNearBottom,
  NEAR_BOTTOM_PX,
  shouldAutoStick,
} from '@/lib/chat-scroll';
import {
  chatThreadHref,
  qcRetryHref,
  runRecoveryKind,
} from '@/lib/run-recovery';
import { useFocusTrap } from '@/lib/use-focus-trap';
import { useRunProgressStore } from '@/lib/ws';
import { MarkdownBody } from './MarkdownBody';

function kindLabel(kind: RunMessage['kind']): string {
  if (kind === 'tool_start') return '工具开始';
  if (kind === 'tool_end') return '工具结束';
  if (kind === 'assistant') return '助手';
  if (kind === 'user') return '用户';
  return '系统';
}

function kindTone(kind: RunMessage['kind']): string {
  return kindToneOf(kind);
}

/** Slice 73：live partial 展示（对齐 Chat） */
function RunLivePartial({
  text,
  testId = 'run-partial',
}: {
  text: string;
  testId?: string;
}) {
  const t = text.trim();
  if (!t) return null;
  return (
    <div
      className="run-trace-live-partial run-trace-live-card mt-2 p-3 bg-white border border-gray-200 rounded-md shadow-sm relative"
      data-testid={testId}
    >
      <div className="text-xs text-blue-600 font-semibold mb-2 flex items-center">
        <span className="mr-1">…</span> 实时输出
      </div>
      <div className="run-partial-md text-sm text-gray-800">
        <MarkdownBody source={t} />
      </div>
      <span
        className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle"
        aria-hidden
      />
    </div>
  );
}

function RunLiveStreamChunk({ text }: { text: string }) {
  const t = text.trim();
  if (!t) return null;
  return (
    <div
      className="run-trace-live-card mt-2 p-3 bg-white border border-gray-200 rounded-md shadow-sm relative"
      data-testid="run-stream-chunk"
    >
      <div className="text-xs text-blue-600 font-semibold mb-2 flex items-center">
        <span className="mr-1">⚡</span> Agent 正在实时响应中...
      </div>
      <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
        {t}
        <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-1 align-middle" />
      </pre>
    </div>
  );
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
  const { data: childRuns = [] } = useChildRuns(runId ?? '', {
    refetchIntervalMs: run?.status === 'running' || run?.status === 'queued' ? 3000 : false,
  });
  const progressByRun = useRunProgressStore((s) => s.byRunId);
  const toolByRunId = useRunProgressStore((s) => s.toolByRunId);
  const streamChunksByRun = useRunProgressStore((s) => s.streamChunks);
  const partialByRun = useRunProgressStore((s) => s.partialByRunId);
  const progress =
    run && run.status === 'running' ? progressByRun[run.id]?.trim() : undefined;
  const streamChunk = 
    run && run.status === 'running' ? streamChunksByRun[run.id]?.trim() : undefined;
  const activeTool =
    run && run.status === 'running' ? toolByRunId[run.id]?.trim() : undefined;
  const partialText = runId ? partialByRun[runId] : undefined;
  const isLive =
    run?.status === 'queued' ||
    run?.status === 'waiting_local_directory' ||
    run?.status === 'running';
  const isFailed = run?.status === 'failed' || Boolean(run?.error);

  const viewItems = useMemo(() => pairRunToolEvents(messages), [messages]);
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
          <h3 className="issue-section-title">轨迹</h3>
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
              className="btn btn-ghost btn-sm"
              data-testid="run-event-open-drawer"
              onClick={() => onOpenDrawer(run.id)}
            >
              全屏
            </button>
          ) : null}
        </div>
      </div>
      {isLive && activeTool ? (
        <div className="run-trace-active-tool animate-pulse text-blue-600 text-sm py-2">
          <span className="animate-spin inline-block mr-2">🛠️</span>正在执行 [{activeTool}]...
        </div>
      ) : isLive && progress ? (
        <p
          className="run-trace-live-progress"
          data-testid="run-trace-live-progress"
          title={progress}
        >
          进度：{progress}
        </p>
      ) : null}

      {isLive && partialText ? (
        <RunLivePartial text={partialText} testId="run-partial" />
      ) : null}
      {isLive && streamChunk ? (
        <RunLiveStreamChunk text={streamChunk} />
      ) : null}

      {childRuns.length > 0 ? (
        <div className="run-trace-child-runs mt-3 mb-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <h4 className="text-xs font-semibold mb-2 text-gray-700">派生的子代理任务 (Child Subagents)</h4>
          <ul className="space-y-1">
            {childRuns.map((cr) => (
              <li key={cr.id} className="flex justify-between items-center text-xs">
                <Link href={`/runs/${cr.id}`} className="text-blue-600 hover:underline flex items-center shrink-0">
                  <span>{cr.id.slice(0, 8)}…</span>
                  <span className={`ml-2 run-pill run-pill--${cr.status}`}>{cr.status}</span>
                </Link>
                <span className="text-gray-500 truncate ml-4 w-full" title={cr.quickPrompt || ''}>
                  {cr.quickPrompt || '(无提示)'}
                </span>
              </li>
            ))}
          </ul>
        </div>
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
          {viewItems.map((item) => (
            <RunEventViewRow key={viewItemKey(item)} item={item} compact />
          ))}
        </ul>
      )}
    </section>
  );
}

function viewItemKey(item: RunEventViewItem): string {
  if (item.type === 'pair') return `pair-${item.start.id}-${item.end.id}`;
  return item.message.id;
}

function RunEventViewRow({
  item,
  compact,
}: {
  item: RunEventViewItem;
  compact?: boolean;
}) {
  if (item.type === 'pair') {
    return (
      <RunEventToolPair
        start={item.start}
        end={item.end}
        toolName={item.toolName}
        compact={compact}
      />
    );
  }
  return <RunEventItem message={item.message} compact={compact} />;
}

/** G23 + Slice 73：tool_start + tool_end 折叠；header 工具名 + 一行 args + kind 色条 */
function RunEventToolPair({
  start,
  end,
  toolName,
  compact,
}: {
  start: RunMessage;
  end: RunMessage;
  toolName: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const startP = parseToolPayload(start.body);
  const endP = parseToolPayload(end.body);
  const name = toolName ?? startP.name ?? endP.name ?? 'tool';
  const argsLine = pairArgsLinePreview(start, end, compact ? 72 : 96);
  const preview = pairCollapsedPreview(start, end, compact ? 100 : 140);
  const tone = kindToneOf('tool_pair');

  return (
    <li
      className={`run-event-item run-event-item--tool-pair run-event-item--${tone} run-event-kind-bar run-event-kind-bar--${tone}`}
      data-testid="run-event-tool-pair"
      data-kind="tool_pair"
      data-tool-name={name}
      data-kind-tone={tone}
    >
      <button
        type="button"
        className="run-event-item-head"
        data-testid="run-event-tool-pair-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`run-event-chip run-event-chip--${tone}`}>工具</span>
        <span className="run-event-tool-name" data-testid="run-event-tool-pair-name">
          {name}
        </span>
        <code className="run-event-seq">
          #{start.seq}–{end.seq}
        </code>
        <span
          className="run-event-preview run-event-preview--args"
          data-testid="run-event-preview"
          data-preview-kind="args"
          title={preview}
        >
          {argsLine || preview}
        </span>
        <span className="run-event-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div className="run-event-pair-body" data-testid="run-event-tool-pair-body">
          <div className="run-event-pair-part">
            <span className="run-event-pair-label">调用 · args</span>
            <pre className="run-event-body">{start.body}</pre>
          </div>
          <div className="run-event-pair-part">
            <span className="run-event-pair-label">结果 · result</span>
            <pre className="run-event-body">{end.body}</pre>
          </div>
        </div>
      ) : null}
    </li>
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
  const isTool =
    message.kind === 'tool_start' || message.kind === 'tool_end';
  const payload = isTool ? parseToolPayload(message.body) : null;
  const tool = payload?.name ?? (isTool ? parseToolName(message.body) : null);
  const tone = kindTone(message.kind);
  const preview = isTool
    ? [
        message.kind === 'tool_end' ? '完成' : null,
        payload?.summary,
      ]
        .filter(Boolean)
        .join(' · ') || previewBody(message.body, compact ? 120 : 200)
    : previewBody(message.body, compact ? 120 : 200);

  return (
    <li
      className={`run-event-item run-event-item--${tone} run-event-kind-bar run-event-kind-bar--${tone}`}
      data-testid="run-event-item"
      data-kind={message.kind}
      data-kind-tone={tone}
      data-tool-name={tool ?? undefined}
    >
      <button
        type="button"
        className="run-event-item-head"
        data-testid="run-event-item-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`run-event-chip run-event-chip--${tone}${message.body.startsWith('[memory]') ? ' bg-purple-100 text-purple-700' : ''}`}>
          {message.body.startsWith('[memory]') ? '🧠 记忆' : (tool && isTool ? tool : kindLabel(message.kind))}
        </span>
        <code className="run-event-seq">#{message.seq}</code>
        <span
          className={`run-event-preview${message.body.startsWith('[memory]') ? ' font-bold text-purple-700' : ''}`}
          data-testid="run-event-preview"
          title={message.body.slice(0, 500)}
        >
          {preview}
        </span>
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

const DRAWER_FILTERS: { id: RunEventDrawerFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'tool', label: '工具' },
  { id: 'assistant', label: '助手' },
];

/** G23 + Slice 73：drawer 同 inline 消费 partial / stream */
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
  const retry = useRetryRun();
  const progressByRun = useRunProgressStore((s) => s.byRunId);
  const streamChunksByRun = useRunProgressStore((s) => s.streamChunks);
  const partialByRun = useRunProgressStore((s) => s.partialByRunId);
  const progress =
    run && run.status === 'running' ? progressByRun[run.id]?.trim() : undefined;
  const streamChunk =
    run && run.status === 'running' ? streamChunksByRun[run.id]?.trim() : undefined;
  const partialText = runId ? partialByRun[runId] : undefined;
  const isLive =
    run?.status === 'queued' ||
    run?.status === 'waiting_local_directory' ||
    run?.status === 'running';
  const [filter, setFilter] = useState<RunEventDrawerFilter>('all');
  const [stickToBottom, setStickToBottom] = useState(true);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const lastScrollLenRef = useRef(0);
  const stickThrottleRef = useRef(0);

  const viewItems = useMemo(() => pairRunToolEvents(messages), [messages]);
  const filteredItems = useMemo(
    () => filterRunEventView(viewItems, filter),
    [viewItems, filter],
  );

  const failure =
    run && (run.status === 'failed' || run.status === 'timed_out' || run.error)
      ? classifyRunFailure(run.error)
      : null;
  const recovery = run ? runRecoveryKind(run) : 'none';
  const chatHref = run ? chatThreadHref(run) : null;

  useFocusTrap(open && Boolean(run), panelRef, {
    onEscape: onClose,
    restoreFocus: true,
    autoFocus: true,
  });

  useEffect(() => {
    if (!open) {
      setFilter('all');
      setStickToBottom(true);
      lastScrollLenRef.current = 0;
      stickThrottleRef.current = 0;
    }
  }, [open, runId]);

  const handleBodyScroll = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    setStickToBottom(isNearBottom(el, NEAR_BOTTOM_PX));
  }, []);

  // Slice 73：live 时消息 / partial / stream 更新后 stick-bottom（throttle）
  useEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (!el) return;
    const prevHeight = lastScrollLenRef.current;
    const near = isNearBottom(el, NEAR_BOTTOM_PX);
    const should = shouldAutoStick(stickToBottom, near) || prevHeight === 0;
    if (!should) return;

    const now = Date.now();
    // partial/stream 高频：80ms throttle；首屏立即
    if (prevHeight > 0 && now - stickThrottleRef.current < 80) return;
    stickThrottleRef.current = now;
    lastScrollLenRef.current = el.scrollHeight;

	    el.scrollTop = el.scrollHeight;
	    // jsdom 等环境可能无 scrollIntoView；仅有函数时调用
	    const sentinelEl = bottomSentinelRef.current;
	    if (sentinelEl && typeof sentinelEl.scrollIntoView === 'function') {
	      sentinelEl.scrollIntoView({ block: 'end' });
	    }

  }, [
    open,
    messages.length,
    filteredItems.length,
    streamChunk,
    partialText,
    progress,
    stickToBottom,
    filter,
  ]);

  if (!open || !run) return null;

  const toolStarts = messages.filter((m) => m.kind === 'tool_start').length;
  const assistants = messages.filter((m) => m.kind === 'assistant').length;
  const showFailure =
    failure &&
    (run.status === 'failed' ||
      run.status === 'timed_out' ||
      run.status === 'cancelled' ||
      Boolean(run.error));

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
      <div ref={panelRef} className="run-event-drawer-panel" tabIndex={-1}>
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
              href={`/runs?run=${encodeURIComponent(run.id)}&timeline=1&status=all`}
              className="btn-ghost btn-sm"
              data-testid="run-event-drawer-to-runs"
            >
              运行页
            </Link>
            <button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="run-event-drawer-close"
              data-autofocus
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </header>

        {showFailure ? (
          <div
            className="run-event-drawer-failure"
            data-testid="run-event-drawer-failure"
            role="status"
          >
            <div className="run-event-drawer-failure-main">
              <strong data-testid="run-event-drawer-failure-title">
                {failure.title}
              </strong>
              <p className="text-sm text-dim" data-testid="run-event-drawer-failure-hint">
                {failure.hint}
              </p>
              {run.error ? (
                <pre className="run-event-drawer-failure-error" title={run.error}>
                  {run.error.length > 280 ? `${run.error.slice(0, 280)}…` : run.error}
                </pre>
              ) : null}
            </div>
            <div className="run-event-drawer-failure-actions">
              {recovery === 'issue_retry' ? (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  data-testid="run-event-drawer-recovery-cta"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(run.id)}
                >
                  {retry.isPending ? '排队中…' : '再执行'}
                </button>
              ) : null}
              {recovery === 'open_chat' && chatHref ? (
                <Link
                  href={chatHref}
                  className="btn-primary btn-sm"
                  data-testid="run-event-drawer-recovery-cta"
                >
                  打开会话
                </Link>
              ) : null}
              {recovery === 'qc_redispatch' ? (
                <Link
                  href={qcRetryHref(run)}
                  className="btn-primary btn-sm"
                  data-testid="run-event-drawer-recovery-cta"
                >
                  重派
                </Link>
              ) : null}
              {failure.settingsHref ? (
                <Link
                  href={failure.settingsHref}
                  className="btn-ghost btn-sm"
                  data-testid="run-event-drawer-failure-settings"
                >
                  {failure.code === 'cli_missing' ? '运行时' : '环境诊断'}
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="run-event-drawer-stats" data-testid="run-event-drawer-stats">
          <span className="run-event-stat">事件 {messages.length}</span>
          <span className="run-event-stat">工具 {toolStarts}</span>
          <span className="run-event-stat">助手 {assistants}</span>
        </div>

        <div
          className="run-event-drawer-filters"
          data-testid="run-event-drawer-filters"
          role="tablist"
        >
          {DRAWER_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`memory-kind-chip${filter === f.id ? ' is-active' : ''}`}
              data-testid={`run-event-drawer-filter-${f.id}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLive && progress ? (
          <p className="run-trace-live-progress" data-testid="run-event-drawer-progress">
            进度：{progress}
          </p>
        ) : null}
        {isLive && partialText ? (
          <div className="mx-4" data-testid="run-event-drawer-partial-wrap">
            <RunLivePartial text={partialText} testId="run-partial" />
          </div>
        ) : null}
        {isLive && streamChunk ? (
          <div className="mx-4">
            <RunLiveStreamChunk text={streamChunk} />
          </div>
        ) : null}

        <div
          ref={bodyRef}
          className="run-event-drawer-body"
          data-testid="run-event-drawer-body"
          data-stick-bottom={stickToBottom ? '1' : '0'}
          onScroll={handleBodyScroll}
        >
          {messages.length === 0 ? (
            <div className="run-trace-empty" data-testid="run-event-drawer-empty">
              {isLive
                ? '执行中，尚无结构化事件…'
                : run.error
                  ? `无事件 · 错误：${run.error}`
                  : '无事件消息'}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="run-trace-empty" data-testid="run-event-drawer-filter-empty">
              当前筛选无事件
            </div>
          ) : (
            <ul className="run-event-list run-event-list--drawer">
              {filteredItems.map((item) => (
                <RunEventViewRow key={viewItemKey(item)} item={item} />
              ))}
            </ul>
          )}
          <div
            ref={bottomSentinelRef}
            className="run-trace-bottom-sentinel"
            data-testid="run-event-drawer-bottom"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
