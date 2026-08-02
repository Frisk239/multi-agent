'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { SettingsCheck, SettingsOverall } from '@ma/shared';
import {
  useCleanupIsolatedWorkspaces,
  useInboxPrefs,
  useIsolatedWorkspaces,
  useOpsSnapshot,
  useSnapshots,
  useCreateSnapshot,
  useValidateSnapshot,
  useDryRunSnapshotRestore,
  useStageSnapshotRestore,
  useDeleteSnapshotStage,
  usePreviewSnapshotRestore,
  useConfirmSnapshotRestore,
  useRecoverStuckRuns,
  useSetInboxPrefs,
  useRetryAllDeadWikiJobs,
  useSetWorkspaceCwd,
  useSettingsLiveProbes,
  useSettingsStatus,
  useUpdateUserProfile,
  useUserProfile,
} from '@/lib/api';
import {
  inferServerLocalTokenFromCheckDetail,
  isPublicLocalTokenConfigured,
  publicLocalTokenStatusLabel,
} from '@/lib/local-token';
import { confirmDialog } from '@/lib/confirm-store';
import { useShortcuts } from '@/lib/use-shortcuts';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { CliHealthInspector } from './CliHealthInspector';
import {
  pickSettingsFirstSteps,
  settingsCheckAnchorId,
  settingsCheckTab,
} from '@/lib/settings-first-steps';
import { resolveFailureActionUi } from '@/lib/failure-action-map';

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

