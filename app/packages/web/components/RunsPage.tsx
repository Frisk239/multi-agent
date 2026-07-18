'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { classifyRunFailure, type AgentRun } from '@ma/shared';
import { useAgents, useRetryRun, useSquads, useWorkspaceRuns } from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

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
  // 无 status 参数时默认 failed（与历史 runs 页一致）
  if (raw === null) return 'failed';
  return '';
}

function RunActions({ run }: { run: AgentRun }) {
  const retry = useRetryRun();
  const canRetry = run.status === 'failed' || run.status === 'cancelled';

  if (!canRetry) return <span className="text-dim">—</span>;

  if (!run.issueId) {
    const qp = run.quickPrompt?.trim()
      ? `?quickPrompt=${encodeURIComponent(run.quickPrompt.trim())}`
      : '';
    return (
      <Link
        href={`/${qp}`}
        className="btn-secondary btn-sm"
        title="无 Issue 的快速派活失败，请重新派活"
      >
        去快速派活
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="btn-primary btn-sm"
      disabled={retry.isPending}
      onClick={() => retry.mutate(run.id)}
    >
      {retry.isPending ? '排队中…' : '再执行'}
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

  const { data: agents = [] } = useAgents();
  const { data: squads = [] } = useSquads();
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

  // 高亮行滚入视口
  useEffect(() => {
    if (!highlightRunId || !visibleRuns?.length) return;
    const el = document.querySelector(`[data-run-id="${highlightRunId}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightRunId, visibleRuns]);

  const failedIssueCount = useMemo(() => {
    if (status !== 'failed' || !visibleRuns) return 0;
    const s = new Set<string>();
    for (const r of visibleRuns) {
      if (r.issueId) s.add(r.issueId);
    }
    return s.size;
  }, [status, visibleRuns]);

  const cwdFailCount = useMemo(() => {
    if (status !== 'failed' || !visibleRuns) return 0;
    return visibleRuns.filter((r) => {
      const e = (r.error ?? '').toLowerCase();
      return e.includes('cwd') || e.includes('ma_workspace_cwd') || e.includes('工作目录');
    }).length;
  }, [status, visibleRuns]);

  return (
    <div className="page-container" data-testid="runs-page" data-status={status || 'all'}>
      <div className="page-header">
        <div>
          <div className="page-title">
            <Icon name="usage" size={18} /> 运行{' '}
            <span className="count">{visibleRuns?.length ?? 0}</span>
          </div>
          <div className="page-desc">
            筛选同步 URL（可分享）；status=active 为 queued+running 在途列表。
          </div>
        </div>
        <div className="page-actions runs-page-actions">
          {status === 'failed' ? (
            <Link
              href="/?failed=1"
              className="btn-secondary btn-sm"
              data-testid="runs-to-failed-board"
              title={
                failedIssueCount > 0
                  ? `打开看板仅失败（约 ${failedIssueCount} 个 Issue）`
                  : '打开看板仅失败筛选'
              }
            >
              看板仅失败
              {failedIssueCount > 0 ? ` · ${failedIssueCount}` : ''}
            </Link>
          ) : (
            <Link
              href="/runs?status=failed"
              className="btn-secondary btn-sm"
              data-testid="runs-filter-failed"
            >
              看失败 run
            </Link>
          )}
          <Link
            href="/inbox?kind=run_failed&read=unread"
            className="btn-secondary btn-sm"
            data-testid="runs-to-inbox-fails"
          >
            Inbox 失败
          </Link>
          <button type="button" className="btn-secondary" onClick={() => refetch()} disabled={isFetching}>
            刷新
          </button>
        </div>
      </div>

      {status === 'failed' && (visibleRuns?.length ?? 0) > 0 ? (
        <div className="fail-recovery-banner" data-testid="runs-fail-recovery" role="status">
          <div className="fail-recovery-banner-text">
            {cwdFailCount > 0 ? (
              <>
                当前列表约 <strong>{cwdFailCount}</strong> 条失败与{' '}
                <code>MA_WORKSPACE_CWD</code> 有关。配置工作区后，可在行内「再执行」或看板打开 Issue 重试。
              </>
            ) : (
              <>
                共 <strong>{visibleRuns?.length ?? 0}</strong> 条失败 run
                {failedIssueCount > 0 ? ` · 覆盖 ${failedIssueCount} 个 Issue` : ''}
                。可逐行再执行，或打开看板/环境对照原因。
              </>
            )}
          </div>
          <div className="fail-recovery-banner-actions">
            {cwdFailCount > 0 ? (
              <Link href="/settings" className="btn-primary btn-sm" data-testid="runs-fail-to-settings">
                环境诊断 / cwd
              </Link>
            ) : null}
            <Link href="/runtimes" className="btn-secondary btn-sm" data-testid="runs-fail-to-runtimes">
              运行时
            </Link>
            <Link href="/?failed=1" className="btn-secondary btn-sm" data-testid="runs-fail-to-board">
              看板仅失败
            </Link>
            <Link
              href="/agents?ready=blocked"
              className="btn-ghost btn-sm"
              data-testid="runs-fail-to-agents"
            >
              不可用智能体
            </Link>
          </div>
        </div>
      ) : null}

      <div className="runs-filters">
        <label>
          状态
          <select
            value={status}
            data-testid="runs-status-filter"
            onChange={(e) => {
              const v = e.target.value as StatusFilter;
              // 显式写 status=（含 failed/active），便于分享；选「全部」则删参数并区分默认
              if (v === '') replaceParams({ status: 'all' });
              else replaceParams({ status: v });
            }}
            aria-label="筛选状态"
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
        <label>
          Agent
          <select
            value={agentId}
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
          仅队长 run
        </label>
      </div>

      {(status || agentId || squadId || leaderOnly) ? (
        <div
          className="runs-active-filters"
          data-testid="runs-active-filters"
          aria-label="当前筛选"
        >
          {status ? (
            <button
              type="button"
              className="kanban-active-chip"
              data-testid="runs-chip-status"
              onClick={() => replaceParams({ status: 'all' })}
            >
              状态 · {status === 'active' ? '活跃' : status} ×
            </button>
          ) : null}
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
                status: 'all',
                agent: null,
                squad: null,
                leader: null,
              })
            }
          >
            清除全部
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
              ? 'queued / running 为空时属正常。可从看板派活，或查看全部 / 失败记录。'
              : '换筛选条件，或先指派 / 快速派活产生 run。'
          }
          action={
            <div className="runs-empty-actions" data-testid="runs-empty-actions">
              {status === 'active' || status === 'failed' ? (
                <Link
                  href="/runs?status=all"
                  className="btn-secondary btn-sm"
                  data-testid="runs-empty-all"
                >
                  查看全部
                </Link>
              ) : null}
              {status !== 'failed' ? (
                <Link
                  href="/runs?status=failed"
                  className="btn-secondary btn-sm"
                  data-testid="runs-empty-failed"
                >
                  看失败 run
                </Link>
              ) : null}
              {status !== 'active' ? (
                <Link
                  href="/runs?status=active"
                  className="btn-secondary btn-sm"
                  data-testid="runs-empty-active"
                >
                  看在途
                </Link>
              ) : null}
              <Link href="/" className="btn-primary btn-sm" data-testid="runs-empty-board">
                去看板派活
              </Link>
            </div>
          }
        />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table" data-testid="runs-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>Agent</th>
                <th>类型</th>
                <th>Issue</th>
                <th>失败说明</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRuns.map((r) => {
                const cls =
                  r.status === 'failed' || r.error
                    ? classifyRunFailure(r.error)
                    : null;
                const highlighted = highlightRunId === r.id;
                return (
                  <tr
                    key={r.id}
                    data-run-id={r.id}
                    data-run-status={r.status}
                    data-is-leader={r.isLeader ? '1' : '0'}
                    data-squad-id={r.squadId ?? ''}
                    data-highlight={highlighted ? '1' : '0'}
                    className={highlighted ? 'runs-row--highlight' : undefined}
                  >
                    <td>
                      <div className="runs-status-cell">
                        <Link
                          href={`/runs?status=${encodeURIComponent(r.status)}`}
                          className={`run-pill run-pill--${r.status} run-pill--link`}
                          data-testid="runs-status-filter-link"
                          data-status={r.status}
                          title={`筛选状态：${r.status}`}
                        >
                          {r.status}
                        </Link>
                        {r.isLeader ? (
                          <Link
                            href="/runs?leader=1"
                            className="leader-badge runs-leader-badge"
                            data-testid="runs-leader-filter-link"
                            title="仅队长 run"
                          >
                            队长
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <Link
                        href={`/agents/${r.agentId}`}
                        data-testid="runs-agent-detail-link"
                      >
                        {agentName.get(r.agentId) ?? shortId(r.agentId)}
                      </Link>{' '}
                      <Link
                        href={`/runs?agent=${encodeURIComponent(r.agentId)}`}
                        className="runs-inline-filter"
                        data-testid="runs-agent-filter-link"
                        title="筛选此 Agent 的运行"
                      >
                        筛
                      </Link>
                    </td>
                    <td>
                      <div className="runs-kind-cell">
                        <code>{r.kind}</code>
                        {r.squadId ? (
                          <>
                            <Link
                              href={`/squads/${r.squadId}`}
                              className="runs-squad-link"
                              title="打开小队"
                              data-testid="runs-squad-detail-link"
                            >
                              小队
                            </Link>
                            <Link
                              href={`/runs?squad=${encodeURIComponent(r.squadId)}`}
                              className="runs-inline-filter"
                              data-testid="runs-squad-filter-link"
                              title="筛选此小队运行"
                            >
                              筛
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {r.issueId ? (
                        <span className="runs-issue-cell">
                          <Link
                            href={`/issues/${r.issueId}`}
                            data-testid="runs-issue-link"
                          >
                            <code>{shortId(r.issueId)}</code>
                          </Link>
                          {(r.status === 'failed' || r.status === 'running' || r.status === 'queued') ? (
                            <Link
                              href={`/issues/${r.issueId}#run-trace`}
                              className="runs-inline-filter"
                              data-testid="runs-issue-trace-link"
                              title="Issue 轨迹"
                            >
                              轨迹
                            </Link>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="runs-fail-cell">
                      {cls ? (
                        <>
                          <strong>{cls.title}</strong>
                          <div className="text-dim text-sm" title={r.error ?? ''}>
                            {cls.hint}
                          </div>
                          <div className="runs-fail-links">
                            {cls.settingsHref ? (
                              <Link
                                href={cls.settingsHref}
                                className="text-sm"
                                data-testid="runs-fail-diag"
                              >
                                打开诊断
                              </Link>
                            ) : (
                              <Link href="/settings" className="text-sm" data-testid="runs-fail-diag">
                                打开诊断
                              </Link>
                            )}
                            <Link
                              href="/?failed=1"
                              className="text-sm"
                              data-testid="runs-fail-board"
                            >
                              看板仅失败
                            </Link>
                            <Link
                              href="/inbox?kind=run_failed&read=unread"
                              className="text-sm"
                              data-testid="runs-fail-inbox"
                            >
                              Inbox
                            </Link>
                          </div>
                        </>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="text-dim text-sm">{relativeTime(r.createdAt)}</td>
                    <td>
                      <RunActions run={r} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
