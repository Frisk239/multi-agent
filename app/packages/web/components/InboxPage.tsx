'use client';

import Link from 'next/link';
import { Suspense, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useArchiveInbox,
  useInbox,
  useMarkInboxRead,
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

function hrefForItem(item: InboxItem): string | null {
  if (item.runId) {
    const sp = new URLSearchParams();
    sp.set('run', item.runId);
    if (item.kind === 'run_failed' || item.type === 'run_failed') sp.set('status', 'failed');
    if (item.kind === 'run_completed' || item.type === 'run_completed') {
      sp.set('status', 'completed');
    }
    return `/runs?${sp.toString()}`;
  }
  if (item.issueId) return `/issues/${item.issueId}`;
  if (item.kind === 'run_failed' || item.type === 'run_failed') return '/runs?status=failed';
  return null;
}

// bu01 + inbox-filter-url：真 Inbox + 未读/类型 URL 可分享
function InboxPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, error } = useInbox();
  const markRead = useMarkInboxRead();
  const archive = useArchiveInbox();

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

  async function openItem(item: InboxItem) {
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
    <div className="page-container">
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
            筛选同步 URL（?read=&kind=）；Run 终态可进 /runs?run=
          </div>
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

      {items.length === 0 ? (
        <EmptyState
          title="暂无动态"
          description={
            allItems.length > 0
              ? '当前筛选无结果，试试「全部」或换类型。'
              : '评论、指派与 Run 终态会出现在这里'
          }
        />
      ) : (
        <ul className="inbox-list">
          {items.map((item) => (
            <li key={item.id}>
              <div
                className={`inbox-row${item.read ? '' : ' inbox-row--unread'}`}
                data-inbox-read={item.read ? '1' : '0'}
                data-inbox-kind={item.kind}
              >
                <button
                  type="button"
                  className="inbox-row-main"
                  onClick={() => void openItem(item)}
                >
                  <span className={kindClass(item.kind)}>{kindLabel(item.kind)}</span>
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
                <div className="inbox-actions">
                  {!item.read && (
                    <button
                      type="button"
                      className="inbox-action-btn"
                      disabled={markRead.isPending}
                      onClick={() => markRead.mutate(item.id)}
                    >
                      已读
                    </button>
                  )}
                  <button
                    type="button"
                    className="inbox-action-btn"
                    disabled={archive.isPending}
                    onClick={() => archive.mutate(item.id)}
                  >
                    归档
                  </button>
                  {hrefForItem(item) && (
                    <Link
                      href={hrefForItem(item)!}
                      className="inbox-action-btn inbox-action-link"
                      data-testid={item.runId ? 'inbox-open-run' : 'inbox-open-issue'}
                      onClick={() => {
                        if (!item.read) markRead.mutate(item.id);
                      }}
                    >
                      {item.runId ? '运行' : '打开'}
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
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
