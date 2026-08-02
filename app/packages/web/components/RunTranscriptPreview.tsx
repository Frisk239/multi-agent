'use client';

import Link from 'next/link';
import { useRunMessages } from '@/lib/api';
import {
  pairRunToolEvents,
  pairArgsLinePreview,
  parseToolPayload,
  previewBody,
  type RunEventViewItem,
} from '@/lib/run-event-pairs';

/**
 * G3-3：run 历史行内 transcript 摘要（不跳页可见产出）。
 * 复用 pairRunToolEvents 配对：tool 事件一行（工具名 + args/result 摘要）、
 * assistant 消息一段文本摘要；未配对/系统消息折叠计数。
 */
function previewBodyLong(body: string): string {
  return previewBody(body, 160);
}

function renderItem(item: RunEventViewItem, index: number) {
  if (item.type === 'pair') {
    const line = pairArgsLinePreview(item.start, item.end, 120);
    const tool = item.toolName ?? '工具';
    return (
      <li
        key={index}
        className="run-preview-item run-preview-item--tool"
        data-testid="run-preview-tool"
      >
        <code className="run-preview-tool-name">{tool}</code>
        {line ? (
          <span className="run-preview-line text-dim">{line}</span>
        ) : null}
      </li>
    );
  }
  const m = item.message;
  if (m.kind === 'assistant') {
    const body = m.body?.trim();
    if (!body) return null;
    return (
      <li
        key={index}
        className="run-preview-item run-preview-item--assistant"
        data-testid="run-preview-assistant"
      >
        <span className="run-preview-label">助手</span>
        <span className="run-preview-line">{previewBodyLong(body)}</span>
      </li>
    );
  }
  if (m.kind === 'user') {
    const body = m.body?.trim();
    if (!body) return null;
    return (
      <li
        key={index}
        className="run-preview-item run-preview-item--user"
        data-testid="run-preview-user"
      >
        <span className="run-preview-label">用户</span>
        <span className="run-preview-line text-dim">{previewBodyLong(body)}</span>
      </li>
    );
  }
  // 未配对的 tool_start/end/系统消息：折叠计数不展示明细
  return null;
}

export function RunTranscriptPreview({
  runId,
  maxItems = 6,
}: {
  runId: string;
  maxItems?: number;
}) {
  const { data: messages, isLoading, isError } = useRunMessages(runId);

  if (isLoading) {
    return (
      <div className="run-preview run-preview--loading text-dim text-sm" data-testid="run-preview-loading">
        加载轨迹…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="run-preview run-preview--error text-dim text-sm" data-testid="run-preview-error">
        轨迹加载失败
      </div>
    );
  }
  const items = pairRunToolEvents(messages ?? []);
  if (items.length === 0) {
    return (
      <div className="run-preview run-preview--empty text-dim text-sm" data-testid="run-preview-empty">
        暂无轨迹数据
      </div>
    );
  }

  const visible = items.slice(0, maxItems);
  const hiddenCount = items.length - visible.length;
  const toolCount = items.filter((i) => i.type === 'pair').length;
  const hasToolPayload = visible.some(
    (i) =>
      i.type === 'pair' &&
      (parseToolPayload(i.start.body).argsText != null ||
        parseToolPayload(i.end.body).resultText != null),
  );

  return (
    <div className="run-preview" data-testid="run-preview" data-run-id={runId}>
      <ul className="run-preview-list">
        {visible.map((item, i) => renderItem(item, i))}
      </ul>
      <div className="run-preview-footer text-dim text-sm">
        <span data-testid="run-preview-counts">
          {items.length} 条事件 · {toolCount} 个工具
        </span>
        {hiddenCount > 0 ? (
          <span> · 收起 {hiddenCount} 条</span>
        ) : null}
        {hasToolPayload ? (
          <Link
            href={`/runs?run=${encodeURIComponent(runId)}&timeline=1&status=all`}
            className="btn btn-ghost btn-sm"
            data-testid="run-preview-open"
          >
            完整轨迹
          </Link>
        ) : null}
      </div>
    </div>
  );
}
