'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { classifyRunFailure, type AgentRun } from '@ma/shared';
import { useAgents, useRetryRun, useWorkspaceRuns } from '@/lib/api';
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
  const { data: runs, isLoading, isError, error, refetch, isFetching } = useWorkspaceRuns({
    status: status || undefined,
    agentId: agentId || undefined,
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

      {isLoading ? (
        <p className="text-dim">加载中…</p>
      ) : isError ? (
        <EmptyState
          title="加载运行失败"
          description={error instanceof Error ? error.message : '未知错误'}
        />
      ) : !visibleRuns || visibleRuns.length === 0 ? (
        <EmptyState
          title="没有匹配的运行"
          description="换筛选条件，或先指派/快速派活产生 run。"
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
                        <code className={`run-pill run-pill--${r.status}`}>{r.status}</code>
                        {r.isLeader ? (
                          <span className="leader-badge runs-leader-badge" title="小队 leader run">
                            队长
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <Link href={`/agents/${r.agentId}`}>
                        {agentName.get(r.agentId) ?? shortId(r.agentId)}
                      </Link>
                    </td>
                    <td>
                      <div className="runs-kind-cell">
                        <code>{r.kind}</code>
                        {r.squadId ? (
                          <Link
                            href={`/squads/${r.squadId}`}
                            className="runs-squad-link"
                            title="打开小队"
                          >
                            小队
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {r.issueId ? (
                        <Link href={`/issues/${r.issueId}`}>
                          <code>{shortId(r.issueId)}</code>
                        </Link>
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
                          {cls.settingsHref ? (
                            <Link href={cls.settingsHref} className="text-sm">
                              打开诊断
                            </Link>
                          ) : null}
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
