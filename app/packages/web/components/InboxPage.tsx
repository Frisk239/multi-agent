'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo } from 'react';
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

type ReadFilter = 'all' | 'unread' | 'read';
type KindFilter = '' | InboxItem['kind'];

const KIND_VALUES: InboxItem['kind'][] = [
  'comment',
  'run_completed',
  'run_failed',
  'assigned',
];

function kindLabel(kind: InboxItem['kind']): string {
  if (kind === 'comment') return '评论';
  if (kind === 'run_completed') return '完成';
  if (kind === 'assigned') return '指派';
  return '失败';
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

function runListHref(item: InboxItem): string | null {
  if (!item.runId) {
    if (item.kind === 'run_failed' || item.type === 'run_failed') return '/runs?status=failed';
    return null;
  }
  const sp = new URLSearchParams();
  sp.set('run', item.runId);
  if (item.kind === 'run_failed' || item.type === 'run_failed') sp.set('status', 'failed');
  if (item.kind === 'run_completed' || item.type === 'run_completed') {
    sp.set('status', 'completed');
  }
  return `/runs?${sp.toString()}`;
}

function issueHref(item: InboxItem): string | null {
  if (!item.issueId) return null;
  // 失败项进详情轨迹区（含 run 历史切换）；其它进详情
  if (item.kind === 'run_failed' || item.type === 'run_failed') {
    return `/issues/${item.issueId}#run-trace`;
  }
  return `/issues/${item.issueId}`;
}

/** 行点击主入口：失败优先 Issue 诊断；有 run 再列表；否则 Issue */
function primaryHrefForItem(item: InboxItem): string | null {
  const isFail = item.kind === 'run_failed' || item.type === 'run_failed';
  if (isFail && item.issueId) return issueHref(item);
  return runListHref(item) ?? issueHref(item);
}

// 兼容旧名
function hrefForItem(item: InboxItem): string | null {
  return primaryHrefForItem(item);
}

function isFailItem(item: InboxItem): boolean {
  return item.kind === 'run_failed' || item.type === 'run_failed';
}

function isCwdFailBody(text: string | null | undefined): boolean {
  const e = (text ?? '').toLowerCase();
  return e.includes('cwd') || e.includes('ma_workspace_cwd') || e.includes('工作目录');
}

function InboxRetryButton({
  item,
  onDone,
}: {
  item: InboxItem;
  onDone?: () => void;
}) {
  const retry = useRetryRun();
  if (!item.runId || !isFailItem(item)) return null;
  return (
    <button
      type="button"
      className="inbox-action-btn inbox-action-btn--primary"
      data-testid="inbox-retry-run"
      data-run-id={item.runId}
      disabled={retry.isPending}
      onClick={() => {
        retry.mutate(item.runId!, {
          onSuccess: () => onDone?.(),
        });
      }}
    >
      {retry.isPending ? '排队中…' : '再执行'}
    </button>
  );
}

// bu01 + inbox-filter-url：真 Inbox + 未读/类型 URL 可分享
function InboxPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, error } = useInbox();
  const markRead = useMarkInboxRead();
  const markReadMany = useMarkInboxReadMany();
  const archive = useArchiveInbox();
  const archiveMany = useArchiveInboxMany();

  const readFilter = parseReadFilter(searchParams.get('read'));
  const kindFilter = parseKindFilter(searchParams.get('kind'));

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

  const failedAgg = useMemo(() => {
    const fails = allItems.filter(
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
  }, [allItems]);

  const items = useMemo(() => {
    return allItems.filter((item) => {
      if (readFilter === 'unread' && item.read) return false;
      if (readFilter === 'read' && !item.read) return false;
      if (kindFilter && item.kind !== kindFilter) return false;
      return true;
    });
  }, [allItems, readFilter, kindFilter]);

  const unreadVisibleIds = useMemo(
    () => items.filter((i) => !i.read).map((i) => i.id),
    [items],
  );
  const unreadFailIds = useMemo(
    () =>
      allItems
        .filter((i) => !i.read && (i.kind === 'run_failed' || i.type === 'run_failed'))
        .map((i) => i.id),
    [allItems],
  );

  const selectedId = searchParams.get('item') ?? '';
  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? allItems.find((i) => i.id === selectedId) ?? null,
    [items, allItems, selectedId],
  );

  // 选中项若被筛选掉，仍保留详情（从 allItems 取）
  useEffect(() => {
    if (!selectedId || selected) return;
    // id 不存在则清 URL
    if (allItems.length > 0 && !allItems.some((i) => i.id === selectedId)) {
      replaceParams({ item: null });
    }
  }, [selectedId, selected, allItems, replaceParams]);

  async function selectItem(item: InboxItem) {
    replaceParams({ item: item.id });
    if (!item.read) {
      try {
        await markRead.mutateAsync(item.id);
      } catch {
        /* mutation toast */
      }
    }
  }

  async function openItemNavigate(item: InboxItem) {
    if (!item.read) {
      try {
        await markRead.mutateAsync(item.id);
      } catch {
        /* mutation toast */
      }
    }
    const href = hrefForItem(item);
    if (href) router.push(href);
  }

  if (isLoading) return <div className="page-container">加载中…</div>;
  if (isError) {
    return (
      <div className="page-container">
        <EmptyState
          title="加载 Inbox 失败"
          description={error instanceof Error ? error.message : '未知错误'}
        />
      </div>
    );
  }

  return (
    <div className="page-container inbox-page" data-testid="inbox-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            Inbox <span className="count">{items.length}</span>
            {unreadCount > 0 && (
              <span className="inbox-unread-pill" title="未读">
                {unreadCount} 未读
              </span>
            )}
          </div>
          <div className="page-desc">
            列表 + 详情双栏（对齐 Multica 收件箱阅读）；?item= 可分享选中；筛选 ?read=&kind=
          </div>
        </div>
        <div className="page-actions">
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
                : `当前列表标已读 · ${unreadVisibleIds.length}`}
            </button>
          ) : null}
          {items.length > 0 ? (
            <button
              type="button"
              className="btn-ghost btn-sm"
              data-testid="inbox-archive-visible"
              disabled={archiveMany.isPending || markReadMany.isPending}
              onClick={() => {
                const ids = items.map((i) => i.id);
                if (ids.length === 0) return;
                if (!window.confirm(`归档当前列表 ${ids.length} 条通知？`)) return;
                archiveMany.mutate(ids);
              }}
            >
              {archiveMany.isPending ? '归档中…' : `归档当前列表 · ${items.length}`}
            </button>
          ) : null}
        </div>
      </div>

      {failedAgg.unreadFails > 0 ? (
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
          </div>
        </div>
      ) : null}

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

      {(readFilter !== 'all' || kindFilter) ? (
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

      <div className="inbox-split" data-testid="inbox-split">
        <div className="inbox-split-list" data-testid="inbox-split-list">
          {items.length === 0 ? (
            <EmptyState
              title="暂无动态"
              description={
                allItems.length > 0
                  ? '当前筛选无结果，试试「全部」或换类型。'
                  : '评论、指派与 Run 终态会出现在这里'
              }
              action={
                allItems.length > 0 ? (
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
                      href="/runs?status=failed"
                      className="btn-ghost btn-sm"
                      data-testid="inbox-empty-runs"
                    >
                      失败运行
                    </Link>
                  </div>
                )
              }
            />
          ) : (
            <ul className="inbox-list">
              {items.map((item) => {
                const active = item.id === selectedId;
                return (
                  <li key={item.id}>
                    <div
                      className={`inbox-row${item.read ? '' : ' inbox-row--unread'}${
                        active ? ' inbox-row--active' : ''
                      }`}
                      data-inbox-read={item.read ? '1' : '0'}
                      data-inbox-kind={item.kind}
                      data-inbox-active={active ? '1' : '0'}
                    >
                      <button
                        type="button"
                        className="inbox-row-main"
                        data-testid="inbox-row-select"
                        onClick={() => void selectItem(item)}
                      >
                        <span
                          className={kindClass(item.kind)}
                          data-testid="inbox-kind-chip"
                          title="筛选此类型"
                          onClick={(e) => {
                            e.stopPropagation();
                            replaceParams({
                              kind: item.kind,
                              read: readFilter === 'all' ? null : readFilter,
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              replaceParams({
                                kind: item.kind,
                                read: readFilter === 'all' ? null : readFilter,
                              });
                            }
                          }}
                          role="link"
                          tabIndex={0}
                        >
                          {kindLabel(item.kind)}
                        </span>
                        <span className="inbox-body">
                          <span className="inbox-summary">{item.summary}</span>
                          <span className="inbox-meta">
                            <Icon name="issues" size={12} className="nav-icon-svg" />
                            {item.issueIdentifier ?? item.issueId ?? '—'}
                            {item.issueTitle ? ` · ${item.issueTitle}` : ''}
                          </span>
                        </span>
                        <time className="inbox-time" dateTime={item.createdAt}>
                          {relativeTime(item.createdAt)}
                        </time>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <aside className="inbox-split-detail" data-testid="inbox-split-detail">
          {!selected ? (
            <div className="inbox-detail-empty" data-testid="inbox-detail-empty">
              <p className="text-dim">选择一条通知查看详情</p>
              <p className="text-dim text-sm">对齐 Multica 收件箱：列表点选即可阅读正文，无需先跳走。</p>
            </div>
          ) : (
            <div className="inbox-detail" data-testid="inbox-detail" data-inbox-id={selected.id}>
              <div className="inbox-detail-head">
                <span className={kindClass(selected.kind)}>{kindLabel(selected.kind)}</span>
                <time className="inbox-time" dateTime={selected.createdAt}>
                  {relativeTime(selected.createdAt)}
                </time>
              </div>
              <h2 className="inbox-detail-title" data-testid="inbox-detail-title">
                {selected.title || selected.summary}
              </h2>
              <div className="inbox-detail-meta text-dim text-sm">
                {selected.issueIdentifier || selected.issueId ? (
                  <span>
                    Issue {selected.issueIdentifier ?? selected.issueId}
                    {selected.issueTitle ? ` · ${selected.issueTitle}` : ''}
                  </span>
                ) : (
                  <span>无关联 Issue</span>
                )}
                {selected.runId ? <span> · run {selected.runId.slice(0, 8)}…</span> : null}
                <span> · {selected.read ? '已读' : '未读'}</span>
              </div>
              <pre className="inbox-detail-body" data-testid="inbox-detail-body">
                {selected.body?.trim() || selected.summary || '（无正文）'}
              </pre>
              <div className="inbox-actions inbox-detail-actions" data-testid="inbox-detail-actions">
                {isFailItem(selected) && selected.runId ? (
                  <InboxRetryButton
                    item={selected}
                    onDone={() => {
                      if (!selected.read) markRead.mutate(selected.id);
                    }}
                  />
                ) : null}
                {isFailItem(selected) && isCwdFailBody(selected.body ?? selected.summary) ? (
                  <Link
                    href="/settings"
                    className="inbox-action-btn inbox-action-link"
                    data-testid="inbox-fail-settings"
                  >
                    环境
                  </Link>
                ) : null}
                {!selected.read ? (
                  <button
                    type="button"
                    className="inbox-action-btn"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(selected.id)}
                  >
                    已读
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inbox-action-btn"
                  disabled={archive.isPending}
                  data-testid="inbox-detail-archive"
                  onClick={() => {
                    archive.mutate(selected.id, {
                      onSuccess: () => replaceParams({ item: null }),
                    });
                  }}
                >
                  归档
                </button>
                {issueHref(selected) ? (
                  <Link
                    href={issueHref(selected)!}
                    className="inbox-action-btn inbox-action-link"
                    data-testid="inbox-open-issue"
                  >
                    打开 Issue
                  </Link>
                ) : null}
                {runListHref(selected) ? (
                  <Link
                    href={runListHref(selected)!}
                    className="inbox-action-btn inbox-action-link"
                    data-testid="inbox-open-run"
                  >
                    打开运行
                  </Link>
                ) : null}
                {primaryHrefForItem(selected) ? (
                  <button
                    type="button"
                    className="inbox-action-btn inbox-action-btn--primary"
                    data-testid="inbox-detail-goto"
                    onClick={() => void openItemNavigate(selected)}
                  >
                    跳转目标
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inbox-action-btn"
                  data-testid="inbox-detail-close"
                  onClick={() => replaceParams({ item: null })}
                >
                  关闭详情
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function InboxPage() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <InboxPageInner />
    </Suspense>
  );
}
