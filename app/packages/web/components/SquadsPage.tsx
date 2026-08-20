'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CreateSquadInput, type AgentReadiness } from '@ma/shared';
import {
  useAgents,
  useAgentsReadinessMap,
  useCreateSquad,
  useDeleteSquad,
  useSquads,
} from '@/lib/api';
import { confirmDialog } from '@/lib/confirm-store';
import { validateWith, type FieldErrors } from '@/lib/form-validation';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { FieldError } from './FieldError';
import { Icon } from './Icon';
import { PageHeaderMore } from './PageHeaderMore';
import { Select } from './Select';
import { PageSkeleton } from './Skeleton';
import { useListAnchor } from '@/lib/use-list-anchor';

/** F6-1：本地单用户 id（与 server LOCAL_MEMBER 对齐） */
const LOCAL_USER_ID = 'user-linyuan';

type SquadScope = 'all' | 'mine';

function parseScope(raw: string | null): SquadScope {
  if (raw === 'mine') return 'mine';
  return 'all';
}

/** G2-9：历史小队浏览——?view=archived 深链可分享；默认 active */
type SquadsView = 'active' | 'archived';

function parseView(raw: string | null): SquadsView {
  return raw === 'archived' ? 'archived' : 'active';
}

type ReadyFilter =
  | ''
  | 'ready'
  | 'busy'
  | 'cwd_missing'
  | 'runtime_missing'
  | 'error'
  | 'blocked';

const READY_OPTIONS: { value: ReadyFilter; label: string }[] = [
  { value: '', label: '全部队长就绪' },
  { value: 'ready', label: 'ready' },
  { value: 'busy', label: 'busy' },
  { value: 'cwd_missing', label: 'cwd 未配置' },
  { value: 'runtime_missing', label: 'runtime 缺失' },
  { value: 'error', label: 'error' },
  { value: 'blocked', label: '不可用（非 ready）' },
];

function leaderReadinessLabel(rd: AgentReadiness | null | undefined): string {
  if (!rd) return '…';
  if (rd.status === 'ready') return 'ready';
  if (rd.status === 'busy') return 'busy';
  if (rd.status === 'cwd_missing') return 'cwd 未配置';
  if (rd.status === 'runtime_missing') return 'runtime 缺失';
  return rd.status;
}

function leaderReadinessClass(status: AgentReadiness['status'] | undefined): string {
  if (status === 'ready') return 'readiness-chip readiness-ready readiness-chip-inline';
  if (status === 'busy') return 'readiness-chip readiness-busy readiness-chip-inline';
  return 'readiness-chip readiness-missing readiness-chip-inline';
}

function parseReady(raw: string | null): ReadyFilter {
  if (
    raw === 'ready' ||
    raw === 'busy' ||
    raw === 'cwd_missing' ||
    raw === 'runtime_missing' ||
    raw === 'error' ||
    raw === 'blocked'
  ) {
    return raw;
  }
  return '';
}

function readyChipLabel(ready: ReadyFilter): string {
  return READY_OPTIONS.find((o) => o.value === ready)?.label ?? ready;
}

// F6-3（UI-SQD-014）：成员头像堆叠。id → 名字反查后渲染首字圆点；名字不足时回退「N 名成员」。
const MEMBER_AVATAR_COLORS = [
  '#e5484d',
  '#f76b15',
  '#ffb224',
  '#30a46c',
  '#3e63dd',
  '#8e4ec6',
  '#0090ff',
  '#d6409f',
];

function memberAvatarColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return MEMBER_AVATAR_COLORS[h % MEMBER_AVATAR_COLORS.length];
}

type SquadMemberCellProps = {
  memberIds: string[] | undefined;
  memberCount: number | undefined;
  agentNameById: Map<string, string>;
};

