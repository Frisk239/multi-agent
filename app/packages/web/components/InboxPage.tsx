'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useArchiveInbox,
  useArchiveInboxMany,
  useInbox,
  useMarkInboxRead,
  useMarkInboxReadMany,
  useRetryRun,
} from '@/lib/api';
import type { InboxItem } from '@ma/shared';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { IssueDetail } from './IssueDetail';
import { MarkdownBody } from './MarkdownBody';

type ReadFilter = 'all' | 'unread' | 'read';
type KindFilter = '' | InboxItem['kind'];

const KIND_VALUES: InboxItem['kind'][] = [
  'comment',
  'run_completed',
  'run_failed',
  'assigned',
];

function kindLabel(kind: InboxItem['kind']): string {
  if (kind === 'comment') return '新评论';
  if (kind === 'run_completed') return '运行完成';
  if (kind === 'assigned') return '已指派';
  return '运行失败';
}

function kindClass(kind: InboxItem['kind']): string {
  if (kind === 'comment') return 'inbox-kind inbox-kind--comment';
  if (kind === 'run_completed') return 'inbox-kind inbox-kind--ok';
  if (kind === 'assigned') return 'inbox-kind inbox-kind--comment';
  return 'inbox-kind inbox-kind--fail';
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
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleString();
}

function parseReadFilter(raw: string | null): ReadFilter {
  if (raw === 'unread' || raw === 'read' || raw === 'all') return raw;
  return 'all';
}

function parseKindFilter(raw: string | null): KindFilter {
  if (raw && (KIND_VALUES as string[]).includes(raw)) return raw as KindFilter;
  return '';
}

function isFailItem(item: InboxItem): boolean {
  return item.kind === 'run_failed' || item.type === 'run_failed';
}

function isCwdFailBody(text: string | null | undefined): boolean {
  const e = (text ?? '').toLowerCase();
  return e.includes('cwd') || e.includes('ma_workspace_cwd') || e.includes('工作目录');
}

function runListHref(item: InboxItem): string | null {
  if (!item.runId) {
    if (isFailItem(item)) return '/runs?status=failed';
    return null;
  }
  const sp = new URLSearchParams();
  sp.set('run', item.runId);
  if (isFailItem(item)) sp.set('status', 'failed');
  if (item.kind === 'run_completed' || item.type === 'run_completed') {
    sp.set('status', 'completed');
  }
  return `/runs?${sp.toString()}`;
}

/** Multica：同一 Issue 多条通知折叠为最新一条（列表按创建时间 desc） */
function dedupeInboxItems(items: InboxItem[]): InboxItem[] {
  const seen = new Set<string>();
  const out: InboxItem[] = [];
  for (const item of items) {
    const key = item.issueId ?? `item:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function displayTitle(item: InboxItem): string {
  if (item.issueTitle?.trim()) return item.issueTitle.trim();
  if (item.issueIdentifier) return item.issueIdentifier;
  return item.title || item.summary || '通知';
}

function displaySubtitle(item: InboxItem): string {
  const body = (item.body ?? item.summary ?? '').trim().replace(/\s+/g, ' ');
  if (body && body !== item.title) {
    return body.length > 120 ? `${body.slice(0, 120)}…` : body;
  }
  return kindLabel(item.kind);
}

function InboxRetryButton({
  item,
  onDone,
}: {
  item: InboxItem;
  onDone?: () => void;
}) {
  const router = useRouter();
  const retry = useRetryRun();
  const [pending, setPending] = useState(false);
  if (!item.runId || !isFailItem(item)) return null;

  async function onRecover() {
    if (!item.runId || pending || retry.isPending) return;
    setPending(true);
    try {
      // F5/F10：按 run.kind 诚实分流；标题兜底（run 已删时仍可回会话）
      const res = await fetch(
        `http://localhost:3001/api/runs/${encodeURIComponent(item.runId)}`,
      );
      if (res.ok) {
        const run = (await res.json()) as {
          kind?: string;
          issueId?: string | null;
          chatThreadId?: string | null;
          quickPrompt?: string | null;
        };
        if (run.kind === 'chat') {
          const href = run.chatThreadId
            ? `/chat?thread=${encodeURIComponent(run.chatThreadId)}`
            : '/chat';
          router.push(href);
          onDone?.();
          setPending(false);
          return;
        }
        if (!run.issueId) {
          const qp = run.quickPrompt?.trim()
            ? `?quickPrompt=${encodeURIComponent(run.quickPrompt.trim())}`
            : '';
          router.push(`/${qp}`);
          onDone?.();
          setPending(false);
          return;
        }
      } else if (/聊天失败|聊天/.test(item.title ?? '')) {
        router.push('/chat');
        onDone?.();
        setPending(false);
        return;
      }
      retry.mutate(item.runId, {
        onSuccess: () => onDone?.(),
        onSettled: () => setPending(false),
      });
    } catch {
      if (/聊天失败|聊天/.test(item.title ?? '')) {
        router.push('/chat');
        onDone?.();
        setPending(false);
        return;
      }
      retry.mutate(item.runId!, {
        onSuccess: () => onDone?.(),
        onSettled: () => setPending(false),
      });
    }
  }

  return (
    <button
      type="button"
      className="inbox-action-btn inbox-action-btn--primary"
      data-testid="inbox-retry-run"
      data-run-id={item.runId}
      disabled={pending || retry.isPending}
      onClick={() => void onRecover()}
    >
      {pending || retry.isPending ? '处理中…' : '恢复'}
    </button>
  );
}

