'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { classifyRunFailure, type AgentRun } from '@ma/shared';
import {
  useAgents,
  useCancelRunsMany,
  useRecoverStuckRuns,
  useRetryRun,
  useSquads,
  useWorkspaceRuns,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { PageHeaderMore } from './PageHeaderMore';
import { RunEventTimelineDrawer } from './RunEventTimeline';

/**
 * 运行观测页（本仓超车 Multica：真站无独立 /runs，本地做 Mission Control 列表）
 * IA：状态页签 + 单条恢复提示 + 密表；运维不在每行复制一遍。
 */

type StatusFilter =
  | ''
  | 'active'
  | 'queued'
  | 'running'
  | 'failed'
  | 'cancelled'
  | 'completed';

const STATUS_VALUES: StatusFilter[] = [
  '',
  'active',
  'queued',
  'running',
  'failed',
  'cancelled',
  'completed',
];

/** 顶层页签：默认失败（运维主场景）；其余进「更多状态」 */
const SCOPE_TABS: { id: StatusFilter | 'all'; label: string }[] = [
  { id: 'failed', label: '失败' },
  { id: 'active', label: '在途' },
  { id: 'all', label: '全部' },
  { id: 'completed', label: '完成' },
];

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
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
  return new Date(iso).toLocaleString();
}

function parseStatus(raw: string | null): StatusFilter {
  if (raw === 'all') return '';
  if (raw && (STATUS_VALUES as string[]).includes(raw)) return raw as StatusFilter;
  // 无 status 参数时默认 failed（运维入口）
  if (raw === null) return 'failed';
  return '';
}

function kindLabel(kind: AgentRun['kind']): string {
  if (kind === 'quick_create') return '快速派活';
  if (kind === 'chat') return '聊天';
  return 'Issue';
}

