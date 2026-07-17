'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { classifyRunFailure, type AgentRun } from '@ma/shared';
import { useAgents, useRetryRun, useWorkspaceRuns } from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

type StatusFilter = '' | 'queued' | 'running' | 'failed' | 'cancelled' | 'completed';

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

export function RunsPage() {
  const [status, setStatus] = useState<StatusFilter>('failed');
  const [agentId, setAgentId] = useState('');
  const { data: agents = [] } = useAgents();
  const { data: runs, isLoading, isError, error, refetch, isFetching } = useWorkspaceRuns({
    status: status || undefined,
    agentId: agentId || undefined,
    limit: 80,
  });

  const agentName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.name);
    return m;
  }, [agents]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <Icon name="usage" size={18} /> 运行{' '}
            <span className="count">{runs?.length ?? 0}</span>
          </div>
          <div className="page-desc">
            工作区 active / 失败浏览；人工再执行（新 run 行）。学 Multica Rerun，本仓加 /runs 壳。
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={() => refetch()} disabled={isFetching}>
          刷新
        </button>
      </div>

      <div className="runs-filters">
        <label>
          状态
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            aria-label="筛选状态"
          >
            <option value="">全部</option>
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
            onChange={(e) => setAgentId(e.target.value)}
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
      </div>

      {isLoading ? (
        <p className="text-dim">加载中…</p>
      ) : isError ? (
        <EmptyState
          title="加载运行失败"
          description={error instanceof Error ? error.message : '未知错误'}
        />
      ) : !runs || runs.length === 0 ? (
        <EmptyState
          title="没有匹配的运行"
          description="换筛选条件，或先指派/快速派活产生 run。"
        />
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
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
              {runs.map((r) => {
                const cls =
                  r.status === 'failed' || r.error
                    ? classifyRunFailure(r.error)
                    : null;
                return (
                  <tr key={r.id} data-run-status={r.status}>
                    <td>
                      <code className={`run-pill run-pill--${r.status}`}>{r.status}</code>
                    </td>
                    <td>
                      <Link href={`/agents/${r.agentId}`}>
                        {agentName.get(r.agentId) ?? shortId(r.agentId)}
                      </Link>
                    </td>
                    <td>
                      <code>{r.kind}</code>
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
