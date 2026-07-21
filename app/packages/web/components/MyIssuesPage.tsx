'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Issue } from '@ma/shared';
import { useAgents, useIssues, useSquads } from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { AgentsWorkingBanner } from './AgentsWorkingBanner';

/** 本地单用户 id（与 server LOCAL_MEMBER 对齐） */
const LOCAL_USER_ID = 'user-linyuan';

type MyScope = 'all' | 'assigned' | 'created' | 'agents';

const SCOPES: { id: MyScope; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'assigned', label: '已分配' },
  { id: 'created', label: '我创建的' },
  { id: 'agents', label: '我的智能体和小队' },
];

const STATUS_ZH: Record<string, string> = {
  backlog: '待规划',
  todo: '待办',
  in_progress: '进行中',
  in_review: '审核中',
  done: '已完成',
  blocked: '阻塞',
  cancelled: '已取消',
};

function parseScope(raw: string | null): MyScope {
  if (raw === 'assigned' || raw === 'created' || raw === 'agents' || raw === 'all') {
    return raw;
  }
  return 'assigned';
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
  return new Date(iso).toLocaleDateString();
}

function MyIssuesPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = parseScope(searchParams.get('scope'));

  const { data: issues = [], isLoading, isError } = useIssues();
  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();

  const agentIds = useMemo(() => new Set(agents.map((a) => a.id)), [agents]);
  const squadIds = useMemo(() => new Set(squads.map((s) => s.id)), [squads]);

  function setScope(next: MyScope) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === 'assigned') sp.delete('scope');
    else sp.set('scope', next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const filtered = useMemo(() => {
    const list = issues as Issue[];
    const isAssignedToMe = (i: Issue) =>
      i.assignee?.type === 'member' && i.assignee.id === LOCAL_USER_ID;
    const isCreatedByMe = (i: Issue) =>
      i.creatorType === 'member' && i.creatorId === LOCAL_USER_ID;
    const isAgentOrSquad = (i: Issue) => {
      if (!i.assignee) return false;
      if (i.assignee.type === 'agent') return agentIds.has(i.assignee.id);
      if (i.assignee.type === 'squad') return squadIds.has(i.assignee.id);
      return false;
    };

    if (scope === 'assigned') return list.filter(isAssignedToMe);
    if (scope === 'created') return list.filter(isCreatedByMe);
    if (scope === 'agents') return list.filter(isAgentOrSquad);
    // all：我创建或指派给我或我的 agent/squad
    return list.filter(
      (i) => isAssignedToMe(i) || isCreatedByMe(i) || isAgentOrSquad(i),
    );
  }, [issues, scope, agentIds, squadIds]);

  if (isLoading) {
    return <div className="page-container">加载中…</div>;
  }
  if (isError) {
    return (
      <div className="page-container">
        <p className="text-dim">加载失败</p>
      </div>
    );
  }

  return (
    <div className="page-container my-issues-page" data-testid="my-issues-page">
      <div className="page-header">
        <div>
          <Icon name="user" size={16} className="page-header-icon" />
          <h1 className="page-title">我的 issue</h1>
          <p className="page-desc">你创建或被分配到的 issue 会显示在这里</p>
        </div>
        <div className="page-actions">
          <Link href="/" className="btn btn-ghost btn-sm" data-testid="my-issues-to-board">
            看板
          </Link>
        </div>
      </div>

      <div className="my-issues-tabs" data-testid="my-issues-tabs" role="tablist">
        {SCOPES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={scope === s.id}
            className={`my-issues-tab${scope === s.id ? ' is-active' : ''}`}
            data-testid={`my-issues-tab-${s.id}`}
            data-scope={s.id}
            onClick={() => setScope(s.id)}
          >
            {s.label}
            <span className="my-issues-tab-count">
              {s.id === scope ? filtered.length : ''}
            </span>
          </button>
        ))}
      </div>

      <AgentsWorkingBanner />

      <div className="page-body">
        {filtered.length === 0 ? (
          <EmptyState
            title={
              scope === 'assigned'
                ? '没有分配给你的 issue'
                : scope === 'created'
                  ? '你还没有创建 issue'
                  : scope === 'agents'
                    ? '智能体/小队暂无负责 issue'
                    : '暂无相关 issue'
            }
            description="你创建或被分配到的 issue 会显示在这里。"
            action={
              <Link href="/" className="btn-secondary btn-sm" data-testid="my-issues-empty-board">
                打开看板
              </Link>
            }
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table" data-testid="my-issues-table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>状态</th>
                  <th>负责人</th>
                  <th>更新</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((issue) => (
                  <tr key={issue.id} data-testid="my-issues-row" data-issue-id={issue.id}>
                    <td>
                      <Link href={`/issues/${issue.id}`} className="agent-cell">
                        <span className="text-dim text-sm">{issue.identifier}</span>
                        <span className="agent-cell-name">{issue.title}</span>
                      </Link>
                    </td>
                    <td>
                      <code className={`run-pill run-pill--${issue.status}`}>
                        {STATUS_ZH[issue.status] ?? issue.status}
                      </code>
                    </td>
                    <td className="text-dim text-sm">
                      {issue.assignee?.label ?? '未指派'}
                    </td>
                    <td className="text-dim text-sm">{relativeTime(issue.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function MyIssuesPage() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <MyIssuesPageInner />
    </Suspense>
  );
}
