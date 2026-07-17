'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
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

function buildEnvSnippet(checks: SettingsCheck[]): string {
  const lines = [
    '# multi-agent local env (copy into shell / .env before starting server)',
    '# 路径请按本机仓库根目录改写',
  ];
  const cwd = checks.find((c) => c.id === 'cwd');
  if (!cwd || cwd.status !== 'ok') {
    lines.push('export MA_WORKSPACE_CWD="D:/code/multi-agent"');
  } else if (cwd.detail) {
    lines.push(`# MA_WORKSPACE_CWD already ok: ${cwd.detail}`);
    lines.push(`export MA_WORKSPACE_CWD="${cwd.detail}"`);
  }
  const wiki = checks.find((c) => c.id === 'wiki_llm');
  if (!wiki || wiki.status !== 'ok') {
    lines.push('export WIKI_LLM_API_KEY=""  # optional for wiki ingest/query');
  }
  const emb = checks.find((c) => c.id === 'embedding');
  if (emb && emb.status !== 'ok') {
    lines.push('# export OPENAI_API_KEY=""  # optional; needed for pgvector embeddings');
  }
  lines.push('# export MEMORY_PROVIDER=sqlite-text');
  return `${lines.join('\n')}\n`;
}

export function SettingsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useSettingsStatus();
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  const sortedChecks = useMemo(
    () => (data ? sortChecks(data.checks) : []),
    [data],
  );

  const envSnippet = useMemo(
    () => (data ? buildEnvSnippet(data.checks) : ''),
    [data],
  );

  async function copyEnv() {
    try {
      await navigator.clipboard.writeText(envSnippet);
      setCopyState('ok');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('err');
      window.setTimeout(() => setCopyState('idle'), 2500);
    }
  }

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
  const cwdBlocked = data.checks.some((c) => c.id === 'cwd' && c.status === 'error');

  return (
    <div className="page-container settings-page" data-testid="settings-page">
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

      <section
        className={`settings-env-snippet${cwdBlocked ? ' settings-env-snippet--warn' : ''}`}
        data-testid="settings-env-snippet"
      >
        <div className="settings-env-snippet-head">
          <div>
            <strong>一键复制 env 片段</strong>
            <p className="settings-env-snippet-desc">
              启动 server 前在 shell 导出（或写入 .env）。本页仍不写密钥/磁盘。
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            data-testid="settings-copy-env"
            onClick={() => void copyEnv()}
          >
            {copyState === 'ok' ? '已复制' : copyState === 'err' ? '复制失败' : '复制片段'}
          </button>
        </div>
        <pre className="settings-env-pre" data-testid="settings-env-pre">
          {envSnippet}
        </pre>
      </section>

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