function SquadMemberCell({ memberIds, memberCount, agentNameById }: SquadMemberCellProps) {
  const ids = memberIds ?? [];
  const names = ids.map((id) => agentNameById.get(id) ?? '').filter(Boolean);
  if (ids.length === 0 || names.length === 0) {
    // 降级：无 memberIds 或反查不到名字 → 「N 名成员」文本
    const count = ids.length > 0 ? ids.length : memberCount ?? 0;
    return <span className="text-dim">{count} 名成员</span>;
  }
  return (
    <span className="squad-members-stack" title={names.join('、')}>
      {names.slice(0, 4).map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="squad-member-avatar"
          data-testid="squad-member-avatar"
          style={{ background: memberAvatarColor(name) }}
          title={name}
        >
          {name.slice(0, 1)}
        </span>
      ))}
      {names.length > 4 ? (
        <span className="squad-members-extra" data-testid="squad-member-overflow">
          +{names.length - 4}
        </span>
      ) : null}
    </span>
  );
}

// bu02：小队列表 + 新建 + leader 就绪 + URL 可分享筛选
function SquadsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // G2-9：主数据源由 view 驱动；active/archived 恒取一份供 tab 计数（学 G25 AgentsPage 三查询模式，
  // 同 key 由 React Query 去重；archived 归档小队是低频历史查阅，只读不发起任何变更）
  const view = parseView(searchParams.get('view'));
  const isArchivedView = view === 'archived';
  const { data, isLoading, isError, error } = useSquads(view);
  const { data: activeSquads = [] } = useSquads('active');
  const { data: archivedSquads = [] } = useSquads('archived');
  const { data: agents = [] } = useAgents();
  const create = useCreateSquad();
  const del = useDeleteSquad();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [operatingProtocol, setOperatingProtocol] = useState('');
  const [missionDirective, setMissionDirective] = useState('');
  // W3：提交前 Zod 校验（CreateSquadInput）产生的字段级错误
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const qFromUrl = searchParams.get('q') ?? '';
  const readyFromUrl = parseReady(searchParams.get('ready'));
  const leaderFromUrl = searchParams.get('leader') ?? '';
  const scope = parseScope(searchParams.get('scope'));
  const [qDraft, setQDraft] = useState(qFromUrl);

  useEffect(() => {
    setQDraft(qFromUrl);
  }, [qFromUrl]);

  function replaceParams(patch: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = qDraft.trim();
      if (next === qFromUrl.trim()) return;
      replaceParams({ q: next || null });
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDraft]);

  const agentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.name);
    return m;
  }, [agents]);

  const leaderIds = useMemo(() => {
    const s = new Set<string>();
    // 归档视图不展示就绪（状态列被「已归档」chip 取代），只对 active 数据取 readiness
    for (const sq of activeSquads) {
      if (sq.leaderId) s.add(sq.leaderId);
    }
    for (const a of agents) s.add(a.id);
    return [...s];
  }, [activeSquads, agents]);
  const { data: readinessMap = {} } = useAgentsReadinessMap(leaderIds);

  // 默认 leader：第一个 agent
  const defaultLeader = agents[0]?.id ?? '';

  // F6-3：「我的」= leaderId 命中本地用户，或 memberIds 包含本地用户
  // （本地单用户不是 agent 成员，实际命中 leaderId 分支；memberIds 分支为逻辑正确性）
  const mySquads = useMemo(
    () =>
      activeSquads.filter(
        (sq) =>
          sq.leaderId === LOCAL_USER_ID || sq.memberIds?.includes(LOCAL_USER_ID),
      ),
    [activeSquads],
  );

  const visible = useMemo(() => {
    const list = data ?? [];
    const q = qFromUrl.trim().toLowerCase();
    // G2-9：归档视图只按名字搜索；leader/ready 就绪筛选语义只属 active 视图（归档小队只读）
    if (isArchivedView) {
      if (!q) return list;
      return list.filter((sq) => {
        const leaderName = sq.leaderId ? (agentNameById.get(sq.leaderId) ?? '') : '';
        return `${sq.name} ${leaderName} ${sq.id}`.toLowerCase().includes(q);
      });
    }
    return list.filter((sq) => {
      if (
        scope === 'mine' &&
        sq.leaderId !== LOCAL_USER_ID &&
        !(sq.memberIds ?? []).includes(LOCAL_USER_ID)
      ) {
        return false;
      }
      if (leaderFromUrl && sq.leaderId !== leaderFromUrl) return false;
      if (q) {
        const leaderName = sq.leaderId ? (agentNameById.get(sq.leaderId) ?? '') : '';
        const hay = `${sq.name} ${leaderName} ${sq.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (readyFromUrl) {
        const st = sq.leaderId ? readinessMap[sq.leaderId]?.status : undefined;
        if (readyFromUrl === 'blocked') {
          if (!st || st === 'ready') return false;
        } else if (st !== readyFromUrl) {
          return false;
        }
      }
      return true;
    });
  }, [data, isArchivedView, scope, qFromUrl, leaderFromUrl, readyFromUrl, readinessMap, agentNameById]);

  const visibleIds = useMemo(() => visible.map((s) => s.id), [visible]);
  const listFilters = useMemo(
    () => ({
      view,
      scope,
      q: qFromUrl,
      leader: leaderFromUrl,
      ready: readyFromUrl,
    }),
    [view, scope, qFromUrl, leaderFromUrl, readyFromUrl],
  );
  const { restoredId, remember } = useListAnchor({
    page: 'squads',
    filters: listFilters,
    itemIds: visibleIds,
    attr: 'data-squad-id',
  });

  // 归档视图下 leader/ready 筛选被忽略，不算「生效中」
  const hasActiveFilters = isArchivedView
    ? Boolean(qFromUrl.trim())
    : Boolean(qFromUrl.trim() || readyFromUrl || leaderFromUrl);

  function resetForm() {
    setName('');
    setLeaderId('');
    setMemberIds([]);
    setOperatingProtocol('');
    setMissionDirective('');
    setFieldErrors({});
    setOpen(false);
  }

  function toggleMember(id: string) {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const lid = leaderId || defaultLeader;
    // W3：提交前用 CreateSquadInput 校验；不过则显示字段级 FieldError
    const validated = validateWith(CreateSquadInput, {
      name: name.trim(),
      leaderId: lid,
      operatingProtocol,
      missionDirective,
      memberIds,
    });
    if (!validated.ok) {
      setFieldErrors(validated.errors);
      return;
    }
    create.mutate(validated.data, {
      onSuccess: (squad) => {
        resetForm();
        router.push(`/squads/${squad.id}`);
      },
    });
  }

  function handleDelete(id: string, label: string) {
    void (async () => {
      const ok = await confirmDialog({
        title: '归档小队？',
        description: `归档后不可恢复；小队当前指派的 Issue 和未归档自动化规则将转交给 former leader。确定归档「${label}」？`,
        confirmLabel: '归档小队',
        variant: 'danger',
      });
      if (!ok) return;
      del.mutate(id);
    })();
  }

  function setScope(next: SquadScope) {
    // F6-1：默认「全部」= 无 scope 参数；「我的」= ?scope=mine 深链可分享
    // G2-9：回到 active 视图时移除 view 参数
    replaceParams({ scope: next === 'all' ? null : 'mine', view: null });
  }

  function setView(next: SquadsView) {
    // G2-9：?view=archived 深链可分享；active = 移除参数。tab 三选一：进归档清 scope
    replaceParams({ view: next === 'archived' ? 'archived' : null, scope: null });
  }

  function clearAllFilters() {
    setQDraft('');
    if (isArchivedView) {
      // 归档视图：只清筛选，不切回 active（含清理 URL 里残留的 leader/ready）
      replaceParams({ q: null, leader: null, ready: null });
      return;
    }
    router.replace(pathname, { scroll: false });
  }

  if (isLoading) return <PageSkeleton />;
  if (isError) {
    return (
      <div className="page-container">
        <ErrorState
          title="加载小队失败"
          description={error instanceof Error ? error.message : '未知错误'}
        />
      </div>
    );
  }

  const squads = data ?? [];

  return (
    <div className="page-container collection-page" data-testid="squads-page">
      <div className="page-header">
        <div>
          <Icon name="squad" size={16} className="page-header-icon" />
          <h1 className="page-title">
            小队
            <span className="count" data-testid="squads-visible-count">
              {hasActiveFilters ? `${visible.length}/${squads.length}` : squads.length}
            </span>
          </h1>
          <p className="page-desc">一组智能体协作完成任务；队长接收 briefing 并 @mention 委派</p>
        </div>
        <div className="page-actions">
          <PageHeaderMore testId="squads-header-more">
            <Link href="/agents" data-testid="squads-to-agents" role="menuitem">
              智能体
            </Link>
            <Link href="/runs" data-testid="squads-to-runs" role="menuitem">
              运行
            </Link>
          </PageHeaderMore>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="squads-new-btn"
            onClick={() => setOpen((v) => !v)}
            disabled={agents.length === 0}
          >
            {open ? '收起' : '新建小队'}
          </button>
        </div>
      </div>

      <div className="page-body">
      {/* F6-1（UI-SQD-002）：我的 / 全部 Tab，?scope= 深链可分享，刷新不丢 */}
      {/* G2-9：第三 tab「已归档」（?view=archived），历史小队只读浏览 */}
      <div className="agents-scope-tabs" data-testid="squads-scope-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'all' && !isArchivedView}
          className={`my-issues-tab${scope === 'all' && !isArchivedView ? ' is-active' : ''}`}
          data-testid="squads-scope-all"
          onClick={() => setScope('all')}
        >
          全部 <span className="my-issues-tab-count">{activeSquads.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'mine' && !isArchivedView}
          className={`my-issues-tab${scope === 'mine' && !isArchivedView ? ' is-active' : ''}`}
          data-testid="squads-scope-mine"
          onClick={() => setScope('mine')}
        >
          我的 <span className="my-issues-tab-count">{mySquads.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isArchivedView}
          className={`my-issues-tab${isArchivedView ? ' is-active' : ''}`}
          data-testid="squads-scope-archived"
          onClick={() => setView(isArchivedView ? 'active' : 'archived')}
        >
          已归档 <span className="my-issues-tab-count">{archivedSquads.length}</span>
        </button>
      </div>

      {open && (
        <form className="ops-form surface-card" onSubmit={submit}>
          <div className="ops-form-grid">
            <label className="ops-field">
              <span>名称</span>
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((prev) => (prev.name ? { ...prev, name: '' } : prev));
                }}
                placeholder="如：补2小队"
                required
                autoFocus
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? 'squad-create-name-error' : undefined}
              />
              {fieldErrors.name ? (
                <FieldError id="squad-create-name-error" message={fieldErrors.name} dataTestId="squad-create-name-error" />
              ) : null}
            </label>
            <label className="ops-field">
              <span>Leader</span>
              <Select
                value={leaderId || defaultLeader}
                onChange={(e) => {
                  setLeaderId(e.target.value);
                  setFieldErrors((prev) => (prev.leaderId ? { ...prev, leaderId: '' } : prev));
                }}
                required
                data-testid="squad-create-leader-select"
                aria-label="小队 Leader"
                aria-invalid={fieldErrors.leaderId ? true : undefined}
                aria-describedby={fieldErrors.leaderId ? 'squad-create-leader-error' : undefined}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              {fieldErrors.leaderId ? (
                <FieldError id="squad-create-leader-error" message={fieldErrors.leaderId} dataTestId="squad-create-leader-error" />
              ) : null}
            </label>
          </div>

          <div className="ops-field">
            <span>成员（可 @mention 的 peers；可不含 leader）</span>
            <div className="ops-check-list">
              {agents.map((a) => (
                <label key={a.id} className="ops-check-item">
                  <input
                    type="checkbox"
                    checked={memberIds.includes(a.id)}
                    onChange={() => toggleMember(a.id)}
                  />
                  <span>
                    {a.name} <code className="text-dim text-sm">{a.runtime}</code>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="ops-field">
            <span>Operating Protocol</span>
            <textarea
              className="ops-textarea"
              rows={3}
              value={operatingProtocol}
              onChange={(e) => setOperatingProtocol(e.target.value)}
              placeholder="协作规则…"
            />
          </label>
          <label className="ops-field">
            <span>Mission Directive</span>
            <textarea
              className="ops-textarea"
              rows={3}
              value={missionDirective}
              onChange={(e) => setMissionDirective(e.target.value)}
              placeholder="任务指令…"
            />
          </label>

          <div className="ops-form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              // W3：校验错误用 FieldError 展示，按钮只在提交中禁用
              disabled={create.isPending}
            >
              {create.isPending ? '创建中…' : '创建'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              取消
            </button>
          </div>
        </form>
      )}

      {squads.length === 0 ? (
        isArchivedView ? (
          // G2-9：归档空态与 active 创建引导空态明确区分
          <EmptyState
            title="还没有已归档的小队"
            description="归档的小队会保留在这里，仅供查阅"
          />
        ) : (
          <EmptyState
            title="创建一个小队开始协作"
            description="选择 leader 与成员，配置 protocol / directive"
          />
        )
      ) : (
        <>
          <div className="agents-filters collection-toolbar" data-testid="squads-filters">
            <div className="table-search memory-search-wrap">
              <input
                type="search"
                placeholder="搜索小队 / 队长…"
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
                data-testid="squads-search"
                aria-label="搜索小队"
              />
              {qFromUrl.trim() ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  data-testid="squads-search-clear"
                  onClick={() => {
                    setQDraft('');
                    replaceParams({ q: null });
                  }}
                >
                  清除
                </button>
              ) : null}
            </div>
            {/* G2-9：归档视图隐藏 leader/ready 筛选（就绪语义只属 active；归档行不可变更） */}
            {!isArchivedView && (
              <label className="agents-filter-field">
                队长
                <Select
                  value={leaderFromUrl}
                  data-testid="squads-leader-filter"
                  onChange={(e) => replaceParams({ leader: e.target.value || null })}
                  aria-label="按队长筛选"
                >
                  <option value="">全部</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {!isArchivedView && (
              <label className="agents-filter-field">
                队长就绪
                <Select
                  value={readyFromUrl}
                  data-testid="squads-ready-filter"
                  onChange={(e) => replaceParams({ ready: e.target.value || null })}
                  aria-label="按队长就绪筛选"
                >
                  {READY_OPTIONS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>

          {hasActiveFilters ? (
            <div
              className="agents-active-filters"
              data-testid="squads-active-filters"
              aria-label="当前筛选"
            >
              {qFromUrl.trim() ? (
                <button
                  type="button"
                  className="kanban-active-chip"
                  data-testid="squads-chip-q"
                  onClick={() => {
                    setQDraft('');
                    replaceParams({ q: null });
                  }}
                >
                  搜索「{qFromUrl.trim()}」 ×
                </button>
              ) : null}
              {!isArchivedView && leaderFromUrl ? (
                <button
                  type="button"
                  className="kanban-active-chip"
                  data-testid="squads-chip-leader"
                  onClick={() => replaceParams({ leader: null })}
                >
                  队长 · {agentNameById.get(leaderFromUrl) ?? leaderFromUrl} ×
                </button>
              ) : null}
              {!isArchivedView && readyFromUrl ? (
                <button
                  type="button"
                  className="kanban-active-chip"
                  data-testid="squads-chip-ready"
                  onClick={() => replaceParams({ ready: null })}
                >
                  就绪 · {readyChipLabel(readyFromUrl)} ×
                </button>
              ) : null}
              <button
                type="button"
                className="kanban-active-chip kanban-active-chip--clear"
                data-testid="squads-chip-clear-all"
                onClick={clearAllFilters}
              >
                清除全部
              </button>
            </div>
          ) : null}

          <div className="data-table-wrap">
            <table className="data-table" data-testid="squads-table">
              <thead>
                <tr>
                  <th>小队</th>
                  <th>Leader</th>
                  <th>{isArchivedView ? '状态' : '队长就绪'}</th>
                  <th>成员</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-dim" style={{ textAlign: 'center' }}>
                      <div data-testid="squads-empty-filter">
                        <div>{isArchivedView ? '没有匹配的已归档小队' : '没有匹配的小队'}</div>
                        <div style={{ marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            data-testid="squads-clear-filter"
                            onClick={clearAllFilters}
                          >
                            清除筛选
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  visible.map((sq, rowIndex) => {
                    const rd = sq.leaderId ? readinessMap[sq.leaderId] : null;
                    return (
                      <tr
                        key={sq.id}
                        data-squad-id={sq.id}
                        data-restored={restoredId === sq.id ? '1' : '0'}
                      >
                        <td>
                          <Link
                            href={`/squads/${sq.id}`}
                            className="agent-cell"
                            onClick={() => remember(sq.id, rowIndex)}
                          >
                            <span className="agent-icon-sm">
                              <Icon name="squad" size={14} />
                            </span>
                            <span>
                              <div className="agent-cell-name">{sq.name}</div>
                            </span>
                          </Link>
                        </td>
                        <td>
                          {sq.leaderId ? (
                            isArchivedView ? (
                              // G2-9：归档视图 leader 不挂筛选链接（leader 筛选只属 active 视图）
                              <span data-testid="squad-list-leader">
                                {agentNameById.get(sq.leaderId) ?? <code>{sq.leaderId}</code>}
                              </span>
                            ) : (
                              <Link
                                href={`/squads?leader=${encodeURIComponent(sq.leaderId)}`}
                                className="table-link"
                                data-testid="squad-list-leader"
                                title="筛选此队长的小队"
                              >
                                {agentNameById.get(sq.leaderId) ?? <code>{sq.leaderId}</code>}
                              </Link>
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {sq.archivedAt ? (
                            // G2-9：归档行状态列 = 「已归档」chip + 日期（dim 风格对齐 readiness-archived）
                            <span
                              className="readiness-chip readiness-archived readiness-chip-inline"
                              data-testid="squad-archived-chip"
                              title={sq.archivedAt}
                            >
                              已归档 · {new Date(sq.archivedAt).toLocaleDateString()}
                            </span>
                          ) : sq.leaderId ? (
                            <Link
                              href={`/squads?ready=${encodeURIComponent(rd?.status ?? 'error')}`}
                              className={leaderReadinessClass(rd?.status)}
                              data-testid="squad-leader-readiness"
                              data-status={rd?.status ?? 'unknown'}
                              title={
                                rd?.detail
                                  ? `${rd.detail} · 点击筛选同态`
                                  : `筛选队长就绪：${rd?.status ?? 'unknown'}`
                              }
                            >
                              {leaderReadinessLabel(rd)}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td
                          className="squad-members-cell"
                          data-testid="squad-member-count"
                        >
                          <SquadMemberCell
                            memberIds={sq.memberIds}
                            memberCount={sq.memberCount}
                            agentNameById={agentNameById}
                          />
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <Link
                            href={`/?assignee=squad:${encodeURIComponent(sq.id)}`}
                            className="btn btn-ghost btn-sm"
                            data-testid="squad-list-board"
                          >
                            看板
                          </Link>{' '}
                          <Link
                            href={`/runs?squad=${encodeURIComponent(sq.id)}`}
                            className="btn btn-ghost btn-sm"
                            data-testid="squad-list-runs"
                          >
                            运行
                          </Link>{' '}
                          {/* G2-9：归档行动作只属 active 视图——归档视图只读，不得再变更 */}
                          {!isArchivedView && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={del.isPending}
                              onClick={() => handleDelete(sq.id, sq.name)}
                            >
                              归档
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

export function SquadsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SquadsPageInner />
    </Suspense>
  );
}
