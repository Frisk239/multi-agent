'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { SettingsCheck, SettingsOverall } from '@ma/shared';
import { useSettingsStatus } from '@/lib/api';
import { EmptyState } from './EmptyState';

const STATUS_RANK: Record<SettingsCheck['status'], number> = {
  error: 0,
  warn: 1,
  ok: 2,
};

const OVERALL_LABEL: Record<SettingsOverall, string> = {
  ok: '正常',
  degraded: '降级',
  blocked: '阻塞',
};

function sortChecks(checks: SettingsCheck[]): SettingsCheck[] {
  // 稳定排序：error → warn → ok，同 status 保留原序
  return checks
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const d = STATUS_RANK[a.c.status] - STATUS_RANK[b.c.status];
      return d !== 0 ? d : a.i - b.i;
    })
    .map(({ c }) => c);
}

export function SettingsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useSettingsStatus();

  const sortedChecks = useMemo(
    () => (data ? sortChecks(data.checks) : []),
    [data],
  );

  if (isLoading) {
    return (
      <div className="page-container">
        <EmptyState title="加载环境诊断…" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="page-container">
        <EmptyState
          title="无法加载环境诊断"
          description={
            error instanceof Error ? error.message : '请确认 API 服务已启动'
          }
          action={
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => void refetch()}
            >
              重试
            </button>
          }
        />
      </div>
    );
  }

  const { overall, summary } = data;

  return (
    <div className="page-container settings-page">
      <div className="page-header">
        <div>
          <div className="page-title">
            环境诊断
            <span
              className={`settings-overall settings-overall--${overall}`}
              title={overall}
            >
              {OVERALL_LABEL[overall]}
            </span>
          </div>
          <div className="page-desc">
            {summary.errors} 项错误 · {summary.warnings} 项警告
          </div>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? '刷新中…' : '刷新'}
          </button>
        </div>
      </div>

      <ul className="settings-check-list" aria-label="诊断项">
        {sortedChecks.map((check) => (
          <li
            key={check.id}
            className={`settings-check settings-check--${check.status}`}
          >
            <span
              className={`settings-check-dot settings-check-dot--${check.status}`}
              aria-hidden="true"
            />
            <div className="settings-check-body">
              <div className="settings-check-row">
                <span className="settings-check-label">{check.label}</span>
                {check.href ? (
                  <Link href={check.href} className="settings-check-link">
                    前往
                  </Link>
                ) : null}
              </div>
              {check.detail ? (
                <div className="settings-check-detail">{check.detail}</div>
              ) : null}
              {check.hint ? (
                <div className="settings-check-hint">{check.hint}</div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <p className="settings-footer text-dim text-sm">
        本页只读。请在启动 server 的环境中配置变量（如{' '}
        <code>MA_WORKSPACE_CWD</code>、<code>WIKI_LLM_API_KEY</code>
        ）。不在此写入密钥或 env。
      </p>
    </div>
  );
}
