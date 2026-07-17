'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useArchiveInbox,
  useInbox,
  useMarkInboxRead,
} from '@/lib/api';
import type { InboxItem } from '@ma/shared';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

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

// bu01：真 Inbox — 已读/归档 + 未读样式
export function InboxPage() {
  const router = useRouter();
  const { data, isLoading, isError, error } = useInbox();
  const markRead = useMarkInboxRead();
  const archive = useArchiveInbox();

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

  const items = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  function hrefForItem(item: InboxItem): string | null {
    // Multica 式：run 终态优先落到具体 run 行
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

  async function openItem(item: InboxItem) {
    if (!item.read) {
      try {
        await markRead.mutateAsync(item.id);
      } catch {
        // mutation 已 toast；仍允许跳转
      }
    }
    const href = hrefForItem(item);
    if (href) router.push(href);
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
            通知落库；Run 终态可跳到 /runs?run=（对齐 Multica 从 Inbox 进执行）
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="暂无动态"
          description="评论、指派与 Run 终态会出现在这里"
        />
      ) : (
        <ul className="inbox-list">
          {items.map((item) => (
            <li key={item.id}>
              <div
                className={`inbox-row${item.read ? '' : ' inbox-row--unread'}`}
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
