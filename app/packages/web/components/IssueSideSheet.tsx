'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { IssueDetail } from './IssueDetail';
import { useFocusTrap } from '@/lib/use-focus-trap';

/**
 * Slice 32：看板/列表点卡 → 右侧 Issue 详情 Sheet。
 * URL 由调用方用 `?issue=` 驱动；本组件只管展示 / Esc / 关闭。
 * 全页深链仍走 `/issues/[id]`。
 */
export function IssueSideSheet({
  issueId,
  onClose,
}: {
  issueId: string | null | undefined;
  onClose: () => void;
}) {
  const open = Boolean(issueId);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(open, panelRef, {
    onEscape: onClose,
    restoreFocus: true,
    autoFocus: true,
  });

  if (!open || !issueId) return null;

  return (
    <div
      className="issue-side-sheet-root"
      data-testid="issue-side-sheet"
      data-issue-id={issueId}
      role="dialog"
      aria-modal="true"
      aria-label="Issue 详情"
      aria-labelledby="issue-side-sheet-head"
    >
      <button
        type="button"
        className="issue-side-sheet-backdrop"
        aria-label="关闭详情"
        data-testid="issue-side-sheet-backdrop"
        onClick={onClose}
      />
      <div ref={panelRef} className="issue-side-sheet-panel" tabIndex={-1}>
        <header className="issue-side-sheet-head" data-testid="issue-side-sheet-head">
          <div className="issue-side-sheet-head-meta">
            <span className="issue-side-sheet-kicker">Issue</span>
            <span className="text-dim text-sm" title={issueId}>
              {issueId.slice(0, 8)}…
            </span>
            <span className="text-xs text-blue-500">Rich Text 附件</span>
          </div>
          <div className="issue-side-sheet-actions">
            <Link
              href={`/issues/${issueId}`}
              className="btn-ghost btn-sm"
              data-testid="issue-side-sheet-fullpage"
              title="打开全页详情（可分享深链）"
            >
              全页
            </Link>
            <button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="issue-side-sheet-close"
              data-autofocus
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </header>
        <div className="issue-side-sheet-body" data-testid="issue-side-sheet-body">
          <IssueDetail id={issueId} variant="sheet" />
        </div>
      </div>
    </div>
  );
}

/** 在现有 searchParams 上写入 / 清除 `issue`，供看板/列表复用 */
export function withIssueSearchParam(
  current: string | URLSearchParams,
  issueId: string | null,
): string {
  const sp =
    typeof current === 'string'
      ? new URLSearchParams(current)
      : new URLSearchParams(current.toString());
  if (issueId) sp.set('issue', issueId);
  else sp.delete('issue');
  return sp.toString();
}

/** 构造可分享的侧滑 URL：pathname + ?…&issue=id（#hash 可选） */
export function buildIssueSheetHref(
  pathname: string,
  currentSearch: string | URLSearchParams,
  issueId: string,
  hash?: string,
): string {
  const qs = withIssueSearchParam(currentSearch, issueId);
  const base = qs ? `${pathname}?${qs}` : `${pathname}?issue=${encodeURIComponent(issueId)}`;
  if (!hash) return base;
  const h = hash.startsWith('#') ? hash : `#${hash}`;
  return `${base}${h}`;
}
