'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Issue } from '@ma/shared';
import { useAgents, useSquads } from '@/lib/api';
import { Icon } from './Icon';
import { PageSkeleton } from './Skeleton';
import { KanbanBoard } from './KanbanBoard';

/** 本地单用户 id（与 server LOCAL_MEMBER 对齐） */
const LOCAL_USER_ID = 'user-linyuan';

type MyScope = 'all' | 'assigned' | 'created' | 'agents';

const SCOPES: { id: MyScope; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'assigned', label: '已分配' },
  { id: 'created', label: '我创建的' },
  { id: 'agents', label: '我的智能体和小队' },
];

function parseScope(raw: string | null): MyScope {
  if (raw === 'assigned' || raw === 'created' || raw === 'agents' || raw === 'all') {
    return raw;
  }
  return 'assigned';
}

function MyIssuesPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = parseScope(searchParams.get('scope'));

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

  // 个人视角 = KanbanBoard + 客户端 scope 过滤（?scope= 深链可分享，刷新不丢）
  const scopeFilter = useMemo(() => {
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

    if (scope === 'assigned') return isAssignedToMe;
    if (scope === 'created') return isCreatedByMe;
    if (scope === 'agents') return isAgentOrSquad;
    // all：我创建或指派给我或我的 agent/squad
    return (i: Issue) =>
      isAssignedToMe(i) || isCreatedByMe(i) || isAgentOrSquad(i);
  }, [scope, agentIds, squadIds]);

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
          </button>
        ))}
      </div>

      <div className="page-body" data-testid="my-issues-board-wrap">
        <KanbanBoard scopeFilter={scopeFilter} />
      </div>
    </div>
  );
}

export function MyIssuesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MyIssuesPageInner />
    </Suspense>
  );
}
