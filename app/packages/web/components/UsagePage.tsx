'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useWorkspaceUsage } from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { PageHeaderMore } from './PageHeaderMore';

const DAY_OPTIONS = [7, 30, 90] as const;

function parseDays(raw: string | null): number {
  const n = Number(raw);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const m2 = min % 60;
  return m2 ? `${hr}h ${m2}m` : `${hr}h`;
}

function rateLabel(rate: number | null | undefined): string {
  if (rate == null) return '—';
  return `${Math.round(rate * 1000) / 10}%`;
}

function UsagePageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const days = parseDays(searchParams.get('days'));
  const { data, isLoading, isError, error, refetch, isFetching } = useWorkspaceUsage(days);

  const maxDayTotal = useMemo(() => {
    if (!data?.byDay?.length) return 1;
    return Math.max(1, ...data.byDay.map((d) => d.total));
  }, [data?.byDay]);

  function setDays(next: number) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === 30) sp.delete('days');
    else sp.set('days', String(next));
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <EmptyState title="加载用量…" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-container">
        <EmptyState
          title="无法加载用量"
          description={error instanceof Error ? error.message : '请确认 API 已启动'}
          action={
            <button type="button" className="btn-ghost btn-sm" onClick={() => void refetch()}>
              重试
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-container collection-page usage-page" data-testid="usage-page">
      <div className="page-header">
        <div>
          <Icon name="usage" size={16} className="page-header-icon" />
          <h1 className="page-title">
            用量
            <span className="count">{data.total}</span>
          </h1>
          <p className="page-desc">
            查看当前工作区的智能体运行情况（本地暂无 Token/费用账单）
          </p>
        </div>
        <div className="page-actions">
          <div className="usage-day-chips" data-testid="usage-day-chips">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`memory-kind-chip${days === d ? ' is-active' : ''}`}
                data-testid={`usage-days-${d}`}
                onClick={() => setDays(d)}
              >
                {d}d
              </button>
            ))}
          </div>
          <PageHeaderMore testId="usage-header-more">
            <Link href="/runs" data-testid="usage-to-runs" role="menuitem">
              运行列表
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? '刷新中…' : '刷新'}
            </button>
          </PageHeaderMore>
        </div>
      </div>

      <div className="page-body">
        <div className="usage-kpi-grid" data-testid="usage-kpi">
          <div className="agent-stat-card">
            <div className="agent-stat-label">任务数 · {days}天</div>
            <div className="agent-stat-value" data-testid="usage-kpi-total">
              {data.total}
            </div>
            <div className="agent-stat-hint text-dim text-sm">
              失败 {data.failed}
              {data.active > 0 ? ` · 在途 ${data.active}` : ''}
            </div>
          </div>
          <div className="agent-stat-card">
            <div className="agent-stat-label">成功率</div>
            <div className="agent-stat-value" data-testid="usage-kpi-rate">
              {rateLabel(data.successRate)}
            </div>
            <div className="agent-stat-hint text-dim text-sm">
              completed {data.completed} · failed {data.failed}
            </div>
          </div>
          <div className="agent-stat-card">
            <div className="agent-stat-label">运行时长 · {days}天</div>
            <div className="agent-stat-value" data-testid="usage-kpi-duration">
              {formatDurationMs(data.totalDurationMs)}
            </div>
            <div className="agent-stat-hint text-dim text-sm">
              均耗 {formatDurationMs(data.avgDurationMs)}
            </div>
          </div>
          <div className="agent-stat-card">
            <div className="agent-stat-label">Token / 费用</div>
            <div className="agent-stat-value agent-stat-value--sm" data-testid="usage-kpi-tokens">
              本地不可用
            </div>
            <div className="agent-stat-hint text-dim text-sm">
              CLI 路径无 token 账单（对标 Multica 云端 KPI 的空位）
            </div>
          </div>
        </div>

        <section className="usage-section" data-testid="usage-by-day">
          <div className="agent-overview-section-head">
            <h2 className="agent-overview-title">每日任务数</h2>
            <span className="text-dim text-sm">按创建日 · 本地时区</span>
          </div>
          {data.byDay.length === 0 ? (
            <p className="text-dim text-sm">窗口内无 run</p>
          ) : (
            <div className="usage-day-bars">
              {data.byDay.map((d) => (
                <div key={d.day} className="usage-day-row" title={`${d.day}: ${d.total}`}>
                  <span className="usage-day-label">{d.day.slice(5)}</span>
                  <div className="usage-day-track">
                    <div
                      className="usage-day-fill"
                      style={{ width: `${Math.max(4, (d.total / maxDayTotal) * 100)}%` }}
                    />
                  </div>
                  <span className="usage-day-count">{d.total}</span>
                  {d.failed > 0 ? (
                    <span className="usage-day-fail text-dim">{d.failed}f</span>
                  ) : (
                    <span className="usage-day-fail" />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="usage-section" data-testid="usage-leaderboard">
          <div className="agent-overview-section-head">
            <h2 className="agent-overview-title">智能体排行</h2>
            <span className="text-dim text-sm">{data.byAgent.length} 个有活动</span>
          </div>
          {data.byAgent.length === 0 ? (
            <p className="text-dim text-sm">窗口内无 agent 活动</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table" data-testid="usage-agent-table">
                <thead>
                  <tr>
                    <th>智能体</th>
                    <th>任务</th>
                    <th>成功/失败</th>
                    <th>成功率</th>
                    <th>时长</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.byAgent.map((row) => (
                    <tr key={row.agentId} data-agent-id={row.agentId}>
                      <td>
                        <Link
                          href={`/agents/${row.agentId}`}
                          className="table-link"
                          data-testid="usage-agent-link"
                        >
                          {row.agentName}
                        </Link>
                      </td>
                      <td className="text-sm">{row.total}</td>
                      <td className="text-dim text-sm">
                        {row.completed}/{row.failed}
                      </td>
                      <td className="text-sm">{rateLabel(row.successRate)}</td>
                      <td className="text-dim text-sm">
                        {formatDurationMs(row.totalDurationMs)}
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/runs?agent=${encodeURIComponent(row.agentId)}`}
                          className="btn-ghost btn-sm"
                        >
                          运行
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function UsagePage() {
  return (
    <Suspense fallback={<div className="page-container">加载中…</div>}>
      <UsagePageInner />
    </Suspense>
  );
}
