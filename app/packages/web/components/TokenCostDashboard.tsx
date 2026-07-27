'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTokenUsageAnalytics } from '@/lib/api';
import type { TokenUsageGroupItem } from '@ma/shared';
import { ErrorState } from './ErrorState';
import { Icon } from './Icon';
import { PageSkeleton } from './Skeleton';

const DAY_OPTIONS = [7, 30, 90] as const;
type GroupByOption = 'agent' | 'project' | 'day' | 'issue';

function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/** Slice 28：null = uncosted，禁止显示假 $0.00 */
function formatUsd(num: number | null | undefined): string {
  if (num == null || !Number.isFinite(num)) return 'uncosted';
  if (num === 0) return '$0.00';
  if (num < 0.0001) return `$${num.toFixed(6)}`;
  if (num < 0.01) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(4)}`;
}

export function TokenCostDashboard({
  defaultDays = 30,
  defaultGroupBy = 'agent',
}: {
  defaultDays?: number;
  defaultGroupBy?: GroupByOption;
}) {
  const [days, setDays] = useState<number>(defaultDays);
  const [groupBy, setGroupBy] = useState<GroupByOption>(defaultGroupBy);

  const { data, isLoading, isError, error, refetch, isFetching } = useTokenUsageAnalytics(
    days,
    groupBy,
  );

  const topAgent = useMemo(() => {
    if (!data?.byAgent || data.byAgent.length === 0) return null;
    return data.byAgent[0];
  }, [data?.byAgent]);

  if (isLoading) {
    return (
      <div className="page-container" data-testid="token-cost-loading">
        <PageSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-container" data-testid="token-cost-error">
        <ErrorState
          title="无法加载 Token 成本数据"
          description={error instanceof Error ? error.message : '请确认 API 已启动'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const { totals, rates, ratesConfigured, items, byAgent } = data;
  const uncostedRuns = totals.uncostedRuns ?? 0;
  const costedRuns = totals.costedRuns ?? 0;

  const ratesHint = !ratesConfigured
    ? '未配置模型价表（MA_MODEL_RATES_JSON / MA_MODEL_RATES_PATH）· 全部 uncosted'
    : rates?.promptUsdPer1M != null && rates?.completionUsdPer1M != null
      ? `费率：Prompt $${rates.promptUsdPer1M}/1M · Completion $${rates.completionUsdPer1M}/1M` +
        (rates.modelCount != null ? ` · ${rates.modelCount} 个模型` : '')
      : `已配置 ${rates?.modelCount ?? '多'} 个模型费率（按 run.model 分别计价）`;

  return (
    <div className="token-cost-dashboard" data-testid="token-cost-dashboard">
      {/* 头部与筛选栏 */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="token-dashboard-title">
            <Icon name="usage" size={20} className="text-indigo-400" />
            Token 消耗与推估成本
          </h2>
          <p className="text-xs text-dim mt-1" data-testid="token-rates-hint">
            {ratesHint}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 天数选择 */}
          <div className="usage-day-chips" data-testid="token-days-selector">
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`memory-kind-chip${days === d ? ' is-active' : ''}`}
                data-testid={`token-days-${d}`}
                onClick={() => setDays(d)}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* 聚合维度选择 */}
          <div className="usage-day-chips" data-testid="token-groupby-selector">
            <button
              type="button"
              className={`memory-kind-chip${groupBy === 'agent' ? ' is-active' : ''}`}
              data-testid="token-groupby-agent"
              onClick={() => setGroupBy('agent')}
            >
              按 Agent
            </button>
            <button
              type="button"
              className={`memory-kind-chip${groupBy === 'project' ? ' is-active' : ''}`}
              data-testid="token-groupby-project"
              onClick={() => setGroupBy('project')}
            >
              按项目
            </button>
            <button
              type="button"
              className={`memory-kind-chip${groupBy === 'issue' ? ' is-active' : ''}`}
              data-testid="token-groupby-issue"
              onClick={() => setGroupBy('issue')}
            >
              按 Issue
            </button>
            <button
              type="button"
              className={`memory-kind-chip${groupBy === 'day' ? ' is-active' : ''}`}
              data-testid="token-groupby-day"
              onClick={() => setGroupBy('day')}
            >
              按日期
            </button>
          </div>

          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            data-testid="token-refresh-btn"
          >
            {isFetching ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>

      {/* KPI 卡片网格 */}
      <div className="usage-kpi-grid mb-6" data-testid="token-kpi-grid">
        <div className="agent-stat-card" data-testid="token-kpi-tokens">
          <div className="agent-stat-label">总 Token 消耗 · {days}天</div>
          <div className="agent-stat-value text-indigo-400">
            {formatNumber(totals.totalTokens)}
          </div>
          <div className="agent-stat-hint text-dim text-sm">
            Prompt {formatNumber(totals.promptTokens)} · Completion {formatNumber(totals.completionTokens)}
          </div>
        </div>

        <div className="agent-stat-card" data-testid="token-kpi-cost">
          <div className="agent-stat-label">总推估费用 (USD)</div>
          <div
            className={`agent-stat-value ${totals.totalCostUsd == null ? 'text-amber-400' : 'text-emerald-400'}`}
            data-testid="token-kpi-cost-value"
          >
            {formatUsd(totals.totalCostUsd)}
          </div>
          <div className="agent-stat-hint text-dim text-sm">
            {totals.totalCostUsd == null
              ? uncostedRuns > 0
                ? `${uncostedRuns} 次 uncosted（无价表或未知 model）`
                : '暂无计费数据'
              : `In ${formatUsd(totals.promptCostUsd)} · Out ${formatUsd(totals.completionCostUsd)}`}
          </div>
        </div>

        <div className="agent-stat-card" data-testid="token-kpi-top-agent">
          <div className="agent-stat-label">最消耗 Token Agent</div>
          <div className="agent-stat-value agent-stat-value--sm text-amber-400">
            {topAgent && topAgent.totalTokens > 0 ? topAgent.name : '暂无消耗'}
          </div>
          <div className="agent-stat-hint text-dim text-sm">
            {topAgent && topAgent.totalTokens > 0
              ? `${formatNumber(topAgent.totalTokens)} tokens (${formatUsd(topAgent.totalCostUsd)})`
              : '无记录'}
          </div>
        </div>

        <div className="agent-stat-card" data-testid="token-kpi-coverage">
          <div className="agent-stat-label">有 Token 记录的任务</div>
          <div className="agent-stat-value">
            {totals.runsWithTokens} / {totals.totalRuns}
          </div>
          <div className="agent-stat-hint text-dim text-sm" data-testid="token-uncosted-stat">
            计价 {costedRuns} · uncosted {uncostedRuns}
          </div>
        </div>
      </div>

      {/* 最消耗 Token Agent 排行榜 */}
      {byAgent && byAgent.length > 0 && (
        <section className="usage-section mb-6" data-testid="top-agent-leaderboard">
          <div className="agent-overview-section-head">
            <h3 className="agent-overview-title flex items-center gap-2">
              <Icon name="agent" size={16} />
              Agent Token 消耗榜单
            </h3>
            <span className="text-dim text-sm">前 5 消耗最高的智能体</span>
          </div>

          <div className="usage-day-bars">
            {byAgent.slice(0, 5).map((ag, idx) => {
              const pct = totals.totalTokens > 0 ? Math.round((ag.totalTokens / totals.totalTokens) * 100) : 0;
              return (
                <div
                  key={ag.id}
                  className="usage-day-row"
                  data-testid={`top-agent-item-${ag.id}`}
                  title={`${ag.name}: ${formatNumber(ag.totalTokens)} tokens (${formatUsd(ag.totalCostUsd)})`}
                >
                  <span className="usage-day-label flex items-center gap-1 font-medium">
                    <span className="text-dim text-xs">#{idx + 1}</span>
                    <Link href={`/agents/${ag.id}`} className="hover:underline">
                      {ag.name}
                    </Link>
                  </span>
                  <div className="usage-day-track">
                    <div
                      className="usage-day-fill bg-indigo-500"
                      style={{ width: `${Math.max(3, pct)}%` }}
                    />
                  </div>
                  <span className="usage-day-count">{formatNumber(ag.totalTokens)}</span>
                  <span
                    className={`usage-day-fail font-mono text-xs ${ag.totalCostUsd == null ? 'text-amber-400' : 'text-emerald-400'}`}
                  >
                    {formatUsd(ag.totalCostUsd)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 按当前 selected groupBy 的分布与明细数据 */}
      <section className="usage-section" data-testid="token-distribution-section">
        <div className="agent-overview-section-head">
          <h3 className="agent-overview-title">
            {groupBy === 'agent'
              ? 'Agent 分布明细'
              : groupBy === 'project'
                ? '项目分布明细'
                : groupBy === 'issue'
                  ? 'Issue 分布明细'
                  : '按日期分布明细'}
          </h3>
          <span className="text-dim text-sm">{items.length} 个维度条目</span>
        </div>

        {items.length === 0 ? (
          <p className="text-dim text-sm">当前窗口内无 Token 记录</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table" data-testid="token-distribution-table">
              <thead>
                <tr>
                  <th>
                    {groupBy === 'agent'
                      ? 'Agent'
                      : groupBy === 'project'
                        ? '项目'
                        : groupBy === 'issue'
                          ? 'Issue'
                          : '日期'}
                  </th>
                  <th>运行次数</th>
                  <th>Prompt Token</th>
                  <th>Completion Token</th>
                  <th>Total Token</th>
                  <th>推估费用 (USD)</th>
                  <th>占比</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row: TokenUsageGroupItem) => {
                  const denom = totals.totalCostUsd ?? 0;
                  const pct =
                    denom > 0 && row.totalCostUsd != null
                      ? (row.totalCostUsd / denom) * 100
                      : totals.totalTokens > 0
                        ? (row.totalTokens / totals.totalTokens) * 100
                        : 0;
                  return (
                    <tr key={row.id} data-item-id={row.id} data-testid={`token-row-${row.id}`}>
                      <td className="font-medium">
                        {groupBy === 'agent' ? (
                          <Link href={`/agents/${row.id}`} className="table-link">
                            {row.name}
                          </Link>
                        ) : groupBy === 'project' && row.id !== 'unassigned' ? (
                          <Link href={`/projects/${row.id}`} className="table-link">
                            {row.name}
                          </Link>
                        ) : groupBy === 'issue' && row.id !== 'no-issue' ? (
                          <Link href={`/issues/${row.id}`} className="table-link">
                            {row.name}
                          </Link>
                        ) : (
                          row.name
                        )}
                      </td>
                      <td className="text-sm">{row.runCount}</td>
                      <td className="text-dim text-sm">{formatNumber(row.promptTokens)}</td>
                      <td className="text-dim text-sm">{formatNumber(row.completionTokens)}</td>
                      <td className="text-sm font-semibold">{formatNumber(row.totalTokens)}</td>
                      <td
                        className={`font-mono text-sm font-semibold ${row.totalCostUsd == null ? 'text-amber-400' : 'text-emerald-400'}`}
                      >
                        {formatUsd(row.totalCostUsd)}
                        {(row.uncostedRuns ?? 0) > 0 ? (
                          <span className="text-dim text-xs ml-1">({row.uncostedRuns} uncosted)</span>
                        ) : null}
                      </td>
                      <td className="text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-700 h-2 rounded overflow-hidden">
                            <div
                              className="bg-indigo-500 h-full"
                              style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                            />
                          </div>
                          <span className="text-dim text-xs">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