// Multica 对齐：左列表（按 issue 去重）+ 右嵌 IssueDetail（评论/轨迹/回复）
function InboxPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, error } = useInbox({ includeArchived: true });
  const markRead = useMarkInboxRead();
  const markReadMany = useMarkInboxReadMany();
  const archive = useArchiveInbox();
  const archiveMany = useArchiveInboxMany();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);

  const readFilter = parseReadFilter(searchParams.get('read'));
  const kindFilter = parseKindFilter(searchParams.get('kind'));
  const urlIssue = searchParams.get('issue') ?? '';
  const urlItem = searchParams.get('item') ?? '';

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') sp.delete(k);
        else sp.set(k, v);
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const allItems = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;
  const activeAll = useMemo(
    () => allItems.filter((i) => !i.archived),
    [allItems],
  );
  const archivedAll = useMemo(
    () => allItems.filter((i) => i.archived),
    [allItems],
  );

  const failedAgg = useMemo(() => {
    const fails = activeAll.filter(
      (i) => !i.read && (i.kind === 'run_failed' || i.type === 'run_failed'),
    );
    const issueIds = new Set(
      fails.map((i) => i.issueId).filter((id): id is string => Boolean(id)),
    );
    return {
      unreadFails: fails.length,
      issueCount: issueIds.size,
      latest: fails[0] ?? null,
    };
  }, [activeAll]);

  const filteredActive = useMemo(() => {
    return activeAll.filter((item) => {
      if (readFilter === 'unread' && item.read) return false;
      if (readFilter === 'read' && !item.read) return false;
      if (kindFilter && item.kind !== kindFilter) return false;
      return true;
    });
  }, [activeAll, readFilter, kindFilter]);

  const filteredArchived = useMemo(() => {
    return archivedAll.filter((item) => {
      if (readFilter === 'unread' && item.read) return false;
      if (readFilter === 'read' && !item.read) return false;
      if (kindFilter && item.kind !== kindFilter) return false;
      return true;
    });
  }, [archivedAll, readFilter, kindFilter]);

  // Multica：列表按 issue 折叠；详情稳定挂在 issue 上
  const items = useMemo(() => dedupeInboxItems(filteredActive), [filteredActive]);
  const archivedItems = useMemo(
    () => dedupeInboxItems(filteredArchived),
    [filteredArchived],
  );

  const selected = useMemo(() => {
    if (urlIssue) {
      return (
        items.find((i) => i.issueId === urlIssue) ??
        archivedItems.find((i) => i.issueId === urlIssue) ??
        allItems.find((i) => i.issueId === urlIssue && !i.archived) ??
        allItems.find((i) => i.issueId === urlIssue) ??
        null
      );
    }
    if (urlItem) {
      return (
        items.find((i) => i.id === urlItem) ??
        archivedItems.find((i) => i.id === urlItem) ??
        allItems.find((i) => i.id === urlItem) ??
        null
      );
    }
    return null;
  }, [urlIssue, urlItem, items, archivedItems, allItems]);

  const selectedKey = selected
    ? selected.issueId
      ? `issue:${selected.issueId}`
      : `item:${selected.id}`
    : '';

  // 无效 URL 清理
  useEffect(() => {
    if (isLoading) return;
    if (!urlIssue && !urlItem) return;
    if (selected) return;
    if (allItems.length === 0) return;
    replaceParams({ issue: null, item: null });
  }, [isLoading, urlIssue, urlItem, selected, allItems.length, replaceParams]);

  // Multica：选中即已读（含 URL 深链）
  useEffect(() => {
    if (!selected || selected.read) return;
    markRead.mutate(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随选中 id 触发
  }, [selected?.id, selected?.read]);

  const unreadVisibleIds = useMemo(
    () => filteredActive.filter((i) => !i.read).map((i) => i.id),
    [filteredActive],
  );
  const unreadFailIds = useMemo(
    () =>
      activeAll
        .filter((i) => !i.read && (i.kind === 'run_failed' || i.type === 'run_failed'))
        .map((i) => i.id),
    [activeAll],
  );

  const selectItem = useCallback(
    (item: InboxItem) => {
      if (item.issueId) {
        replaceParams({ issue: item.issueId, item: null });
      } else {
        replaceParams({ item: item.id, issue: null });
      }
    },
    [replaceParams],
  );

  const handleArchiveSelected = useCallback(() => {
    if (!selected) return;
    const list = items;
    const idx = list.findIndex(
      (i) =>
        i.id === selected.id ||
        (selected.issueId && i.issueId === selected.issueId),
    );
    const next = idx >= 0 ? list[idx + 1] ?? list[idx - 1] ?? null : null;
    archive.mutate(selected.id, {
      onSuccess: () => {
        if (next) selectItem(next);
        else replaceParams({ issue: null, item: null });
      },
    });
  }, [archive, items, replaceParams, selectItem, selected]);

  // 键盘快捷流 (j/k/e/r)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable;
      if (isEditable) return;

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        if (items.length === 0) return;
        if (!selected) {
          selectItem(items[0]);
        } else {
          const idx = items.findIndex(
            (i) =>
              i.id === selected.id ||
              (selected.issueId && i.issueId === selected.issueId),
          );
          if (idx >= 0 && idx < items.length - 1) {
            selectItem(items[idx + 1]);
          } else if (idx < 0 && items.length > 0) {
            selectItem(items[0]);
          }
        }
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        if (items.length === 0) return;
        if (!selected) {
          selectItem(items[items.length - 1]);
        } else {
          const idx = items.findIndex(
            (i) =>
              i.id === selected.id ||
              (selected.issueId && i.issueId === selected.issueId),
          );
          if (idx > 0) {
            selectItem(items[idx - 1]);
          }
        }
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        if (selected && !selected.archived) {
          handleArchiveSelected();
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (!selected) return;
        const replyZone = document.querySelector<HTMLTextAreaElement>(
          '[data-testid="inbox-reply-zone"] textarea, [data-testid="issue-reply-zone"] textarea, textarea[name="reply"], textarea',
        );
        if (replyZone) {
          replyZone.focus();
        } else {
          const primaryAction = document.querySelector<HTMLElement>(
            '[data-testid="inbox-retry-run"], [data-testid="inbox-open-run"], [data-testid="inbox-open-chat"], [data-testid="inbox-open-issue"]',
          );
          if (primaryAction) {
            primaryAction.focus();
            if ('click' in primaryAction && primaryAction.tagName === 'A') {
              (primaryAction as HTMLElement).click();
            }
          }
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, selected, selectItem, handleArchiveSelected]);

  if (isLoading) return <div className="page-container">加载中…</div>;
  if (isError) {
    return (
      <div className="page-container">
        <EmptyState
          title="加载收件箱失败"
          description={error instanceof Error ? error.message : '未知错误'}
        />
      </div>
    );
  }

  return (
    <div className="page-container inbox-page inbox-page--multica" data-testid="inbox-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            收件箱{' '}
            {unreadCount > 0 ? (
              <span className="inbox-unread-pill" title="未读">
                {unreadCount}
              </span>
            ) : (
              <span className="count">{items.length}</span>
            )}
          </div>
          <div className="page-desc page-desc--quiet">
            双栏阅读：左列表 · 右详情（有 Issue 可评论回复）
            <span
              className="inbox-shortcut-hints"
              data-testid="inbox-shortcut-hints"
              style={{ marginLeft: '12px', fontSize: '12px', opacity: 0.85 }}
            >
              [j/k] 选择 · [e] 归档 · [r] 回复
            </span>
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn-ghost btn-sm"
            data-testid="inbox-ops-toggle"
            aria-expanded={opsOpen}
            onClick={() => setOpsOpen((v) => !v)}
          >
            {opsOpen ? '收起运维' : '运维'}
          </button>
          {unreadVisibleIds.length > 0 ? (
            <button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="inbox-mark-visible-read"
              disabled={markReadMany.isPending || archiveMany.isPending}
              onClick={() => markReadMany.mutate(unreadVisibleIds)}
            >
              {markReadMany.isPending
                ? '标记中…'
                : `全部标已读 · ${unreadVisibleIds.length}`}
            </button>
          ) : null}
        </div>
      </div>

      {opsOpen && failedAgg.unreadFails > 0 ? (
        <div
          className="inbox-fail-strip"
          data-testid="inbox-fail-strip"
          data-count={failedAgg.unreadFails}
          data-issues={failedAgg.issueCount}
        >
          <div className="inbox-fail-strip-main">
            <span className="inbox-kind inbox-kind--fail">失败</span>
            <span>
              <strong>{failedAgg.unreadFails}</strong> 条未读失败
              {failedAgg.issueCount > 0
                ? ` · 覆盖 ${failedAgg.issueCount} 个 Issue`
                : ''}
              {failedAgg.latest?.summary
                ? ` · 最近：${failedAgg.latest.summary}`
                : ''}
            </span>
          </div>
          <div className="inbox-fail-strip-actions">
            <button
              type="button"
              className="inbox-action-btn inbox-action-btn--primary"
              data-testid="inbox-mark-fails-read"
              disabled={markReadMany.isPending || unreadFailIds.length === 0}
              onClick={() => markReadMany.mutate(unreadFailIds)}
            >
              {markReadMany.isPending
                ? '标记中…'
                : `失败全标已读 · ${unreadFailIds.length}`}
            </button>
            <button
              type="button"
              className="inbox-action-btn"
              data-testid="inbox-fail-filter"
              onClick={() =>
                replaceParams({ kind: 'run_failed', read: 'unread' })
              }
            >
              筛未读失败
            </button>
            <Link
              href="/?failed=1"
              className="inbox-action-btn inbox-action-link"
              data-testid="inbox-fail-board"
            >
              看板仅失败
            </Link>
            <Link
              href="/runs?status=failed"
              className="inbox-action-btn inbox-action-link"
              data-testid="inbox-fail-runs"
            >
              失败运行
            </Link>
            <Link
              href="/settings"
              className="inbox-action-btn inbox-action-link"
              data-testid="inbox-fail-settings-strip"
              title="常见原因：MA_WORKSPACE_CWD"
            >
              环境
            </Link>
            {items.length > 0 ? (
              <button
                type="button"
                className="inbox-action-btn"
                data-testid="inbox-archive-visible"
                disabled={archiveMany.isPending || markReadMany.isPending}
                onClick={() => {
                  const ids = filteredActive.map((i) => i.id);
                  if (ids.length === 0) return;
                  if (!window.confirm(`归档当前筛选 ${ids.length} 条通知？`)) return;
                  archiveMany.mutate(ids);
                }}
              >
                {archiveMany.isPending ? '归档中…' : `归档筛选 · ${filteredActive.length}`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {opsOpen ? (
        <div className="inbox-filters" data-testid="inbox-filters">
          <label>
            已读
            <select
              value={readFilter}
              onChange={(e) => {
                const v = e.target.value as ReadFilter;
                replaceParams({ read: v === 'all' ? null : v });
              }}
              aria-label="筛选已读状态"
            >
              <option value="all">全部</option>
              <option value="unread">未读</option>
              <option value="read">已读</option>
            </select>
          </label>
          <label>
            类型
            <select
              value={kindFilter}
              onChange={(e) => replaceParams({ kind: e.target.value || null })}
              aria-label="筛选通知类型"
            >
              <option value="">全部类型</option>
              <option value="run_failed">失败</option>
              <option value="run_completed">完成</option>
              <option value="comment">评论</option>
              <option value="assigned">指派</option>
            </select>
          </label>
        </div>
      ) : null}

      {opsOpen && (readFilter !== 'all' || kindFilter) ? (
        <div
          className="inbox-active-filters"
          data-testid="inbox-active-filters"
          aria-label="当前筛选"
        >
          {readFilter !== 'all' ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="inbox-chip-read"
              onClick={() => replaceParams({ read: null })}
            >
              {readFilter === 'unread' ? '未读' : '已读'} ×
            </button>
          ) : null}
          {kindFilter ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="inbox-chip-kind"
              onClick={() => replaceParams({ kind: null })}
            >
              类型 · {kindLabel(kindFilter)} ×
            </button>
          ) : null}
          <button
            type="button"
            className="kanban-active-chip kanban-active-chip--clear"
            data-testid="inbox-chip-clear-all"
            onClick={() => replaceParams({ read: null, kind: null })}
          >
            清除全部
          </button>
        </div>
      ) : null}

      {/* Multica：列表 | IssueDetail（内含可折叠属性栏）；Helper 是全局浮层不是第三栏问答 */}
      <div className="inbox-split" data-testid="inbox-split">
        <div className="inbox-split-list" data-testid="inbox-split-list">
          {items.length === 0 ? (
            <EmptyState
              title="暂无动态"
              description={
                activeAll.length > 0 || archivedAll.length > 0
                  ? '当前筛选无结果，试试清除筛选。'
                  : '评论、指派与 Run 终态会出现在这里'
              }
              action={
                activeAll.length > 0 || archivedAll.length > 0 ? (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    data-testid="inbox-empty-clear-filters"
                    onClick={() => replaceParams({ read: null, kind: null })}
                  >
                    清除筛选
                  </button>
                ) : (
                  <div className="inbox-empty-actions" data-testid="inbox-empty-actions">
                    <Link href="/" className="btn-secondary btn-sm" data-testid="inbox-empty-board">
                      去看板
                    </Link>
                    <Link
                      href="/chat"
                      className="btn-ghost btn-sm"
                      data-testid="inbox-empty-chat"
                    >
                      打开聊天
                    </Link>
                  </div>
                )
              }
            />
          ) : (
            <ul className="inbox-list" data-testid="inbox-active-list">
              {items.map((item) => (
                <InboxRow
                  key={item.id}
                  item={item}
                  active={
                    selectedKey ===
                    (item.issueId ? `issue:${item.issueId}` : `item:${item.id}`)
                  }
                  onSelect={() => selectItem(item)}
                  onArchive={() => {
                    const wasSelected =
                      selected &&
                      (selected.id === item.id ||
                        (item.issueId && selected.issueId === item.issueId));
                    archive.mutate(item.id, {
                      onSuccess: () => {
                        if (!wasSelected) return;
                        const idx = items.findIndex((i) => i.id === item.id);
                        const next = items[idx + 1] ?? items[idx - 1] ?? null;
                        if (next) selectItem(next);
                        else replaceParams({ issue: null, item: null });
                      },
                    });
                  }}
                />
              ))}
            </ul>
          )}

          {archivedAll.length > 0 ? (
            <div className="inbox-archive-section" data-testid="inbox-archive-section">
              <button
                type="button"
                className="inbox-archive-toggle"
                data-testid="inbox-archive-toggle"
                aria-expanded={archiveOpen}
                onClick={() => setArchiveOpen((v) => !v)}
              >
                <span className="inbox-archive-chevron" aria-hidden>
                  {archiveOpen ? '▾' : '▸'}
                </span>
                已归档 {archivedAll.length}
                {archivedItems.length !== archivedAll.length
                  ? ` · 筛选后 ${archivedItems.length}`
                  : ''}
              </button>
              {archiveOpen ? (
                archivedItems.length === 0 ? (
                  <p
                    className="inbox-archive-empty text-dim text-sm"
                    data-testid="inbox-archive-empty"
                  >
                    当前筛选下无归档项。清除筛选或展开全部归档后再选。
                  </p>
                ) : (
                  <ul className="inbox-list inbox-list--archived" data-testid="inbox-archive-list">
                    {archivedItems.map((item) => (
                      <InboxRow
                        key={item.id}
                        item={item}
                        active={
                          selectedKey ===
                          (item.issueId
                            ? `issue:${item.issueId}`
                            : `item:${item.id}`)
                        }
                        archived
                        onSelect={() => selectItem(item)}
                        onArchive={() => {
                          /* already archived */
                        }}
                      />
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="inbox-split-detail" data-testid="inbox-split-detail">
          {!selected ? (
            <div
              className="inbox-reader inbox-detail-empty"
              data-testid="inbox-reader"
              data-reader-mode="empty"
            >
              <div data-testid="inbox-detail-empty">
                <p className="inbox-reader-empty-title">尚未选择通知</p>
                <p className="text-dim text-sm">
                  点左侧一条：有 Issue 时右侧打开详情与评论；无 Issue 时只显示通知正文与聊天/运行入口。
                </p>
                <p className="text-dim text-sm">
                  仍是双栏（列表 | 阅读器）。Helper 用全局「问助手」FAB，不是第三栏。
                </p>
              </div>
            </div>
          ) : selected.issueId ? (
            <div
              className="inbox-reader inbox-issue-pane"
              data-testid="inbox-reader"
              data-reader-mode="issue"
              data-issue-id={selected.issueId}
              data-inbox-id={selected.id}
            >
              <div
                className="inbox-issue-pane-inner"
                data-testid="inbox-issue-pane"
                data-issue-id={selected.issueId}
                data-inbox-id={selected.id}
              >
                <div
                  className="inbox-issue-toolbar inbox-issue-toolbar--dense"
                  data-testid="inbox-issue-toolbar"
                >
                  <div className="inbox-issue-toolbar-meta text-dim text-sm">
                    <span className={kindClass(selected.kind)}>
                      {kindLabel(selected.kind)}
                    </span>
                    <time dateTime={selected.createdAt}>
                      {relativeTime(selected.createdAt)}
                    </time>
                    {selected.issueIdentifier ? (
                      <span className="inbox-issue-id-chip">
                        {selected.issueIdentifier}
                      </span>
                    ) : null}
                  </div>
                  <div className="inbox-issue-toolbar-actions">
                    {isFailItem(selected) && selected.runId ? (
                      <>
                        <InboxRetryButton item={selected} />
                        <Link
                          href={`/chat?quickPrompt=${encodeURIComponent(`上次运行 (Run ${selected.runId.slice(0, 8)}) 失败了，请分析报错：\n\`\`\`\n${(selected.body ?? selected.summary ?? '').slice(0, 500)}\n\`\`\`\n并给出修复方案。`)}`}
                          className="inbox-action-btn inbox-action-link inbox-action-btn--primary"
                          data-testid="inbox-dm-agent"
                        >
                          带日志追问 (DM)
                        </Link>
                      </>
                    ) : null}
                    {selected.runId ? (
                      <Link
                        href={`/runs?run=${encodeURIComponent(selected.runId)}&timeline=1&status=all`}
                        className="inbox-action-btn inbox-action-link"
                        data-testid="inbox-open-timeline"
                        title="打开运行事件时间线"
                      >
                        时间线
                      </Link>
                    ) : null}
                    {isFailItem(selected) &&
                    isCwdFailBody(selected.body ?? selected.summary) ? (
                      <Link
                        href="/settings"
                        className="inbox-action-btn inbox-action-link"
                        data-testid="inbox-fail-settings"
                      >
                        环境
                      </Link>
                    ) : null}
                    <Link
                      href={`/issues/${selected.issueId}`}
                      className="inbox-action-btn inbox-action-link"
                      data-testid="inbox-open-issue"
                    >
                      全页
                    </Link>
                    {!selected.archived ? (
                      <button
                        type="button"
                        className="inbox-action-btn"
                        disabled={archive.isPending}
                        data-testid="inbox-detail-archive"
                        onClick={handleArchiveSelected}
                      >
                        归档
                      </button>
                    ) : (
                      <span
                        className="inbox-action-btn inbox-action-btn--static text-dim"
                        data-testid="inbox-detail-archived-badge"
                      >
                        已归档
                      </span>
                    )}
                    <button
                      type="button"
                      className="inbox-action-btn"
                      data-testid="inbox-detail-close"
                      onClick={() => replaceParams({ issue: null, item: null })}
                    >
                      关闭
                    </button>
                  </div>
                </div>
                {/* 真站无「通知摘要」条：直接 Issue 详情（标题/描述/动态/回复） */}
                <IssueDetail id={selected.issueId} replyZoneTestId="inbox-reply-zone" />
              </div>
            </div>
          ) : (
            <div
              className="inbox-reader inbox-detail inbox-detail--no-issue"
              data-testid="inbox-reader"
              data-reader-mode="notification"
              data-inbox-id={selected.id}
            >
              <div data-testid="inbox-detail" data-inbox-id={selected.id}>
                <div className="inbox-detail-head">
                  <span className={kindClass(selected.kind)}>
                    {kindLabel(selected.kind)}
                  </span>
                  <time className="inbox-time" dateTime={selected.createdAt}>
                    {relativeTime(selected.createdAt)}
                  </time>
                </div>
                <h2 className="inbox-detail-title" data-testid="inbox-detail-title">
                  {selected.title || selected.summary}
                </h2>
                <div className="inbox-detail-meta text-dim text-sm">
                  <span>无关联 Issue · 不可在此评论</span>
                  {selected.runId ? (
                    <span> · run {selected.runId.slice(0, 8)}…</span>
                  ) : null}
                  <span> · {selected.read ? '已读' : '未读'}</span>
                  {selected.archived ? <span> · 已归档</span> : null}
                </div>
                <div
                  className="inbox-detail-md inbox-reader-md"
                  data-testid="inbox-reader-md"
                >
                  <div data-testid="inbox-detail-body">
                    <MarkdownBody
                      source={
                        selected.body?.trim() || selected.summary || '（无正文）'
                      }
                    />
                  </div>
                </div>
                <div
                  className="inbox-reply-zone inbox-reply-zone--no-issue"
                  data-testid="inbox-reply-zone"
                >
                  <div className="issue-reply-zone-label text-dim text-sm">
                    无 Issue · 请用下方入口继续
                  </div>
                  <div
                    className="inbox-actions inbox-detail-actions"
                    data-testid="inbox-detail-actions"
                  >
                    {isFailItem(selected) && selected.runId ? (
                      <>
                        <InboxRetryButton item={selected} />
                        <Link
                          href={`/chat?quickPrompt=${encodeURIComponent(`上次运行 (Run ${selected.runId.slice(0, 8)}) 失败了，请分析报错：\n\`\`\`\n${(selected.body ?? selected.summary ?? '').slice(0, 500)}\n\`\`\`\n并给出修复方案。`)}`}
                          className="inbox-action-btn inbox-action-link inbox-action-btn--primary"
                          data-testid="inbox-dm-agent"
                        >
                          带日志追问 (DM)
                        </Link>
                      </>
                    ) : null}
                    {isFailItem(selected) &&
                    isCwdFailBody(selected.body ?? selected.summary) ? (
                      <Link
                        href="/settings"
                        className="inbox-action-btn inbox-action-link"
                        data-testid="inbox-fail-settings"
                      >
                        环境
                      </Link>
                    ) : null}
                    {runListHref(selected) ? (
                      <Link
                        href={runListHref(selected)!}
                        className="inbox-action-btn inbox-action-link inbox-action-btn--primary"
                        data-testid="inbox-open-run"
                      >
                        打开运行
                      </Link>
                    ) : null}
                    <Link
                      href="/chat"
                      className="inbox-action-btn inbox-action-link inbox-action-btn--primary"
                      data-testid="inbox-open-chat"
                    >
                      打开聊天
                    </Link>
                    {!selected.archived ? (
                      <button
                        type="button"
                        className="inbox-action-btn"
                        disabled={archive.isPending}
                        data-testid="inbox-detail-archive"
                        onClick={handleArchiveSelected}
                      >
                        归档
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inbox-action-btn"
                      data-testid="inbox-detail-close"
                      onClick={() => replaceParams({ issue: null, item: null })}
                    >
                      关闭
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function InboxRow({
  item,
  active,
  archived,
  onSelect,
  onArchive,
}: {
  item: InboxItem;
  active: boolean;
  archived?: boolean;
  onSelect: () => void;
  onArchive: () => void;
}) {
  return (
    <li>
      <div
        className={`inbox-row inbox-row--multica${item.read ? '' : ' inbox-row--unread'}${
          active ? ' inbox-row--active' : ''
        }${archived ? ' inbox-row--archived' : ''}`}
        data-inbox-read={item.read ? '1' : '0'}
        data-inbox-kind={item.kind}
        data-inbox-active={active ? '1' : '0'}
        data-inbox-archived={archived ? '1' : '0'}
        data-issue-id={item.issueId ?? ''}
      >
        <button
          type="button"
          className="inbox-row-main"
          data-testid="inbox-row-select"
          onClick={onSelect}
        >
          <span className="inbox-row-avatar" aria-hidden>
            {item.issueIdentifier?.slice(0, 2) ??
              kindLabel(item.kind).slice(0, 1)}
          </span>
          <span className="inbox-body">
            <span className="inbox-row-title-line">
              {!item.read ? <span className="inbox-unread-dot" aria-hidden /> : null}
              <span className="inbox-summary">{displayTitle(item)}</span>
              <span className={kindClass(item.kind)} data-testid="inbox-kind-chip">
                {kindLabel(item.kind)}
              </span>
            </span>
            <span className="inbox-meta-line">
              <span className="inbox-meta">{displaySubtitle(item)}</span>
              <time className="inbox-time" dateTime={item.createdAt}>
                {relativeTime(item.createdAt)}
              </time>
            </span>
            {item.issueIdentifier ? (
              <span className="inbox-meta">
                <Icon name="issues" size={12} className="nav-icon-svg" />
                {item.issueIdentifier}
                {archived ? ' · 已归档' : ''}
              </span>
            ) : null}
          </span>
        </button>
        {!archived ? (
          <div className="inbox-row-actions" data-testid="inbox-row-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingRight: '8px' }}>
            {isFailItem(item) && item.runId ? (
              <InboxRetryButton item={item} />
            ) : null}
            <button
              type="button"
              className="inbox-row-archive"
              data-testid="inbox-row-archive"
              title="归档 (e)"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
            >
              归档
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function InboxPage() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <InboxPageInner />
    </Suspense>
  );
}