function buildEnvSnippet(
  checks: SettingsCheck[],
  cwdPath?: string | null,
): string {
  const lines = [
    '# multi-agent local env (copy into shell / .env before starting server)',
    '# 路径请改成你的业务仓绝对路径（勿默认成 multi-agent 控制台仓）',
  ];
  const cwd = checks.find((c) => c.id === 'cwd');
  const pathHint = cwdPath?.trim() || '';
  if (!cwd || cwd.status !== 'ok') {
    lines.push(
      pathHint
        ? `export MA_WORKSPACE_CWD="${pathHint}"`
        : 'export MA_WORKSPACE_CWD="/absolute/path/to/your/repo"',
    );
  } else if (pathHint) {
    lines.push(`# MA_WORKSPACE_CWD already ok`);
    lines.push(`export MA_WORKSPACE_CWD="${pathHint}"`);
  } else if (cwd.detail) {
    lines.push(`# ${cwd.detail}`);
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
  lines.push('# export MA_ISSUE_IDLE_MS=1800000  # issue idle 默认 30min');
  lines.push('# export MA_DEFERRED_UNCLAIMED_MS=1800000  # Slice42/70 deferred 升级阈值；默认 0=关闭');
  lines.push('# export MA_DEFERRED_AUTO_ESCALATE=1       # Slice70 opt-in；无 MS 时用建议 30min');
  // Slice 59：局域网 Web 闭环（public env，不入 DB；密钥勿提交 git）
  lines.push('# —— 局域网 token（server + web，密钥不落库）——');
  lines.push('# export MA_LOCAL_TOKEN=change-me          # server packages/server/.env');
  lines.push('# export NEXT_PUBLIC_MA_LOCAL_TOKEN=change-me  # web 启动前；与 MA_LOCAL_TOKEN 一致');
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
  const searchParams = useSearchParams();
  const { openHelp } = useShortcuts();
  const { data, isLoading, isError, error, refetch, isFetching } =
    useSettingsStatus();
  const { data: profile } = useUserProfile();
  const updateProfile = useUpdateUserProfile();
  const recoverStuck = useRecoverStuckRuns();
  const retryAllDeadWiki = useRetryAllDeadWikiJobs();
  const setCwd = useSetWorkspaceCwd();
  const { data: isolatedWs, refetch: refetchIsolated } = useIsolatedWorkspaces();
  const cleanupIsolated = useCleanupIsolatedWorkspaces();
  const { data: inboxPrefs } = useInboxPrefs();
  const setInboxPrefs = useSetInboxPrefs();
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [cwdCopyState, setCwdCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [profileName, setProfileName] = useState('');
  const [profileAbout, setProfileAbout] = useState('');
  const [profileReady, setProfileReady] = useState(false);
  const [wikiCopyState, setWikiCopyState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [cwdDraft, setCwdDraft] = useState('');
  const [cwdDraftReady, setCwdDraftReady] = useState(false);
  /** Multica 式左栏：账号 / 工作区 / 环境诊断；?tab= 可深链 */
  const tabParam = searchParams.get('tab');
  const initialTab =
    tabParam === 'workspace' || tabParam === 'health' || tabParam === 'profile'
      ? tabParam
      : 'profile';
  const [tab, setTab] = useState<'profile' | 'workspace' | 'health'>(initialTab);

  useEffect(() => {
    if (tabParam === 'workspace' || tabParam === 'health' || tabParam === 'profile') {
      setTab(tabParam);
    }
  }, [tabParam]);

  const sortedChecks = useMemo(
    () => (data ? sortChecks(data.checks) : []),
    [data],
  );

  const firstSteps = useMemo(
    () => (data ? pickSettingsFirstSteps(data.checks, 3) : []),
    [data],
  );

  function goToCheck(checkId: string) {
    const nextTab = settingsCheckTab(checkId);
    setTab(nextTab);
    // 等 tab 内容挂载后再滚到锚点（双 rAF + 短延迟覆盖 React commit）
    const scroll = () => {
      const el = document.getElementById(settingsCheckAnchorId(checkId));
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scroll);
    });
    window.setTimeout(scroll, 80);
  }

  const envSnippet = useMemo(
    () =>
      data
        ? buildEnvSnippet(data.checks, data.cwd?.path ?? data.cwd?.persistedPath)
        : '',
    [data],
  );

  /** Slice 59：局域网 token 只读检测（永不回显密钥 / 无表单入库） */
  const localTokenPanel = useMemo(() => {
    const serverCheck = data?.checks.find((c) => c.id === 'server');
    const server = inferServerLocalTokenFromCheckDetail(serverCheck?.detail);
    const webConfigured = isPublicLocalTokenConfigured();
    return {
      server,
      webConfigured,
      webLabel: publicLocalTokenStatusLabel(),
      serverDetail: serverCheck?.detail ?? null,
    };
  }, [data]);

  useEffect(() => {
    if (cwdDraftReady || !data) return;
    setCwdDraft(
      data.cwd?.persistedPath ??
        data.cwd?.path ??
        '',
    );
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

  const cwdExportPath =
    data?.cwd?.path ||
    data?.cwd?.persistedPath ||
    cwdDraft.trim() ||
    '/absolute/path/to/your/repo';
  const cwdExportLine = `export MA_WORKSPACE_CWD="${cwdExportPath}"`;
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
    <div
      className="page-container settings-page settings-page--multica collection-page"
      data-testid="settings-page"
    >
      <div className="page-header">
        <div>
          <Icon name="settings" size={16} className="page-header-icon" />
          <h1 className="page-title">
            设置
            <span
              className={`settings-overall settings-overall--${overall}`}
              title={overall}
            >
              {OVERALL_LABEL[overall]}
            </span>
          </h1>
          <p className="page-desc page-desc--quiet">
            {summary.errors} 项错误 · {summary.warnings} 项警告 · 对齐 Multica 账号/工作区结构（本地诊断保留）
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

      <section
        className={`settings-first-steps${firstSteps.length === 0 ? ' settings-first-steps--ok' : ''}`}
        data-testid="settings-first-steps"
        aria-label="先做这 3 步"
      >
        {firstSteps.length === 0 ? (
          <p className="settings-first-steps-ok" data-testid="settings-first-steps-ok">
            环境诊断正常，可以继续派活。
          </p>
        ) : (
          <>
            <div className="settings-first-steps-head">
              <strong>先做这 {firstSteps.length} 步</strong>
              <span className="text-dim text-sm">优先修错误，再处理警告</span>
            </div>
            <ol className="settings-first-steps-list">
              {firstSteps.map((step, i) => (
                <li
                  key={step.id}
                  className={`settings-first-step settings-first-step--${step.status}`}
                  data-testid="settings-first-step"
                  data-check-id={step.id}
                  data-check-status={step.status}
                >
                  <span className="settings-first-step-n">{i + 1}</span>
                  <div className="settings-first-step-body">
                    <button
                      type="button"
                      className="settings-first-step-link"
                      data-testid="settings-first-step-link"
                      onClick={() => goToCheck(step.id)}
                    >
                      {step.label}
                    </button>
                    {step.detail ? (
                      <div className="settings-first-step-detail text-dim text-sm">
                        {step.detail}
                      </div>
                    ) : null}
                  </div>
                  {step.href ? (
                    <Link
                      href={step.href}
                      className="btn-ghost btn-sm"
                      data-testid="settings-first-step-action"
                    >
                      {step.actionLabel?.trim() || '前往'}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <div className="settings-layout" data-testid="settings-layout">
        <nav className="settings-nav" data-testid="settings-nav" aria-label="设置分区">
          <div className="settings-nav-group">我的账号</div>
          <button
            type="button"
            className={`settings-nav-item${tab === 'profile' ? ' is-active' : ''}`}
            data-testid="settings-nav-profile"
            onClick={() => setTab('profile')}
          >
            个人资料
          </button>
          <button
            type="button"
            className="settings-nav-item"
            data-testid="settings-nav-shortcuts"
            onClick={openHelp}
          >
            快捷键
          </button>
          <div className="settings-nav-group">工作区</div>
          <button
            type="button"
            className={`settings-nav-item${tab === 'workspace' ? ' is-active' : ''}`}
            data-testid="settings-nav-workspace"
            onClick={() => setTab('workspace')}
          >
            代码仓库 / 路径
          </button>
          <div className="settings-nav-group">本地运维</div>
          <button
            type="button"
            className={`settings-nav-item${tab === 'health' ? ' is-active' : ''}`}
            data-testid="settings-nav-health"
            onClick={() => setTab('health')}
          >
            环境诊断
          </button>
        </nav>

        <div className="settings-main page-body settings-body">
      {tab === 'profile' ? (
      <section className="settings-section" data-testid="settings-profile-section">
        <div className="settings-section-head">
          <h2 className="settings-section-title">个人资料</h2>
          <p className="settings-section-desc">
            会随任务一起发送给为你工作的 agent——角色、技术栈、偏好（非密钥）
          </p>
        </div>
        <section
          className="settings-card settings-profile-card"
          data-testid="settings-profile-card"
          aria-label="用户资料"
        >
          <label className="settings-profile-field">
            <span>姓名</span>
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
            <span>关于你</span>
            <textarea
              className="settings-profile-about"
              value={profileAbout}
              onChange={(e) => setProfileAbout(e.target.value)}
              rows={6}
              maxLength={2000}
              data-testid="settings-profile-about"
              placeholder="例：偏好 TypeScript、简洁 PR、中文回复；本机路径 D:/code/…"
            />
          </label>
          <p className="text-dim text-sm" style={{ margin: '0 0 8px' }}>
            {profileAbout.length}/2000 ·{' '}
            {profile?.updatedHint ??
              '保存后，Issue 派活与快速派活都会在 prompt 中带上此段说明。'}
          </p>
          <button
            type="button"
            className="btn-primary settings-profile-save-wide"
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
      ) : null}

      {tab === 'workspace' ? (
      <section className="settings-section" data-testid="settings-workspace-section">
        <div className="settings-section-head">
          <h2 className="settings-section-title">代码仓库</h2>
          <p className="settings-section-desc">
            本地工作区路径（Multica「代码仓库」的本地等价；无 GitHub OAuth）
          </p>
        </div>
      <section
        id={settingsCheckAnchorId('cwd')}
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
          默认 Issue 在隔离目录执行；仅设置 <code>MA_ISSUE_USE_WORKSPACE_CWD=1</code> 时本路径才是派活硬闸。项目可另绑
          localPath 进真仓。
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
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => {
              void (async () => {
                const ok = await confirmDialog({
                  title: '清空工作区路径？',
                  description: '清空后 Agent 可能因 cwd 缺失而无法开工，可稍后重新设置。',
                  confirmLabel: '清空',
                  variant: 'danger',
                });
                if (!ok) return;
                setCwdDraft('');
                setCwd.mutate('');
              })();
            }}
          >
            重置工作区 Path
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
            <strong>先修好工作区（已启用工作区 cwd）</strong>
            <span className="settings-cwd-guide-badge">阻塞派活</span>
          </div>
          <ol className="settings-cwd-steps">
            <li>
              当前环境开启了 <code>MA_ISSUE_USE_WORKSPACE_CWD</code>，未配置/无效路径会拒绝 enqueue
            </li>
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
              收件箱失败
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

        <section
          className="settings-card"
          data-testid="settings-inbox-prefs"
          aria-label="收件箱通知"
        >
          <div className="settings-cwd-guide-title">
            <strong>收件箱通知偏好</strong>
          </div>
          <p className="text-dim text-sm" style={{ marginTop: 6 }}>
            细粒度控制。关闭某类通知后，将不再进入收件箱。
            {inboxPrefs?.envForcesSuccess
              ? ' (当前 env MA_INBOX_NOTIFY_SUCCESS 强制开启成功推送)'
              : null}
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>通知类型</div>
              {(['assigned', 'comment', 'run_completed', 'run_failed'] as const).map((type) => {
                const label = type === 'assigned' ? '任务指派' : type === 'comment' ? '新评论' : type === 'run_completed' ? 'Run 成功' : 'Run 失败';
                return (
                  <label key={type} className="text-sm" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(inboxPrefs?.notifyTypes?.[type] ?? true)}
                      disabled={setInboxPrefs.isPending}
                      onChange={(e) =>
                        setInboxPrefs.mutate({
                          notifyTypes: { ...(inboxPrefs?.notifyTypes || {}), [type]: e.target.checked },
                        })
                      }
                    />
                    {label}
                  </label>
                );
              })}
              <label className="text-sm text-dim" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <input
                  type="checkbox"
                  data-testid="settings-notify-issue-success"
                  checked={Boolean(inboxPrefs?.notifyIssueSuccess)}
                  disabled={setInboxPrefs.isPending || Boolean(inboxPrefs?.envForcesSuccess)}
                  onChange={(e) => setInboxPrefs.mutate({ notifyIssueSuccess: e.target.checked })}
                />
                Issue 成功兜底 (旧版)
              </label>
            </div>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>级别开关</div>
              {(['action_required', 'attention', 'info'] as const).map((severity) => {
                const label = severity === 'action_required' ? '需要操作 (Action Required)' : severity === 'attention' ? '关注 (Attention)' : '信息 (Info)';
                return (
                  <label key={severity} className="text-sm" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(inboxPrefs?.notifySeverities?.[severity] ?? true)}
                      disabled={setInboxPrefs.isPending}
                      onChange={(e) =>
                        setInboxPrefs.mutate({
                          notifySeverities: { ...(inboxPrefs?.notifySeverities || {}), [severity]: e.target.checked },
                        })
                      }
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Slice 70 + G2-1：Deferred 升级（默认关；queued 超龄 → deferred → 宽限后自动升级） */}
          <div
            style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle, #e5e7eb)' }}
            data-testid="settings-deferred-escalate"
          >
            <div style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>Deferred 升级（可选）</div>
            <p className="text-dim text-sm" style={{ margin: '0 0 8px 0' }}>
              默认关闭。开启后：queued 超时未 claim → 转 <code>deferred</code>（宽限约 5min，UI
              显示升级时刻）→ 到点自动升级：配了后备 agent 则自动改派（run 详情显示改派血缘），未配则失败并提示。
              建议阈值 30min；也可用 env <code>MA_DEFERRED_UNCLAIMED_MS</code> /{' '}
              <code>MA_DEFERRED_AUTO_ESCALATE=1</code> / <code>MA_DEFERRED_FIRE_MS</code>。
            </p>
            <label className="text-sm" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                data-testid="settings-deferred-auto-escalate"
                checked={Boolean(
                  inboxPrefs?.envForcesDeferredAutoEscalate || inboxPrefs?.deferredAutoEscalate,
                )}
                disabled={
                  setInboxPrefs.isPending || Boolean(inboxPrefs?.envForcesDeferredAutoEscalate)
                }
                onChange={(e) =>
                  setInboxPrefs.mutate({ deferredAutoEscalate: e.target.checked })
                }
              />
              自动升级未认领 deferred（opt-in）
              {inboxPrefs?.envForcesDeferredAutoEscalate
                ? ' · env MA_DEFERRED_AUTO_ESCALATE 已强制开启'
                : null}
              {inboxPrefs?.effectiveDeferredUnclaimedMs &&
              inboxPrefs.effectiveDeferredUnclaimedMs > 0
                ? ` · 有效阈值 ${Math.round(inboxPrefs.effectiveDeferredUnclaimedMs / 60_000)}m`
                : null}
            </label>
          </div>
        </section>

        <section
          className="settings-card"
          data-testid="settings-isolated-workspaces"
          aria-label="隔离工作目录"
        >
          <div className="settings-cwd-guide-title">
            <strong>隔离 CLI 目录</strong>
            <span className="text-dim text-sm">
              {isolatedWs?.count ?? '…'} 个 · 仅 ~/.multi-agent
            </span>
          </div>
          <p className="text-dim text-sm" style={{ marginTop: 6 }}>
            Issue/Chat 默认隔离 workdir 会沿用；可清理过旧目录回收磁盘。
            <strong>不会</strong>删除 project.localPath 真仓。
          </p>
          <div className="settings-cwd-recovery-links" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="settings-isolated-refresh"
              onClick={() => void refetchIsolated()}
            >
              刷新列表
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              data-testid="settings-isolated-cleanup-7d"
              disabled={cleanupIsolated.isPending}
              onClick={() => {
                void (async () => {
                  const ok = await confirmDialog({
                    title: '清理隔离目录？',
                    description:
                      '删除超过 7 天未修改的隔离 workdir（run-workspaces / chat-sessions）？不可恢复。',
                    confirmLabel: '清理',
                    variant: 'danger',
                  });
                  if (!ok) return;
                  cleanupIsolated.mutate({ olderThanDays: 7 });
                })();
              }}
            >
              {cleanupIsolated.isPending ? '清理中…' : '清理 &gt;7 天'}
            </button>
          </div>
          {(isolatedWs?.entries?.length ?? 0) > 0 ? (
            <ul
              className="text-sm"
              data-testid="settings-isolated-list"
              style={{
                margin: '10px 0 0',
                padding: 0,
                listStyle: 'none',
                maxHeight: 160,
                overflow: 'auto',
              }}
            >
              {isolatedWs!.entries.slice(0, 12).map((e) => (
                <li
                  key={e.id}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: '4px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <code className="text-dim" style={{ flex: 1, wordBreak: 'break-all' }}>
                    {e.label}
                  </code>
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    data-testid="settings-isolated-delete-one"
                    disabled={cleanupIsolated.isPending}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirmDialog({
                          title: '删除隔离目录？',
                          description: `删除隔离目录 ${e.label}？`,
                          confirmLabel: '删除',
                          variant: 'danger',
                        });
                        if (!ok) return;
                        cleanupIsolated.mutate({ ids: [e.id] });
                      })();
                    }}
                  >
                    删
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-dim text-sm" style={{ marginTop: 8 }}>
              暂无隔离目录（派过 Issue/Chat 后会出现）
            </p>
          )}
        </section>
      </section>
      ) : null}

      {tab === 'health' ? (
      <>
      <CliHealthInspector />
      <LiveProbesSection />
      <SnapshotRecoverySection />
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
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  data-testid="settings-wiki-dead-btn"
                  disabled={retryAllDeadWiki.isPending}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirmDialog({
                        title: '重试 dead Wiki 任务？',
                        description: '重试全部 dead Wiki 编译任务？',
                        confirmLabel: '重试全部',
                      });
                      if (!ok) return;
                      retryAllDeadWiki.mutate();
                    })();
                  }}
                >
                  {retryAllDeadWiki.isPending ? '重试中…' : '一键重试 dead 任务'}
                </button>
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
                  收件箱失败
                </Link>
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      <section className="settings-section" data-testid="settings-health-section">
        <div className="settings-section-head">
          <h2 className="settings-section-title">健康摘要</h2>
          <p className="settings-section-desc">运维快照 · 记忆 · Wiki · 自动化 · 运行</p>
        </div>

      <OpsSnapshotCard />

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
            <li data-testid="settings-memory-breaker">
              断路器：{' '}
              <strong>
                {data.memoryHealth.breakerOpen ? '打开' : '关闭'}
              </strong>
              {typeof data.memoryHealth.breakerFailures === 'number'
                ? ` · 连续失败 ${data.memoryHealth.breakerFailures}`
                : null}
              {data.memoryHealth.breakerOpen && data.memoryHealth.breakerOpenUntil
                ? ` · 冷却至 ${new Date(data.memoryHealth.breakerOpenUntil).toLocaleString()}`
                : null}
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
                  void (async () => {
                    const dead = data.wikiHealth!.dead;
                    const ok = await confirmDialog({
                      title: '重试 dead Wiki 任务？',
                      description: `重试全部 ${dead} 条 dead Wiki 编译任务？`,
                      confirmLabel: '重试全部',
                    });
                    if (!ok) return;
                    retryAllDeadWiki.mutate();
                  })();
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
              {data.runHealth.atRisk.runningNearStale + data.runHealth.atRisk.queuedNearStale + data.runHealth.atRisk.waitingLocalNearStale > 0
                ? ` · 近收尸 ${data.runHealth.atRisk.runningNearStale + data.runHealth.atRisk.queuedNearStale + data.runHealth.atRisk.waitingLocalNearStale}`
                : ''}
            </span>
          </div>
          <ul className="settings-cwd-steps" style={{ listStyle: 'disc' }} data-testid="settings-run-health-stats">
            <li data-testid="settings-run-health-waiting">
              waiting_local_directory <strong>{data.runHealth.active.waitingLocalDirectory}</strong> · oldest{' '}
              <strong>{formatAgeMs(data.runHealth.oldestWaitingLocalDirectoryAgeMs)}</strong> · max{' '}
              <code>
                {data.runHealth.thresholds.waitingLocalMaxMs === 0
                  ? '关闭'
                  : `${Math.round(data.runHealth.thresholds.waitingLocalMaxMs / 60000)}min`}
              </code>
            </li>
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
              收尸阈值：chat 心跳{' '}
              <code>{Math.round(data.runHealth.thresholds.staleRunningMs / 1000)}s</code>
              {' · '}
              issue idle{' '}
              <code data-testid="settings-issue-idle">
                {data.runHealth.thresholds.issueIdleMs === 0
                  ? '关闭'
                  : data.runHealth.thresholds.issueIdleMs != null
                    ? `${Math.round(data.runHealth.thresholds.issueIdleMs / 60000)}min`
                    : `${Math.round(data.runHealth.thresholds.staleRunningMs / 1000)}s`}
              </code>
              {' · '}
              issue wall{' '}
              <code data-testid="settings-issue-wall">
                {data.runHealth.thresholds.issueWallTimeoutMs
                  ? `${Math.round(data.runHealth.thresholds.issueWallTimeoutMs / 60000)}min`
                  : '不限'}
              </code>
              {' · '}
              queued{' '}
              <code>{Math.round(data.runHealth.thresholds.staleQueuedMs / 60000)}min</code>
              {' · '}
              扫描间隔{' '}
              <code>{Math.round(data.runHealth.thresholds.sweepIntervalMs / 1000)}s</code>
            </li>
            {(data.runHealth.atRisk.runningNearStale > 0 ||
              data.runHealth.atRisk.queuedNearStale > 0 ||
              data.runHealth.atRisk.waitingLocalNearStale > 0) && (
              <li>
                接近收尸：running{' '}
                <strong>{data.runHealth.atRisk.runningNearStale}</strong> · queued{' '}
                <strong>{data.runHealth.atRisk.queuedNearStale}</strong> 路 waiting{' '}
                <strong>{data.runHealth.atRisk.waitingLocalNearStale}</strong>
              </li>
            )}
          </ul>
          <div className="settings-cwd-recovery-links" data-testid="settings-run-health-actions">
            <Link className="btn-secondary btn-sm" href="/runs?status=waiting_local_directory" data-testid="settings-run-health-to-waiting">
              waiting runs
            </Link>
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
            收件箱失败
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
        className="settings-card settings-local-token"
        data-testid="settings-local-token"
        aria-label="局域网 Token 状态"
      >
        <div className="settings-cwd-guide-title">
          <strong>局域网 Token</strong>
          <span className="text-dim text-sm">只读检测 · 密钥不落库 / 无表单</span>
        </div>
        <ul
          className="settings-cwd-steps"
          style={{ listStyle: 'disc' }}
          data-testid="settings-local-token-stats"
        >
          <li data-testid="settings-local-token-server">
            <strong>服务端</strong> · {localTokenPanel.server.summary}
            {localTokenPanel.serverDetail ? (
              <div className="text-dim text-sm" style={{ marginTop: 4 }}>
                {localTokenPanel.serverDetail}
              </div>
            ) : null}
          </li>
          <li
            data-testid="settings-local-token-web"
            data-web-token-configured={localTokenPanel.webConfigured ? '1' : '0'}
          >
            <strong>前端</strong> · {localTokenPanel.webLabel}
          </li>
        </ul>
        <p className="text-dim text-sm" style={{ marginTop: 8 }} data-testid="settings-local-token-hint">
          对齐方式：server 设 <code>MA_LOCAL_TOKEN</code>；Web 设同值{' '}
          <code>NEXT_PUBLIC_MA_LOCAL_TOKEN</code>（构建/启动时注入）。HTTP 自动带{' '}
          <code>X-MA-Token</code>，WS 自动带 <code>?token=</code>。loopback 日用可不设；勿在 Settings
          表单存密钥到 DB。
        </p>
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

      <ul className="settings-check-list settings-card" aria-label="诊断项" data-testid="settings-check-list">
        {sortedChecks.map((check) => (
          <li
            key={check.id}
            id={settingsCheckAnchorId(check.id)}
            className={`settings-check settings-check--${check.status}`}
            data-testid="settings-check-row"
            data-check-id={check.id}
            data-check-status={check.status}
          >
            <span
              className={`settings-check-dot settings-check-dot--${check.status}`}
              aria-hidden="true"
            />
            <div className="settings-check-body">
              <div className="settings-check-row">
                <span className="settings-check-label">{check.label}</span>
                {check.href ? (
                  <Link
                    href={check.href}
                    className="settings-check-link"
                    data-testid="settings-check-action"
                  >
                    {check.actionLabel?.trim() || '前往'}
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
        本页诊断只读。密钥仅 env；工作区路径可写本地 DB。Grok Build 需本机 `grok` CLI（GROK_PATH / PATH）与登录态。
      </p>
      </section>
      </>
      ) : null}
        </div>
      </div>
    </div>
  );
}

function OpsSnapshotCard() {
  const { data, isLoading, isError, refetch, isFetching } = useOpsSnapshot({
    refetchInterval: 10_000,
  });

  return (
    <section
      className="settings-card settings-ops-recovery"
      data-testid="settings-ops-snapshot"
      aria-label="运维快照"
    >
      <div className="settings-cwd-guide-title">
        <strong>运维快照</strong>
        <span className="text-dim text-sm">
          {isLoading
            ? '加载中…'
            : data
              ? `${data.status === 'ok' ? '正常' : '降级'} · 在途 ${data.runs.active.total}`
              : isError
                ? '加载失败'
                : '—'}
        </span>
        <button
          type="button"
          className="btn-ghost btn-sm"
          data-testid="settings-ops-snapshot-refresh"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          {isFetching ? '刷新中…' : '刷新'}
        </button>
      </div>
      {data ? (
        <ul
          className="settings-cwd-steps"
          style={{ listStyle: 'disc' }}
          data-testid="settings-ops-snapshot-stats"
        >
          <li>
            在途：queued <strong>{data.runs.active.queued}</strong> · running{' '}
            <strong>{data.runs.active.running}</strong>
            {data.runs.active.waitingLocalDirectory > 0
              ? ` · waiting ${data.runs.active.waitingLocalDirectory}`
              : null}
            {' · '}
            队列 p50/p95{' '}
            <strong>
              {formatAgeMs(data.runs.eligibleQueueAge.p50Ms)} / {formatAgeMs(data.runs.eligibleQueueAge.p95Ms)}
            </strong>
            {data.runs.active.retryBackoff > 0
              ? ` · retry backoff ${data.runs.active.retryBackoff}`
              : null}
          </li>
          <li>
            Wiki：dead <strong>{data.wiki.dead}</strong> · pending{' '}
            <strong>{data.wiki.pending}</strong> · running <strong>{data.wiki.running}</strong>
          </li>
          {data.runs.queueSamples.length > 0 ? (
            <li data-testid="settings-ops-queue-samples">
              <span>最久队列样本：</span>
              <ul className="settings-ops-inline-list">
                {data.runs.queueSamples.map((sample) => (
                  <li key={sample.id}>
                    <Link href={`/runs?status=${sample.status === 'queued' ? 'queued' : 'waiting_local_directory'}&run=${sample.id}`}>
                      {sample.status === 'queued' ? 'queued' : 'waiting'} · {sample.id.slice(0, 8)}
                    </Link>{' '}
                    <span className="text-dim">
                      {sample.blockedReason === 'retry_backoff'
                        ? `retry backoff · ${sample.eligibleAt == null ? '待定' : new Date(sample.eligibleAt).toLocaleTimeString()}`
                        : formatAgeMs(sample.ageMs)}
                    </span>
                    {sample.pathWaitReason === 'path_busy' && sample.pathBlockedByRunId ? (
                      <>
                        {' · '}
                        <Link
                          href={`/runs/${sample.pathBlockedByRunId}`}
                          data-testid={`settings-ops-path-holder-${sample.id}`}
                        >
                          占用 {sample.pathBlockedByRunId.slice(0, 8)}
                        </Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
          {data.runs.terminalReasons.length > 0 ? (
            <li data-testid="settings-ops-terminal-reasons">
              <span>终态原因（{data.runs.terminalWindow}）：</span>
              <ul className="settings-ops-inline-list">
                {data.runs.terminalReasons.slice(0, 6).map((entry) => (
                  <li key={entry.reason}>
                    <Link href={`/runs?status=${terminalReasonStatus(entry.reason)}`}>
                      {terminalReasonLabel(entry.reason)} · {entry.count}
                    </Link>{' '}
                    <span className="text-dim">{entry.retryable ? '可自动重试' : '需人工处理'}</span>
                  </li>
                ))}
              </ul>
            </li>
          ) : null}
          <li data-testid="settings-ops-memory-breaker">
            Memory 断路器：{' '}
            <strong>{data.memory.breakerOpen ? '打开' : '关闭'}</strong>
            {` · 连续失败 ${data.memory.breakerFailures}`}
            {data.memory.breakerOpen && data.memory.breakerOpenUntil
              ? ` · 冷却至 ${new Date(data.memory.breakerOpenUntil).toLocaleString()}`
              : null}
          </li>
          <li data-testid="settings-ops-workers">
            Workers 上次 tick：
            {Object.entries(data.workers)
              .map(([k, w]) => {
                const age =
                  w.ageMs == null ? '—' : formatAgeMs(w.ageMs);
                return ` ${k}${w.running ? '' : '(停)'} ${age}`;
              })
              .join(' ·')}
          </li>
          <li data-testid="settings-ops-automation-error">
            自动化最近错误：{' '}
            {data.automation.lastError ? (
              <strong title={data.automation.lastError.error}>
                {data.automation.lastError.error.slice(0, 120)}
                {data.automation.lastError.error.length > 120 ? '…' : ''}
              </strong>
            ) : (
              <span className="text-dim">无</span>
            )}
          </li>
          {data.resumeStats ? (
            <li data-testid="ops-resume-stats">
              Resume（{data.resumeStats.window}）：poisoned{' '}
              <strong data-testid="ops-resume-stats-poisoned">
                {data.resumeStats.sessionPoisoned}
              </strong>
              {' · '}
              resume_miss{' '}
              <strong data-testid="ops-resume-stats-miss">
                {data.resumeStats.resumeMiss}
              </strong>
              {' · '}
              deferred 未认领{' '}
              <strong data-testid="ops-resume-stats-deferred">
                {data.resumeStats.deferredUnclaimed}
              </strong>
            </li>
          ) : null}
        </ul>
      ) : isError ? (
        <p className="text-dim text-sm">无法加载 /api/ops/snapshot</p>
      ) : null}
      <div className="settings-cwd-recovery-links">
        <Link className="btn-ghost btn-sm" href="/runs?status=active">
          在途运行
        </Link>
        <Link className="btn-ghost btn-sm" href="/wiki?jobStatus=dead">
          Wiki dead
        </Link>
      </div>
    </section>
  );
}

function terminalReasonLabel(reason: string): string {
  if (reason === 'completed') return '已完成';
  if (reason === 'failed') return '执行失败（未分类）';
  if (reason === 'timed_out') return '超时（未分类）';
  return resolveFailureActionUi({ failureReason: reason }).label;
}

function terminalReasonStatus(reason: string): string {
  if (reason === 'completed') return 'completed';
  if (reason === 'cancelled') return 'cancelled';
  return 'failed';
}

function SnapshotRecoverySection() {
  const { data, isLoading, isError, refetch, isFetching } = useSnapshots();
  const create = useCreateSnapshot();
  const validate = useValidateSnapshot();
  const dryRun = useDryRunSnapshotRestore();
  const stage = useStageSnapshotRestore();
  const removeStage = useDeleteSnapshotStage();
  const previewRestore = usePreviewSnapshotRestore();
  const confirmRestore = useConfirmSnapshotRestore();
  const [restorePhrase, setRestorePhrase] = useState('');
  const selected = validate.data?.name ?? dryRun.data?.name ?? null;
  return (
    <section className="settings-section" data-testid="settings-snapshot-recovery">
      <div className="settings-section-head">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <h2 className="settings-section-title">灾备快照</h2>
            <p className="settings-section-desc">SQLite（WAL 安全）+ 全局 Wiki；恢复先进入隔离 staging，不写线上状态</p>
          </div>
          <div className="settings-cwd-recovery-links">
            <button type="button" className="btn-primary btn-sm" data-testid="settings-snapshot-create" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? '创建中…' : '创建快照'}
            </button>
            <button type="button" className="btn-ghost btn-sm" data-testid="settings-snapshot-refresh" disabled={isFetching} onClick={() => void refetch()}>刷新</button>
          </div>
        </div>
      </div>
      {isLoading ? <p className="text-dim text-sm">加载快照列表…</p> : isError ? <p className="text-dim text-sm">无法加载快照列表，请检查 server。</p> : null}
      {data?.snapshots?.length ? (
        <ul className="settings-cwd-steps" data-testid="settings-snapshot-list" style={{ listStyle: 'none', padding: 0 }}>
          {data.snapshots.map((entry) => (
            <li key={entry.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span>
                <code>{entry.name}</code>{' '}
                <span className={entry.valid ? 'text-dim' : 'settings-check-detail'}>{entry.valid ? '✓ hash valid' : `✕ ${entry.validationError ?? 'invalid'}`}</span>
                <span className="text-dim text-sm"> · {(entry.sizeBytes / 1024).toFixed(1)} KiB · {new Date(entry.createdAt).toLocaleString()}</span>
              </span>
              <span className="settings-cwd-recovery-links">
                <button type="button" className="btn-ghost btn-sm" data-testid={`settings-snapshot-validate-${entry.name}`} disabled={validate.isPending} onClick={() => validate.mutate({ name: entry.name })}>校验</button>
                <button type="button" className="btn-secondary btn-sm" data-testid={`settings-snapshot-dry-run-${entry.name}`} disabled={dryRun.isPending} onClick={() => dryRun.mutate({ name: entry.name })}>恢复演练</button>
                <button type="button" className="btn-secondary btn-sm" data-testid={`settings-snapshot-stage-${entry.name}`} disabled={stage.isPending || !entry.valid} onClick={() => stage.mutate({ name: entry.name })}>准备隔离包</button>
              </span>
            </li>
          ))}
        </ul>
      ) : data ? <p className="text-dim text-sm" data-testid="settings-snapshot-empty">尚无快照。创建后会显示 manifest、大小和 hash 状态。</p> : null}
      {selected && validate.data ? (
        <div className="settings-check-detail" data-testid="settings-snapshot-validation-result">
          {validate.data.valid ? `校验通过：${validate.data.fileCount} 个文件，Wiki ${validate.data.wikiFiles} 个。` : `校验失败：${validate.data.errors.join('；')}`}
        </div>
      ) : null}
      {dryRun.data ? (
        <div className="settings-check-detail" data-testid="settings-snapshot-dry-run-result">
          {dryRun.data.valid ? `演练报告：DB ${dryRun.data.report.database.bytes} bytes，Wiki ${dryRun.data.report.wiki.includedFiles} 个；未修改线上状态。` : `演练无法继续：${dryRun.data.errors.join('；')}`}
        </div>
      ) : null}
      {stage.data?.stage ? (
        <div className="settings-check-detail" data-testid="settings-snapshot-stage-result">
          <div>
            隔离恢复包已准备：DB integrity <strong>{stage.data.stage.database.integrity}</strong>，Wiki {stage.data.stage.wiki.includedFiles} 个；未写入线上状态。
          </div>
          <div className="text-dim text-sm" style={{ marginTop: 4 }}>
            到期：{new Date(stage.data.stage.expiresAt).toLocaleString()} · stage <code>{stage.data.stage.stageId}</code>
          </div>
          <button
            type="button"
            className="btn-ghost btn-sm"
            data-testid="settings-snapshot-stage-remove"
            disabled={removeStage.isPending}
            onClick={() => removeStage.mutate({ stageId: stage.data!.stage.stageId }, { onSuccess: () => stage.reset() })}
          >
            {removeStage.isPending ? '清理中…' : '清理隔离包'}
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            data-testid="settings-snapshot-restore-preview"
            disabled={previewRestore.isPending}
            onClick={() => previewRestore.mutate({ stageId: stage.data!.stage.stageId })}
          >
            {previewRestore.isPending ? '预览中…' : '预览恢复影响'}
          </button>
        </div>
      ) : null}
      {previewRestore.data?.journal ? (
        <div className="settings-check-detail" data-testid="settings-snapshot-restore-confirm">
          <p>
            将恢复 <code>{previewRestore.data.journal.snapshotName}</code>；当前有{' '}
            <strong>{previewRestore.data.journal.activeRunIds.length}</strong> 个在途 Run。
            未来应用时会先进入 maintenance 并终止旧 active run，不会原样复活。
          </p>
          {!previewRestore.data.journal.liveApplyEnabled ? (
            <p className="text-dim text-sm">
              当前版本已 fail-closed：SQLite 尚无可安全 reopen 的生命周期 seam；这里只生成 durable 影响预览，不会覆盖线上文件。
            </p>
          ) : null}
          <label className="settings-field">
            <span>输入“{previewRestore.data.journal.confirmationPhrase}”确认</span>
            <input
              value={restorePhrase}
              data-testid="settings-snapshot-restore-phrase"
              onChange={(event) => setRestorePhrase(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-danger btn-sm"
            data-testid="settings-snapshot-restore-confirm-button"
            disabled={
              confirmRestore.isPending ||
              !previewRestore.data.journal.liveApplyEnabled ||
              restorePhrase !== previewRestore.data.journal.confirmationPhrase
            }
            onClick={() =>
              confirmRestore.mutate({
                journalId: previewRestore.data!.journal.journalId,
                confirmationToken: previewRestore.data!.journal.confirmationToken,
                confirmationPhrase: restorePhrase,
              })
            }
          >
            {confirmRestore.isPending
              ? '确认中…'
              : previewRestore.data.journal.liveApplyEnabled
                ? '确认恢复'
                : '当前版本不可应用'}
          </button>
          {confirmRestore.data?.journal ? (
            <p data-testid="settings-snapshot-restore-result">
              结果：{confirmRestore.data.journal.status} ·{' '}
              {confirmRestore.data.journal.error ?? '完成'}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function LiveProbesSection() {
  const { data, isLoading, isError, refetch, isFetching } = useSettingsLiveProbes({
    refetchInterval: 5_000,
  });
  const probes = data?.probes ?? [];
  const runtimes = data?.runtimes ?? [];
  const readyCount = runtimes.filter((r) => r.ready).length;

  return (
    <section className="settings-section" data-testid="settings-live-probes">
      <div className="settings-section-head">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div>
            <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
              Live Runtime Probes（进程活体探针）
            </h2>
            <p className="settings-section-desc">
              真实 runtime detect/readiness + 在途 run 心跳
              {data ? ` · pid ${data.pid}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            data-testid="settings-live-probes-refresh"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? '刷新中…' : '刷新探针'}
          </button>
        </div>
      </div>

      <div className="settings-card" style={{ padding: '16px' }} data-testid="settings-live-probes-body">
        {isLoading ? (
          <p className="text-dim text-sm">加载探针数据中…</p>
        ) : isError ? (
          <p className="text-dim text-sm">活体探针加载失败</p>
        ) : (
          <>
            <p className="text-dim text-sm" data-testid="settings-live-probes-summary" style={{ marginTop: 0 }}>
              在途 {data?.activeCount ?? 0}
              {typeof data?.activeRuns === 'number' ? ` · running ${data.activeRuns}` : ''}
              {typeof data?.inProcessCount === 'number'
                ? ` · 本进程 ${data.inProcessCount}`
                : ''}
              {' · '}
              runtime ready {readyCount}/{runtimes.length}
            </p>
            {runtimes.length > 0 ? (
              <ul
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px',
                  listStyle: 'none',
                  margin: '0 0 12px',
                  padding: 0,
                }}
                data-testid="settings-live-probes-runtimes"
              >
                {runtimes.map((r) => (
                  <li
                    key={r.id}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.04)',
                      fontSize: 12,
                    }}
                  >
                    <code>{r.id}</code>{' '}
                    {r.ready ? 'ready' : r.installed ? 'not-ready' : 'missing'}
                    {r.version ? ` · ${r.version}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            {probes.length === 0 ? (
              <p className="text-dim text-sm">目前无在途活跃进程 (All quiet)</p>
            ) : (
              <ul
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                }}
                data-testid="settings-live-probes-list"
              >
                {probes.map((p) => (
                  <li
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: '4px',
                      fontSize: '13px',
                      gap: 8,
                    }}
                  >
                    <span>
                      Run <code>{p.id.slice(0, 8)}…</code> ({p.runtime}
                      {p.kind ? `/${p.kind}` : ''})
                      {p.inProcess ? ' · 本进程' : ''}
                    </span>
                    <span className="text-dim">
                      状态: {p.status} · {p.status === 'running' ? '心跳龄' : '排队龄'}:{' '}
                      {p.status === 'running'
                        ? formatAgeMs(p.heartbeatAgeMs)
                        : formatAgeMs(p.queueAgeMs)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

