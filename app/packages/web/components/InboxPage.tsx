'use client';

import Link from 'next/link';
import { useInbox } from '@/lib/api';
import type { InboxItem } from '@ma/shared';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

function kindLabel(kind: InboxItem['kind']): string {
  if (kind === 'comment') return '评论';
  if (kind === 'run_completed') return '完成';
  return '失败';
}

function kindClass(kind: InboxItem['kind']): string {
  if (kind === 'comment') return 'inbox-kind inbox-kind--comment';
  if (kind === 'run_completed') return 'inbox-kind inbox-kind--ok';
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

// S12：薄 Inbox — 合成 feed，点击进 Issue
export function InboxPage() {
  const { data, isLoading, isError, error } = useInbox();

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

  const items = data ?? [];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            Inbox <span className="count">{items.length}</span>
          </div>
          <div className="page-desc">最近评论与运行终态（合成，不落库）</div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="暂无动态"
          description="评论 Issue 或完成/失败的 Agent Run 会出现在这里"
        />
      ) : (
        <ul className="inbox-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`/issues/${item.issueId}`} className="inbox-row">
                <span className={kindClass(item.kind)}>{kindLabel(item.kind)}</span>
                <span className="inbox-body">
                  <span className="inbox-summary">{item.summary}</span>
                  <span className="inbox-meta">
                    <Icon name="issues" size={12} className="nav-icon-svg" />
                    {item.issueIdentifier ?? item.issueId}
                    {item.issueTitle ? ` · ${item.issueTitle}` : ''}
                  </span>
                </span>
                <time className="inbox-time" dateTime={item.createdAt}>
                  {relativeTime(item.createdAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