function RunActions({ run }: { run: AgentRun }) {
  const retry = useRetryRun();
  const canRetry = run.status === 'failed' || run.status === 'cancelled';

  if (!canRetry) {
    return null;
  }

  if (!run.issueId) {
    const qp = run.quickPrompt?.trim()
      ? `?quickPrompt=${encodeURIComponent(run.quickPrompt.trim())}`
      : '';
    return (
      <Link
        href={`/${qp}`}
        className="btn btn-secondary btn-sm"
        data-testid="runs-row-quick-create"
        title="无 Issue 的快速派活失败，请重新派活"
      >
        重派
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      data-testid="runs-row-retry"
      disabled={retry.isPending}
      onClick={() => retry.mutate(run.id)}
    >
      {retry.isPending ? '…' : '再执行'}
    </button>
  );
}

function RunsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = parseStatus(searchParams.get('status'));
  const agentId = searchParams.get('agent') ?? '';
  const squadId = searchParams.get('squad') ?? '';
  const leaderOnly = searchParams.get('leader') === '1';
  const highlightRunId = searchParams.get('run') ?? '';
  const [timelineRunId, setTimelineRunId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(Boolean(agentId || squadId || leaderOnly));

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

  const setScope = useCallback(
    (next: StatusFilter | 'all') => {
      if (next === 'all') replaceParams({ status: 'all' });
      else replaceParams({ status: next });
    },
    [replaceParams],
  );

  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
  const recoverStuck = useRecoverStuckRuns();
  const cancelMany = useCancelRunsMany();
  const { data: runs, isLoading, isError, error, refetch, isFetching } = useWorkspaceRuns({
    status: status || undefined,
    agentId: agentId || undefined,
    squadId: squadId || undefined,
    isLeader: leaderOnly ? true : undefined,
    limit: 80,
  });

  const agentName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.name);
    return m;
  }, [agents]);

  const visibleRuns = runs;
  const activeVisibleIds = useMemo(() => {
    if (!visibleRuns) return [] as string[];
    return visibleRuns
      .filter((r) => r.status === 'queued' || r.status === 'running')
      .map((r) => r.id);
  }, [visibleRuns]);

  const timelineRun = useMemo(() => {
    if (!timelineRunId || !visibleRuns) return undefined;
    return visibleRuns.find((r) => r.id === timelineRunId);
  }, [timelineRunId, visibleRuns]);

  useEffect(() => {
    if (!highlightRunId || !visibleRuns?.length) return;
    const el = document.querySelector(`[data-run-id="${highlightRunId}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightRunId, visibleRuns]);

  useEffect(() => {
    if (!highlightRunId) return;
    if (searchParams.get('timeline') === '1') {
      setTimelineRunId(highlightRunId);
    }
  }, [highlightRunId, searchParams]);

  const failedIssueCount = useMemo(() => {
    if (status !== 'failed' || !visibleRuns) return 0;
    const s = new Set<string>();
    for (const r of visibleRuns) {
      if (r.issueId) s.add(r.issueId);
    }
    return s.size;
  }, [status, visibleRuns]);

  const hasExtraFilters = Boolean(agentId || squadId || leaderOnly);

  const rareStatus =
    status === 'queued' || status === 'running' || status === 'cancelled' ? status : null;

  return (
    <div
      className="page-container collection-page runs-page"
      data-testid="runs-page"
      data-status={status || 'all'}
    >
      <div className="page-header">
        <div>
          <Icon name="usage" size={16} className="page-header-icon" />
          <h1 className="page-title">
            运行
            <span className="count" data-testid="runs-visible-count">
              {visibleRuns?.length ?? 0}
            </span>
          </h1>
          <p className="page-desc page-desc--quiet">
            工作区执行轨迹 · 失败恢复与在途收尸
          </p>
        </div>
        <div className="page-actions runs-page-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="runs-refresh"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? '刷新中…' : '刷新'}
          </button>
          <PageHeaderMore testId="runs-header-more">
            <Link href="/?failed=1" data-testid="runs-to-failed-board" role="menuitem">
              看板仅失败
              {failedIssueCount > 0 ? ` · ${failedIssueCount}` : ''}
            </Link>
            <Link
              href="/inbox?kind=run_failed&read=unread"
              data-testid="runs-to-inbox-fails"
              role="menuitem"
            >
              收件箱失败
            </Link>
            <Link href="/settings" data-testid="runs-to-settings" role="menuitem">
              环境诊断
            </Link>
            <Link href="/runtimes" data-testid="runs-to-runtimes" role="menuitem">
              本机 CLI
            </Link>
            <Link href="/agents?ready=blocked" data-testid="runs-to-agents" role="menuitem">
              不可用智能体
            </Link>
            <button
              type="button"
              role="menuitem"
              data-testid="runs-fail-recover-stuck"
              disabled={recoverStuck.isPending}
              onClick={() => recoverStuck.mutate()}
            >
              {recoverStuck.isPending ? '收尸中…' : '收尸卡住 run'}
            </button>
          </PageHeaderMore>
        </div>
      </div>

      <div className="page-body runs-page-body">
        {/* 状态页签：主交互轴，替代顶栏一堆运维按钮 */}
        <div className="runs-scope-tabs" data-testid="runs-scope-tabs" role="tablist">
          {SCOPE_TABS.map((t) => {
            const isActive = t.id === 'all' ? status === '' : status === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`my-issues-tab${isActive ? ' is-active' : ''}`}
                data-testid={`runs-scope-${t.id === 'all' ? 'all' : t.id}`}
                data-scope={t.id}
                onClick={() => setScope(t.id)}
              >
                {t.label}
              </button>
            );
          })}
          {rareStatus ? (
            <span className="runs-scope-extra" data-testid="runs-scope-rare">
              <span className="my-issues-tab is-active">{rareStatus}</span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setScope('all')}
              >
                清除
              </button>
            </span>
          ) : null}
          <div className="runs-scope-spacer" />
          <button
            type="button"
            className={`btn btn-ghost btn-sm${filtersOpen || hasExtraFilters ? ' is-active-filter' : ''}`}
            data-testid="runs-filters-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            筛选{hasExtraFilters ? ' · 开' : ''}
          </button>
        </div>

        {/* 在途才给批量操作；失败列表直接看行内「再执行」，不塞环境配置 CTA */}
        {activeVisibleIds.length > 0 ? (
          <div className="runs-insight" data-testid="runs-active-cancel-banner" role="status">
            <div className="runs-insight-text">
              <strong>{activeVisibleIds.length}</strong> 条在途（queued / running）
            </div>
            <div className="runs-insight-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                data-testid="runs-cancel-visible-active-banner"
                disabled={cancelMany.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      `取消当前列表中 ${activeVisibleIds.length} 条在途 run？`,
                    )
                  ) {
                    return;
                  }
                  cancelMany.mutate(activeVisibleIds);
                }}
              >
                {cancelMany.isPending
                  ? '取消中…'
                  : `取消在途 · ${activeVisibleIds.length}`}
              </button>
              {status !== 'active' ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-testid="runs-active-cancel-to-active"
                  onClick={() => setScope('active')}
                >
                  仅在途
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {filtersOpen || hasExtraFilters ? (
          <div className="runs-filters collection-toolbar" data-testid="runs-filters">
            <label>
              Agent
              <select
                value={agentId}
                data-testid="runs-agent-filter"
                onChange={(e) => replaceParams({ agent: e.target.value || null })}
                aria-label="筛选 agent"
              >
                <option value="">全部</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              小队
              <select
                value={squadId}
                data-testid="runs-squad-filter"
                onChange={(e) => replaceParams({ squad: e.target.value || null })}
                aria-label="筛选小队"
              >
                <option value="">全部</option>
                {squads.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="runs-filter-check">
              <input
                type="checkbox"
                checked={leaderOnly}
                onChange={(e) => replaceParams({ leader: e.target.checked ? '1' : null })}
                aria-label="仅队长 run"
              />
              仅队长
            </label>
            <label>
              细分状态
              <select
                value={status}
                data-testid="runs-status-filter"
                onChange={(e) => {
                  const v = e.target.value as StatusFilter;
                  if (v === '') replaceParams({ status: 'all' });
                  else replaceParams({ status: v });
                }}
                aria-label="细分状态"
              >
                <option value="">全部</option>
                <option value="active">活跃 (queued+running)</option>
                <option value="failed">failed</option>
                <option value="running">running</option>
                <option value="queued">queued</option>
                <option value="cancelled">cancelled</option>
                <option value="completed">completed</option>
              </select>
            </label>
          </div>
        ) : null}

        {hasExtraFilters ? (
          <div
            className="runs-active-filters"
            data-testid="runs-active-filters"
            aria-label="当前筛选"
          >
            {agentId ? (
              <button
                type="button"
                className="kanban-active-chip"
                data-testid="runs-chip-agent"
                onClick={() => replaceParams({ agent: null })}
              >
                Agent · {agentName.get(agentId) ?? agentId.slice(0, 8)} ×
              </button>
            ) : null}
            {squadId ? (
              <button
                type="button"
                className="kanban-active-chip"
                data-testid="runs-chip-squad"
                onClick={() => replaceParams({ squad: null })}
              >
                小队 · {squads.find((s) => s.id === squadId)?.name ?? squadId.slice(0, 8)} ×
              </button>
            ) : null}
            {leaderOnly ? (
              <button
                type="button"
                className="kanban-active-chip"
                data-testid="runs-chip-leader"
                onClick={() => replaceParams({ leader: null })}
              >
                仅队长 ×
              </button>
            ) : null}
            <button
              type="button"
              className="kanban-active-chip kanban-active-chip--clear"
              data-testid="runs-chip-clear-all"
              onClick={() =>
                replaceParams({
                  agent: null,
                  squad: null,
                  leader: null,
                })
              }
            >
              清除筛选
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-dim">加载中…</p>
        ) : isError ? (
          <EmptyState
            title="加载运行失败"
            description={error instanceof Error ? error.message : '未知错误'}
          />
        ) : !visibleRuns || visibleRuns.length === 0 ? (
          <EmptyState
            title={
              status === 'active'
                ? '当前没有在途运行'
                : status === 'failed'
                  ? '没有失败运行'
                  : '没有匹配的运行'
            }
            description={
              status === 'active'
                ? 'queued / running 为空时属正常。可从看板派活。'
                : '换页签或筛选，或先指派 / 快速派活产生 run。'
            }
            action={
              <div className="runs-empty-actions" data-testid="runs-empty-actions">
                {status !== '' ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    data-testid="runs-empty-all"
                    onClick={() => setScope('all')}
                  >
                    查看全部
                  </button>
                ) : null}
                {status !== 'failed' ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    data-testid="runs-empty-failed"
                    onClick={() => setScope('failed')}
                  >
                    看失败
                  </button>
                ) : null}
                <Link href="/" className="btn btn-primary btn-sm" data-testid="runs-empty-board">
                  去看板
                </Link>
              </div>
            }
          />
        ) : (
          <div className="data-table-wrap runs-table-wrap">
            <table className="data-table runs-table" data-testid="runs-table">
              <thead>
                <tr>
                  <th className="runs-col-status">状态</th>
                  <th>任务</th>
                  <th>Agent</th>
                  <th className="runs-col-reason">说明</th>
                  <th className="runs-col-time">时间</th>
                  <th className="runs-col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleRuns.map((r) => {
                  const cls =
                    r.status === 'failed' || r.error
                      ? classifyRunFailure(r.error)
                      : null;
                  const highlighted = highlightRunId === r.id;
                  const reasonTitle = cls
                    ? `${cls.title}${r.error ? `\n${r.error}` : ''}`
                    : (r.error ?? '');
                  return (
                    <tr
                      key={r.id}
                      data-run-id={r.id}
                      data-run-status={r.status}
                      data-is-leader={r.isLeader ? '1' : '0'}
                      data-squad-id={r.squadId ?? ''}
                      data-highlight={highlighted ? '1' : '0'}
                      className={`runs-row-clickable${highlighted ? ' runs-row--highlight' : ''}`}
                      onClick={() => router.push(`/runs/${r.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/runs/${r.id}`);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      title="打开运行详情"
                    >
                      <td className="runs-col-status">
                        <span
                          className={`run-pill run-pill--${r.status}`}
                          data-testid="runs-status-pill"
                          data-status={r.status}
                        >
                          {r.status}
                        </span>
                        {r.isLeader ? (
                          <span className="leader-badge runs-leader-badge" title="小队队长 run">
                            队长
                          </span>
                        ) : null}
                      </td>
                      <td className="runs-col-task">
                        <div className="runs-task-main">
                          {r.issueId ? (
                            <Link
                              href={`/issues/${r.issueId}`}
                              className="runs-task-link"
                              data-testid="runs-issue-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {shortId(r.issueId)}
                            </Link>
                          ) : (
                            <Link
                              href={`/runs/${r.id}`}
                              className="runs-task-link"
                              data-testid="runs-detail-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {shortId(r.id)}
                            </Link>
                          )}
                          <span className="runs-task-meta">
                            {kindLabel(r.kind)}
                            {r.squadId ? (
                              <>
                                {' · '}
                                <Link
                                  href={`/squads/${r.squadId}`}
                                  className="runs-task-meta-link"
                                  data-testid="runs-squad-detail-link"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  小队
                                </Link>
                              </>
                            ) : null}
                          </span>
                        </div>
                      </td>
                      <td>
                        <Link
                          href={`/agents/${r.agentId}`}
                          className="table-link"
                          data-testid="runs-agent-detail-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {agentName.get(r.agentId) ?? shortId(r.agentId)}
                        </Link>
                      </td>
                      <td className="runs-col-reason">
                        {cls ? (
                          <div className="runs-reason" title={reasonTitle}>
                            <span className="runs-reason-title">{cls.title}</span>
                            {r.error ? (
                              <span className="runs-reason-hint text-dim">
                                {r.error.length > 72 ? `${r.error.slice(0, 72)}…` : r.error}
                              </span>
                            ) : (
                              <span className="runs-reason-hint text-dim">{cls.hint}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </td>
                      <td className="runs-col-time text-dim text-sm">
                        {relativeTime(r.createdAt)}
                      </td>
                      <td className="runs-col-actions">
                        <div
                          className="runs-row-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/runs/${r.id}`}
                            className="btn btn-ghost btn-sm"
                            data-testid="runs-open-detail"
                          >
                            详情
                          </Link>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            data-testid="runs-open-timeline"
                            onClick={() => setTimelineRunId(r.id)}
                          >
                            时间线
                          </button>
                          <RunActions run={r} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RunEventTimelineDrawer
        run={timelineRun}
        open={Boolean(timelineRunId && timelineRun)}
        onClose={() => setTimelineRunId(null)}
      />
    </div>
  );
}

export function RunsPage() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <RunsPageInner />
    </Suspense>
  );
}
