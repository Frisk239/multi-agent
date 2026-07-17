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
  const [cwdCopyState, setCwdCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [wikiCopyState, setWikiCopyState] = useState<'idle' | 'ok' | 'err'>('idle');

  const sortedChecks = useMemo(
    () => (data ? sortChecks(data.checks) : []),
    [data],
  );

  const envSnippet = useMemo(
    () => (data ? buildEnvSnippet(data.checks) : ''),
    [data],
  );

  const cwdExportLine = 'export MA_WORKSPACE_CWD="D:/code/multi-agent"';
  const wikiExportLine = 'export WIKI_LLM_API_KEY=""  # required for wiki ingest/query/lint';

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

  async function copyCwdLine() {
    try {
      await navigator.clipboard.writeText(cwdExportLine);
      setCwdCopyState('ok');
      window.setTimeout(() => setCwdCopyState('idle'), 2000);
    } catch {
      setCwdCopyState('err');
      window.setTimeout(() => setCwdCopyState('idle'), 2500);
    }
  }

  async function copyWikiLine() {
    try {
      await navigator.clipboard.writeText(wikiExportLine);
      setWikiCopyState('ok');
      window.setTimeout(() => setWikiCopyState('idle'), 2000);
    } catch {
      setWikiCopyState('err');
      window.setTimeout(() => setWikiCopyState('idle'), 2500);
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
  const wikiLlmBlocked = data.checks.some((c) => c.id === 'wiki_llm' && c.status === 'error');
  const runtimeBlocked = data.checks.filter((c) => c.id.startsWith('runtime:') && c.status === 'error');

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

      {cwdBlocked ? (
        <section
          className="settings-cwd-guide"
          data-testid="settings-cwd-guide"
          aria-label="工作区配置引导"
        >
          <div className="settings-cwd-guide-title">
            <strong>先修好工作区（最高优先级）</strong>
            <span className="settings-cwd-guide-badge">阻塞派活</span>
          </div>
          <ol className="settings-cwd-steps">
            <li>
              把仓库根目录导出为 <code>MA_WORKSPACE_CWD</code>（Git Bash / zsh）
            </li>
            <li>
              在同一终端重启 <code>pnpm dev</code>（只改页面不够，server 进程要吃到 env）
            </li>
            <li>回到本页点「刷新」，cwd 应为 ok；再去快速派活 / 指派</li>
          </ol>
          <div className="settings-cwd-guide-actions">
            <code className="settings-cwd-line" data-testid="settings-cwd-line">
              {cwdExportLine}
            </code>
            <button
              type="button"
              className="btn-primary btn-sm"
              data-testid="settings-copy-cwd"
              onClick={() => void copyCwdLine()}
            >
              {cwdCopyState === 'ok'
                ? '已复制 cwd 行'
                : cwdCopyState === 'err'
                  ? '复制失败'
                  : '复制 cwd 行'}
            </button>
          </div>
          <p className="settings-cwd-guide-note text-dim text-sm">
            Windows 也可：PowerShell{' '}
            <code>$env:MA_WORKSPACE_CWD=&quot;D:\code\multi-agent&quot;</code>
            。路径按本机仓库改写。
          </p>
        </section>
      ) : null}

      {wikiLlmBlocked ? (
        <section
          className="settings-wiki-guide"
          data-testid="settings-wiki-llm-guide"
          aria-label="Wiki LLM 配置引导"
        >
          <div className="settings-cwd-guide-title">
            <strong>Wiki 编译需要 LLM 密钥</strong>
            <span className="settings-wiki-guide-badge">阻塞编译</span>
          </div>
          <ol className="settings-cwd-steps">
            <li>
              导出 <code>WIKI_LLM_API_KEY</code>（以及如需要的 base URL / model 变量）
            </li>
            <li>同一终端重启 server 后再回本页刷新</li>
            <li>
              到 <a href="/wiki?jobStatus=dead">Wiki dead 任务</a> 点「重试」恢复编译
            </li>
          </ol>
          <div className="settings-cwd-guide-actions">
            <code className="settings-cwd-line" data-testid="settings-wiki-llm-line">
              {wikiExportLine}
            </code>
            <button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="settings-copy-wiki-llm"
              onClick={() => void copyWikiLine()}
            >
              {wikiCopyState === 'ok'
                ? '已复制 wiki 行'
                : wikiCopyState === 'err'
                  ? '复制失败'
                  : '复制 wiki 行'}
            </button>
            <a className="btn-ghost btn-sm" href="/wiki?jobStatus=dead" data-testid="settings-wiki-dead-link">
              查看 dead 任务
            </a>
          </div>
        </section>
      ) : null}

      {runtimeBlocked.length > 0 ? (
        <section
          className="settings-runtime-guide"
          data-testid="settings-runtime-guide"
          aria-label="运行时缺失引导"
        >
          <div className="settings-cwd-guide-title">
            <strong>有运行时 CLI 不可用</strong>
            <span className="settings-runtime-guide-badge">阻塞执行</span>
          </div>
          <p className="text-sm" style={{ marginTop: 0 }}>
            {runtimeBlocked.map((c) => c.label).join('、')} 探测失败。安装/修复 PATH 后重启 server，再到运行时页确认。
          </p>
          <ul className="settings-cwd-steps" style={{ listStyle: 'disc' }}>
            {runtimeBlocked.map((c) => (
              <li key={c.id}>
                <strong>{c.label}</strong>
                {c.detail ? ` · ${c.detail}` : ''}
                {c.hint ? ` — ${c.hint}` : ''}
              </li>
            ))}
          </ul>
          <div className="settings-cwd-guide-actions">
            <a className="btn-primary btn-sm" href="/runtimes" data-testid="settings-open-runtimes">
              打开运行时探测
            </a>
            <a className="btn-ghost btn-sm" href="/agents" data-testid="settings-open-agents">
              查看智能体
            </a>
          </div>
        </section>
      ) : null}

      <section
        className={`settings-env-snippet${cwdBlocked || wikiLlmBlocked || runtimeBlocked.length > 0 ? ' settings-env-snippet--warn' : ''}`}
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
