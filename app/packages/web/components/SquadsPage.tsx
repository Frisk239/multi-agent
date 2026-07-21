'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AgentReadiness, CreateSquadInput } from '@ma/shared';
import {
  useAgents,
  useAgentsReadinessMap,
  useCreateSquad,
  useDeleteSquad,
  useSquads,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { PageHeaderMore } from './PageHeaderMore';

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

// bu02：小队列表 + 新建 + leader 就绪 + URL 可分享筛选
function SquadsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, error } = useSquads();
  const { data: agents = [] } = useAgents();
  const create = useCreateSquad();
  const del = useDeleteSquad();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [operatingProtocol, setOperatingProtocol] = useState('');
  const [missionDirective, setMissionDirective] = useState('');

  const qFromUrl = searchParams.get('q') ?? '';
  const readyFromUrl = parseReady(searchParams.get('ready'));
  const leaderFromUrl = searchParams.get('leader') ?? '';
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
    for (const sq of data ?? []) {
      if (sq.leaderId) s.add(sq.leaderId);
    }
    for (const a of agents) s.add(a.id);
    return [...s];
  }, [data, agents]);
  const { data: readinessMap = {} } = useAgentsReadinessMap(leaderIds);

  // 默认 leader：第一个 agent
  const defaultLeader = agents[0]?.id ?? '';

  const visible = useMemo(() => {
    const list = data ?? [];
    const q = qFromUrl.trim().toLowerCase();
    return list.filter((sq) => {
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
  }, [data, qFromUrl, leaderFromUrl, readyFromUrl, readinessMap, agentNameById]);

  const hasActiveFilters = Boolean(qFromUrl.trim() || readyFromUrl || leaderFromUrl);

  function resetForm() {
    setName('');
    setLeaderId('');
    setMemberIds([]);
    setOperatingProtocol('');
    setMissionDirective('');
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
    if (!name.trim() || !lid) return;
    const input: CreateSquadInput = {
      name: name.trim(),
      leaderId: lid,
      operatingProtocol,
      missionDirective,
      memberIds,
    };
    create.mutate(input, {
      onSuccess: (squad) => {
        resetForm();
        router.push(`/squads/${squad.id}`);
      },
    });
  }

  function handleDelete(id: string, label: string) {
    if (!window.confirm(`确定删除小队「${label}」？`)) return;
    del.mutate(id);
  }

  function clearAllFilters() {
    setQDraft('');
    router.replace(pathname, { scroll: false });
  }

  if (isLoading) return <div className="page-container">加载中…</div>;
  if (isError) {
    return (
      <div className="page-container">
        <EmptyState
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
      {open && (
        <form className="ops-form surface-card" onSubmit={submit}>
          <div className="ops-form-grid">
            <label className="ops-field">
              <span>名称</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：补2小队"
                required
                autoFocus
              />
            </label>
            <label className="ops-field">
              <span>Leader</span>
              <select
                value={leaderId || defaultLeader}
                onChange={(e) => setLeaderId(e.target.value)}
                required
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
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
              disabled={create.isPending || !name.trim() || !(leaderId || defaultLeader)}
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
        <EmptyState
          title="创建一个小队开始协作"
          description="选择 leader 与成员，配置 protocol / directive"
        />
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
            <label className="agents-filter-field">
              队长
              <select
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
              </select>
            </label>
            <label className="agents-filter-field">
              队长就绪
              <select
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
              </select>
            </label>
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
              {leaderFromUrl ? (
                <button
                  type="button"
                  className="kanban-active-chip"
                  data-testid="squads-chip-leader"
                  onClick={() => replaceParams({ leader: null })}
                >
                  队长 · {agentNameById.get(leaderFromUrl) ?? leaderFromUrl} ×
                </button>
              ) : null}
              {readyFromUrl ? (
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
                  <th>队长就绪</th>
                  <th>成员数</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-dim" style={{ textAlign: 'center' }}>
                      <div data-testid="squads-empty-filter">
                        <div>没有匹配的小队</div>
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
                  visible.map((sq) => {
                    const rd = sq.leaderId ? readinessMap[sq.leaderId] : null;
                    return (
                      <tr key={sq.id} data-squad-id={sq.id}>
                        <td>
                          <Link href={`/squads/${sq.id}`} className="agent-cell">
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
                            <Link
                              href={`/squads?leader=${encodeURIComponent(sq.leaderId)}`}
                              className="table-link"
                              data-testid="squad-list-leader"
                              title="筛选此队长的小队"
                            >
                              {agentNameById.get(sq.leaderId) ?? <code>{sq.leaderId}</code>}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {sq.leaderId ? (
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
                        <td className="text-dim">{sq.memberCount ?? '—'}</td>
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
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={del.isPending}
                            onClick={() => handleDelete(sq.id, sq.name)}
                          >
                            删除
                          </button>
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
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <SquadsPageInner />
    </Suspense>
  );
}
