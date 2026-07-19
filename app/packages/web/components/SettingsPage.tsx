'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { SettingsCheck, SettingsOverall } from '@ma/shared';
import {
  useRecoverStuckRuns,
  useRetryAllDeadWikiJobs,
  useSetWorkspaceCwd,
  useSettingsStatus,
  useUpdateUserProfile,
  useUserProfile,
} from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';

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

function formatAgeMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export function SettingsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useSettingsStatus();
  const { data: profile } = useUserProfile();
  const updateProfile = useUpdateUserProfile();
  const recoverStuck = useRecoverStuckRuns();
  const retryAllDeadWiki = useRetryAllDeadWikiJobs();
  const setCwd = useSetWorkspaceCwd();
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [cwdCopyState, setCwdCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [profileName, setProfileName] = useState('');
  const [profileAbout, setProfileAbout] = useState('');
  const [profileReady, setProfileReady] = useState(false);
  const [wikiCopyState, setWikiCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [cwdDraft, setCwdDraft] = useState('');
  const [cwdDraftReady, setCwdDraftReady] = useState(false);

  const sortedChecks = useMemo(
    () => (data ? sortChecks(data.checks) : []),
    [data],
  );

  const envSnippet = useMemo(
    () => (data ? buildEnvSnippet(data.checks) : ''),
    [data],
  );

  useEffect(() => {
    if (cwdDraftReady || !data) return;
    setCwdDraft(data.cwd?.persistedPath ?? data.cwd?.path ?? 'D:/code/multi-agent');
    setCwdDraftReady(true);
  }, [data, cwdDraftReady]);

  useEffect(() => {
    if (!profile || profileReady) return;
    setProfileName(profile.name);
    setProfileAbout(profile.about ?? '');
    setProfileReady(true);
  }, [profile, profileReady]);

  useEffect(() => {
    if (!profile || !profileReady) return;
    // 外部刷新后同步（非编辑冲突优先服务端）
    setProfileName(profile.name);
    setProfileAbout(profile.about ?? '');
  }, [profile?.name, profile?.about]);

  const cwdExportLine = 'export MA_WORKSPACE_CWD="D:/code/multi-agent"';
  const wikiExportLine =
    'export WIKI_LLM_API_KEY=""  # or put in app/packages/server/.env (gitignored)';

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
    <div className="page-container settings-page collection-page" data-testid="settings-page">
      <div className="page-header">
        <div>
          <Icon name="settings" size={16} className="page-header-icon" />
          <h1 className="page-title">
            环境诊断
            <span
              className={`settings-overall settings-overall--${overall}`}
              title={overall}
            >
              {OVERALL_LABEL[overall]}
            </span>
          </h1>
          <p className="page-desc">
            {summary.errors} 项错误 · {summary.warnings} 项警告
          </p>
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

      <div className="page-body settings-body">
      <section className="settings-section" data-testid="settings-profile-section">
        <div className="settings-section-head">
          <h2 className="settings-section-title">关于你</h2>
          <p className="settings-section-desc">
            偏好与自我介绍会注入 agent 执行 prompt（非密钥）
          </p>
        </div>
        <section
          className="settings-card settings-profile-card"
          data-testid="settings-profile-card"
          aria-label="用户资料"
        >
          <label className="settings-profile-field">
            <span>显示名</span>
            <input
              type="text"
              className="input"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              data-testid="settings-profile-name"
              placeholder="林远"
            />
          </label>
          <label className="settings-profile-field">
            <span>关于你 / 偏好</span>
            <textarea
              className="settings-profile-about"
              value={profileAbout}
              onChange={(e) => setProfileAbout(e.target.value)}
              rows={5}
              data-testid="settings-profile-about"
              placeholder="例：偏好 TypeScript、简洁 PR、中文回复；本机路径 D:/code/…"
            />
          </label>
          <p className="text-dim text-sm" style={{ margin: '0 0 8px' }}>
            {profile?.updatedHint ??
              '保存后，Issue 派活与快速派活都会在 prompt 中带上此段说明。'}
          </p>
          <button
            type="button"
            className="btn-primary btn-sm"
            data-testid="settings-profile-save"
            disabled={
              updateProfile.isPending ||
              !profileName.trim() ||
              (profileName === (profile?.name ?? '') &&
                profileAbout === (profile?.about ?? ''))
            }
            onClick={() =>
              updateProfile.mutate({
                name: profileName.trim(),
                about: profileAbout,
              })
            }
          >
            {updateProfile.isPending ? '保存中…' : '保存资料'}
          </button>
        </section>
      </section>

      <section className="settings-section" data-testid="settings-workspace-section">
        <div className="settings-section-head">
          <h2 className="settings-section-title">工作区</h2>
          <p className="settings-section-desc">路径持久化与派活前置条件</p>
        </div>
      <section
        className="settings-card settings-cwd-guide"
        data-testid="settings-cwd-persist"
        aria-label="工作区路径持久化"
      >
        <div className="settings-cwd-guide-title">
          <strong>工作区路径</strong>
          <span className="text-dim text-sm">
            {data.cwd
              ? `生效: ${data.cwd.path ?? '—'} · 来源 ${data.cwd.source}${data.cwd.exists ? '' : ' · 路径无效'}`
              : '未加载'}
          </span>
          {cwdBlocked ? <span className="settings-cwd-guide-badge">阻塞派活</span> : null}
        </div>
        <p className="text-dim text-sm" style={{ marginBottom: 8 }}>
          保存到本地 DB（非密钥）。优先级：环境变量覆盖 DB。保存后立即生效，无需 shell export。
        </p>
        <div className="settings-cwd-guide-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            type="text"
            className="input"
            style={{ minWidth: 280, flex: 1 }}
            value={cwdDraft}
            onChange={(e) => setCwdDraft(e.target.value)}
            placeholder="D:/code/multi-agent"
            data-testid="settings-cwd-input"
            aria-label="工作区绝对路径"
          />
          <button
            type="button"
            className="btn-primary btn-sm"
            data-testid="settings-cwd-save"
            disabled={setCwd.isPending || !cwdDraft.trim()}
            onClick={() => setCwd.mutate(cwdDraft.trim())}
          >
            {setCwd.isPending ? '保存中…' : '保存路径'}
          </button>
        </div>
      </section>

      {cwdBlocked ? (
        <section
          className="settings-card settings-cwd-guide"
          data-testid="settings-cwd-guide"
          aria-label="工作区配置引导"
        >
          <div className="settings-cwd-guide-title">
            <strong>先修好工作区（最高优先级）</strong>
            <span className="settings-cwd-guide-badge">阻塞派活</span>
          </div>
          <ol className="settings-cwd-steps">
            <li>
              优先用上方「保存路径」写入本地 DB（推荐）；或导出 <code>MA_WORKSPACE_CWD</code>
            </li>
            <li>
              若用 env：在同一终端重启 <code>pnpm dev</code>（server 进程要吃到 env）
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
          <div className="settings-cwd-recovery-links" data-testid="settings-cwd-recovery">
            <span className="text-dim text-sm">修好后：</span>
            <Link
              className="btn-secondary btn-sm"
              href="/runs?status=failed"
              data-testid="settings-cwd-to-failed-runs"
            >
              失败运行 · 再执行
            </Link>
            <Link
              className="btn-secondary btn-sm"
              href="/inbox?kind=run_failed&read=unread"
              data-testid="settings-cwd-to-inbox-fails"
            >
              Inbox 失败
            </Link>
            <Link
              className="btn-ghost btn-sm"
              href="/?failed=1"
              data-testid="settings-cwd-to-failed-board"
            >
              看板仅失败
            </Link>
            <Link
              className="btn-ghost btn-sm"
              href="/agents?ready=cwd_missing"
              data-testid="settings-cwd-to-agents"
            >
              智能体 cwd
            </Link>
          </div>
          <p className="settings-cwd-guide-note text-dim text-sm">
            Windows 也可：PowerShell{' '}
            <code>$env:MA_WORKSPACE_CWD=&quot;D:\code\multi-agent&quot;</code>
            。路径按本机仓库改写。
          </p>
        </section>
      ) : null}
      </section>

      {wikiLlmBlocked || runtimeBlocked.length > 0 ? (
        <section className="settings-section" data-testid="settings-guides-section">
          <div className="settings-section-head">
            <h2 className="settings-section-title">阻塞修复</h2>
            <p className="settings-section-desc">按优先级先清阻塞再派活</p>
          </div>

          {wikiLlmBlocked ? (
            <section
              className="settings-card settings-wiki-guide"
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
              </div>
              <div className="settings-cwd-recovery-links" data-testid="settings-wiki-recovery">
                <span className="text-dim text-sm">修好后：</span>
                <Link
                  className="btn-secondary btn-sm"
                  href="/wiki?jobStatus=dead"
                  data-testid="settings-wiki-dead-link"
                >
                  dead 任务 · 重试
                </Link>
                <Link className="btn-ghost btn-sm" href="/wiki" data-testid="settings-wiki-home">
                  Wiki 首页
                </Link>
                <Link
                  className="btn-ghost btn-sm"
                  href="/wiki?jobStatus=pending"
                  data-testid="settings-wiki-pending"
                >
                  pending 队列
                </Link>
              </div>
            </section>
          ) : null}

          {runtimeBlocked.length > 0 ? (
            <section
              className="settings-card settings-runtime-guide"
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
                <Link className="btn-primary btn-sm" href="/runtimes" data-testid="settings-open-runtimes">
                  打开运行时探测
                </Link>
                <Link className="btn-ghost btn-sm" href="/agents" data-testid="settings-open-agents">
                  查看智能体
                </Link>
              </div>
              <div className="settings-cwd-recovery-links" data-testid="settings-runtime-recovery">
                <span className="text-dim text-sm">修好后：</span>
                <Link
                  className="btn-secondary btn-sm"
                  href="/agents?ready=runtime_missing"
                  data-testid="settings-runtime-to-agents"
                >
                  runtime 缺失智能体
                </Link>
                <Link
                  className="btn-ghost btn-sm"
                  href="/runs?status=failed"
                  data-testid="settings-runtime-to-failed-runs"
                >
                  失败运行
                </Link>
                <Link
                  className="btn-ghost btn-sm"
                  href="/inbox?kind=run_failed&read=unread"
                  data-testid="settings-runtime-to-inbox"
                >
                  Inbox 失败
                </Link>
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      <section className="settings-section" data-testid="settings-health-section">
        <div className="settings-section-head">
          <h2 className="settings-section-title">健康摘要</h2>
          <p className="settings-section-desc">记忆 · Wiki · 自动化 · 运行</p>
        </div>

      {/* 记忆层健康（settings-memory-health） */}
      {data.memoryHealth ? (
        <section
          className="settings-card settings-ops-recovery"
          data-testid="settings-memory-health"
          aria-label="记忆层健康"
        >
          <div className="settings-cwd-guide-title">
            <strong>记忆层</strong>
            <span className="text-dim text-sm">
              {data.memoryHealth.available ? '可用' : '不可用'}
              {' · '}
              {data.memoryHealth.provider ?? 'none'}
              {' · '}
              {data.memoryHealth.total} 条
            </span>
          </div>
          <ul
            className="settings-cwd-steps"
            style={{ listStyle: 'disc' }}
            data-testid="settings-memory-health-stats"
          >
            <li>
              provider <strong>{data.memoryHealth.provider ?? '—'}</strong> · backend{' '}
              <code>{data.memoryHealth.backend}</code>
            </li>
            <li>
              条目 <strong>{data.memoryHealth.total}</strong> · curated{' '}
              <strong>{data.memoryHealth.curated}</strong> · ambient{' '}
              <strong>{data.memoryHealth.ambient}</strong>
            </li>
            <li>
              最近写入：{' '}
              <strong>
                {data.memoryHealth.latestAt
                  ? new Date(data.memoryHealth.latestAt).toLocaleString()
                  : '—'}
              </strong>
            </li>
          </ul>
          <div className="settings-cwd-recovery-links" data-testid="settings-memory-health-actions">
            <Link className="btn-secondary btn-sm" href="/memory" data-testid="settings-memory-to-list">
              打开记忆
            </Link>
            <Link
              className="btn-ghost btn-sm"
              href="/memory?kind=ambient"
              data-testid="settings-memory-to-ambient"
            >
              ambient
            </Link>
          </div>
        </section>
      ) : null}

      {/* Wiki / 自动化健康摘要（settings-wiki-auto-health） */}
      {data.wikiHealth || data.automationHealth ? (
        <section
          className="settings-card settings-ops-recovery"
          data-testid="settings-wiki-auto-health"
          aria-label="Wiki 与自动化健康"
        >
          <div className="settings-cwd-guide-title">
            <strong>Wiki 与自动化</strong>
            <span className="text-dim text-sm">
              {data.wikiHealth
                ? `dead ${data.wikiHealth.dead}`
                : 'Wiki —'}
              {' · '}
              {data.automationHealth
                ? `失败规则 ${data.automationHealth.failedRules}`
                : '自动化 —'}
            </span>
          </div>
          <ul className="settings-cwd-steps" style={{ listStyle: 'disc' }} data-testid="settings-wiki-auto-stats">
            {data.wikiHealth ? (
              <li>
                Wiki 队列：dead <strong>{data.wikiHealth.dead}</strong> · pending{' '}
                <strong>{data.wikiHealth.pending}</strong> · running{' '}
                <strong>{data.wikiHealth.running}</strong>
                {' · '}
                LLM {data.wikiHealth.llmConfigured ? '已配置' : '未配置'}
              </li>
            ) : null}
            {data.automationHealth ? (
              <li>
                自动化：共 <strong>{data.automationHealth.total}</strong> 条 · 启用{' '}
                <strong>{data.automationHealth.enabled}</strong> · 失败规则{' '}
                <strong>{data.automationHealth.failedRules}</strong>
                {data.automationHealth.lastFailedAt
                  ? ` · 最近失败 ${new Date(data.automationHealth.lastFailedAt).toLocaleString()}`
                  : ''}
              </li>
            ) : null}
          </ul>
          <div className="settings-cwd-recovery-links" data-testid="settings-wiki-auto-actions">
            {data.wikiHealth && data.wikiHealth.dead > 0 ? (
              <button
                type="button"
                className="btn-primary btn-sm"
                data-testid="settings-wiki-auto-retry-dead"
                disabled={retryAllDeadWiki.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      `重试全部 ${data.wikiHealth!.dead} 条 dead Wiki 编译任务？`,
                    )
                  ) {
                    return;
                  }
                  retryAllDeadWiki.mutate();
                }}
              >
                {retryAllDeadWiki.isPending
                  ? '重试中…'
                  : `全部重试 dead · ${data.wikiHealth.dead}`}
              </button>
            ) : null}
            <Link
              className="btn-secondary btn-sm"
              href="/wiki?jobStatus=dead"
              data-testid="settings-wiki-auto-to-dead"
            >
              Wiki dead
            </Link>
            <Link
              className="btn-secondary btn-sm"
              href="/automation?failed=1"
              data-testid="settings-wiki-auto-to-auto-failed"
            >
              自动化失败
            </Link>
            <Link className="btn-ghost btn-sm" href="/wiki" data-testid="settings-wiki-auto-to-wiki">
              Wiki 首页
            </Link>
            <Link
              className="btn-ghost btn-sm"
              href="/automation"
              data-testid="settings-wiki-auto-to-automation"
            >
              自动化
            </Link>
          </div>
        </section>
      ) : null}

      {/* 运行健康：在途 + 心跳/排队收尸阈值（settings-run-health） */}
      {data.runHealth ? (
        <section
          className="settings-card settings-ops-recovery"
          data-testid="settings-run-health"
          aria-label="运行健康"
        >
          <div className="settings-cwd-guide-title">
            <strong>运行健康</strong>
            <span className="text-dim text-sm">
              在途 {data.runHealth.active.total}
              {data.runHealth.atRisk.runningNearStale + data.runHealth.atRisk.queuedNearStale > 0
                ? ` · 近收尸 ${data.runHealth.atRisk.runningNearStale + data.runHealth.atRisk.queuedNearStale}`
                : ''}
            </span>
          </div>
          <ul className="settings-cwd-steps" style={{ listStyle: 'disc' }} data-testid="settings-run-health-stats">
            <li>
              在途：queued <strong>{data.runHealth.active.queued}</strong> · running{' '}
              <strong>{data.runHealth.active.running}</strong>
            </li>
            <li>
              最老 queued 龄期：{' '}
              <strong>{formatAgeMs(data.runHealth.oldestQueuedAgeMs)}</strong>
              {' · '}
              最老 running 心跳龄：{' '}
              <strong>{formatAgeMs(data.runHealth.oldestRunningHeartbeatAgeMs)}</strong>
            </li>
            <li>
              收尸阈值：running 心跳{' '}
              <code>{Math.round(data.runHealth.thresholds.staleRunningMs / 1000)}s</code>
              {' · '}
              queued{' '}
              <code>{Math.round(data.runHealth.thresholds.staleQueuedMs / 60000)}min</code>
              {' · '}
              扫描间隔{' '}
              <code>{Math.round(data.runHealth.thresholds.sweepIntervalMs / 1000)}s</code>
            </li>
            {(data.runHealth.atRisk.runningNearStale > 0 ||
              data.runHealth.atRisk.queuedNearStale > 0) && (
              <li>
                接近收尸：running{' '}
                <strong>{data.runHealth.atRisk.runningNearStale}</strong> · queued{' '}
                <strong>{data.runHealth.atRisk.queuedNearStale}</strong>
              </li>
            )}
          </ul>
          <div className="settings-cwd-recovery-links" data-testid="settings-run-health-actions">
            <Link
              className="btn-secondary btn-sm"
              href="/runs?status=active"
              data-testid="settings-run-health-to-active"
            >
              在途运行
            </Link>
            <Link
              className="btn-secondary btn-sm"
              href="/runs?status=failed"
              data-testid="settings-run-health-to-failed"
            >
              失败运行
            </Link>
            <button
              type="button"
              className="btn-primary btn-sm"
              data-testid="settings-run-health-recover"
              disabled={recoverStuck.isPending}
              onClick={() => recoverStuck.mutate()}
              title="收尸 orphan running / 心跳超时 / 缺 agent 排队 / 排队过久"
            >
              {recoverStuck.isPending ? '收尸中…' : '收尸卡住 run'}
            </button>
          </div>
        </section>
      ) : null}
      </section>

      {/* 常驻运营回跳：不依赖阻塞态，方便从诊断页跳失败闭环 */}
      <section className="settings-section" data-testid="settings-ops-section">
        <div className="settings-section-head">
          <h2 className="settings-section-title">运营与诊断</h2>
          <p className="settings-section-desc">失败闭环 · env 片段 · 检查项</p>
        </div>
      <section
        className="settings-card settings-ops-recovery"
        data-testid="settings-ops-recovery"
        aria-label="运营恢复入口"
      >
        <div className="settings-cwd-guide-title">
          <strong>运营恢复</strong>
          <span className="text-dim text-sm">失败 / 就绪 / 编译 / 卡死 run</span>
        </div>
        <div className="settings-cwd-recovery-links">
          <button
            type="button"
            className="btn-primary btn-sm"
            data-testid="settings-ops-recover-stuck"
            disabled={recoverStuck.isPending}
            onClick={() => recoverStuck.mutate()}
            title="收尸 orphan running / 心跳超时 / 缺 agent 排队 / 排队过久"
          >
            {recoverStuck.isPending ? '收尸中…' : '收尸卡住 run'}
          </button>
          <Link className="btn-secondary btn-sm" href="/runs?status=failed" data-testid="settings-ops-failed-runs">
            失败运行
          </Link>
          <Link
            className="btn-secondary btn-sm"
            href="/inbox?kind=run_failed&read=unread"
            data-testid="settings-ops-inbox-fails"
          >
            Inbox 失败
          </Link>
          <Link className="btn-ghost btn-sm" href="/?failed=1" data-testid="settings-ops-failed-board">
            看板仅失败
          </Link>
          <Link className="btn-ghost btn-sm" href="/agents?ready=blocked" data-testid="settings-ops-agents-blocked">
            不可用智能体
          </Link>
          <Link className="btn-ghost btn-sm" href="/wiki?jobStatus=dead" data-testid="settings-ops-wiki-dead">
            Wiki dead
          </Link>
          <Link className="btn-ghost btn-sm" href="/automation?failed=1" data-testid="settings-ops-automation-failed">
            自动化失败规则
          </Link>
        </div>
      </section>

      <section
        className={`settings-card settings-env-snippet${cwdBlocked || wikiLlmBlocked || runtimeBlocked.length > 0 ? ' settings-env-snippet--warn' : ''}`}
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

      <ul className="settings-check-list settings-card" aria-label="诊断项">
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
      </section>
      </div>
    </div>
  );
}
