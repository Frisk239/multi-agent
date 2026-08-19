'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AgentEnvVar, AgentReadiness, RuntimeId } from '@ma/shared';
import {
  useAgent,
  useAgents,
  useAgentReadiness,
  useAgentRuns,
  useAgentWorkStats,
  useCreateChatThread,
  useDeleteAgent,
  useSkills,
  useAgentSkills,
  useUpdateAgent,
  useUpdateAgentSkills,
  useAgentMcp,
  useUpdateAgentMcp,
  useRetryRun,
  useRuntimeModels,
  useRuntimes,
} from '@/lib/api';
import { confirmDialog } from '@/lib/confirm-store';
import { Icon } from './Icon';
import { AgentStatusBadge } from './AgentStatusBadge';
import { PageBreadcrumb } from './PageBreadcrumb';
import { ErrorBoundary } from './ErrorBoundary';
import { PageSkeleton } from './Skeleton';
import { Select } from './Select';



// bu02 + G12 + G13：对齐 Multica 概览/工作/能力/设置
type TabId = 'overview' | 'work' | 'capabilities' | 'settings';
type RuntimeCapabilityState = 'supported' | 'unsupported' | 'unknown';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: '概览' },
  { id: 'work', label: '工作' },
  { id: 'capabilities', label: '能力' },
  { id: 'settings', label: '设置' },
];

const RUNTIMES: RuntimeId[] = ['claude-code', 'opencode', 'cursor', 'grok'];

/**
 * Runtime catalog is discovery data, not a promise that an adapter consumes a
 * particular configuration. Missing rows and optional capability fields must
 * therefore fail closed instead of briefly exposing a no-op editor.
 */
function runtimeCapabilityState(
  catalog:
    | {
        runtimes: Array<{
          id: string;
          supportsMcpConfig?: boolean;
          supportsCustomArgs?: boolean;
        }>;
      }
    | undefined,
  runtimeId: RuntimeId,
  capability: 'supportsMcpConfig' | 'supportsCustomArgs',
): RuntimeCapabilityState {
  const runtime = catalog?.runtimes.find((item) => item.id === runtimeId);
  if (!runtime) return 'unknown';
  if (runtime[capability] === true) return 'supported';
  if (runtime[capability] === false) return 'unsupported';
  return 'unknown';
}

function readinessClass(status: AgentReadiness['status']): string {
  if (status === 'ready') return 'readiness-chip readiness-ready';
  if (status === 'busy') return 'readiness-chip readiness-busy';
  return 'readiness-chip readiness-missing';
}

function isRuntimeUnverifiedWithoutFailure(
  readiness: AgentReadiness | null | undefined,
): boolean {
  return (
    readiness?.runtimeInstalled === true &&
    readiness.runtimeVerification === 'unverified' &&
    readiness.preflightStatus !== 'failed'
  );
}

export function AgentDetailPage({ agentId }: { agentId: string }) {
  const router = useRouter();
  const { data: agent, isLoading, isError, error } = useAgent(agentId);
  const { data: readiness } = useAgentReadiness(agentId);
  const update = useUpdateAgent(agentId);
  const del = useDeleteAgent();
  const createChat = useCreateChatThread();
  const [tab, setTab] = useState<TabId>('overview');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [runtime, setRuntime] = useState<RuntimeId>('opencode');
  const [model, setModel] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState('');
  const [concurrency, setConcurrency] = useState(1);
  // P2-4：显式后备 agent（runtime 连接不上 + 预算用尽时自动改派目标；''=不启用）
  const [fallbackAgentId, setFallbackAgentId] = useState('');
  // W7：被触发方式 —— 'auto'（默认，评论路由兜底也唤醒）| 'mention-only'（仅显式 @/回复）
  const [invocationPermission, setInvocationPermission] = useState<'auto' | 'mention-only'>('auto');
  const [profileReady, setProfileReady] = useState(false);
  const { data: modelCatalog, isFetching: modelsLoading } = useRuntimeModels(runtime);
  const { data: runtimeCatalog } = useRuntimes();
  const { data: agentsList } = useAgents();
  const mcpCapability = agent
    ? runtimeCapabilityState(runtimeCatalog, agent.runtime, 'supportsMcpConfig')
    : 'unknown';
  const customArgsCapability = agent
    ? runtimeCapabilityState(runtimeCatalog, agent.runtime, 'supportsCustomArgs')
    : 'unknown';

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setCategory(agent.category ?? '');
    setRuntime(agent.runtime);
    setModel(agent.model ?? '');
    setThinkingLevel(agent.thinkingLevel ?? '');
    setConcurrency(agent.concurrency);
    setFallbackAgentId(agent.fallbackAgentId ?? '');
    setInvocationPermission(agent.invocationPermission === 'mention-only' ? 'mention-only' : 'auto');
    setProfileReady(true);
  }, [agent]);

  if (isLoading || !profileReady) {
    return (
      <div className="page-container" data-testid="agent-detail-loading">
        <PageSkeleton />
      </div>
    );
  }
  if (isError || !agent) {
    return (
      <div className="page-container">
        <p className="text-dim">{error instanceof Error ? error.message : 'agent 不存在'}</p>
        <Link href="/agents" className="btn btn-ghost btn-sm">
          返回列表
        </Link>
      </div>
    );
  }

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    update.mutate({
      name: name.trim(),
      category: category.trim() ? category.trim() : null,
      runtime,
      model: model.trim() ? model.trim() : null,
      thinkingLevel: thinkingLevel.trim() ? thinkingLevel.trim() : null,
      concurrency,
      fallbackAgentId: fallbackAgentId.trim() ? fallbackAgentId.trim() : null,
      invocationPermission,
    });
  }

  function handleDelete() {
    if (!agent) return;
    void (async () => {
      const ok = await confirmDialog({
        title: '删除智能体？',
        description: `确定删除智能体「${agent.name}」？`,
        confirmLabel: '删除',
        variant: 'danger',
      });
      if (!ok) return;
      del.mutate(agentId, {
        onSuccess: () => router.push('/agents'),
      });
    })();
  }

  return (
    <ErrorBoundary resetKeys={[agentId]}>
      <div className="page-container">
      <PageBreadcrumb
        testId="agent-breadcrumb"
        items={[{ label: '智能体', href: '/agents' }, { label: agent.name }]}
      />

      <div className="agent-detail-layout">
        <aside className="agent-profile">
          <div className="agent-profile-icon">
            <Icon name="agent" size={24} />
          </div>
          <div className="agent-profile-name">{agent.name}</div>
          <div className="agent-profile-cat">{agent.category || '—'}</div>

          <div style={{ marginTop: '8px', marginBottom: '8px' }}>
            <AgentStatusBadge
              status={agent.liveStatus}
              activeRunCount={agent.activeRunCount}
              size="md"
            />
          </div>

          {readiness && (
            <div className={readinessClass(readiness.status)} title={readiness.detail ?? undefined}>
              {readiness.status}
              {readiness.detail ? ` · ${readiness.detail}` : ''}
            </div>
          )}
          {isRuntimeUnverifiedWithoutFailure(readiness) ? (
            <div className="text-dim text-sm" data-testid="agent-readiness-unverified">
              CLI 已安装；认证、模型和扩展配置尚未做无副作用预检，首次运行仍可能失败。
            </div>
          ) : null}

          {readiness && readiness.status !== 'ready' && readiness.status !== 'busy' ? (
            <div
              className="agent-readiness-recovery"
              data-testid="agent-readiness-recovery"
              data-status={readiness.status}
            >
              <div className="text-sm text-dim">恢复：</div>
              {readiness.status === 'cwd_missing' ? (
                <Link
                  href="/settings"
                  className="btn btn-secondary btn-sm"
                  data-testid="agent-recovery-settings"
                >
                  配置 cwd
                </Link>
              ) : null}
              {readiness.status === 'runtime_missing' ? (
                <Link
                  href="/runtimes"
                  className="btn btn-secondary btn-sm"
                  data-testid="agent-recovery-runtimes"
                >
                  运行时探测
                </Link>
              ) : null}
              <Link
                href={`/agents?ready=${encodeURIComponent(readiness.status)}`}
                className="btn btn-ghost btn-sm"
                data-testid="agent-recovery-same-status"
              >
                同态列表
              </Link>
              <Link
                href={`/?assignee=agent:${encodeURIComponent(agentId)}`}
                className="btn btn-ghost btn-sm"
                data-testid="agent-recovery-board"
              >
                看板
              </Link>
              <Link
                href={`/runs?agent=${encodeURIComponent(agentId)}&status=failed`}
                className="btn btn-ghost btn-sm"
                data-testid="agent-recovery-failed-runs"
              >
                失败运行
              </Link>
            </div>
          ) : null}

          <form className="profile-edit-form" onSubmit={saveProfile}>
            <div className="profile-section">
              <h4>编辑属性</h4>
              <label className="ops-field">
                <span>名称</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="ops-field">
                <span>分类</span>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="可选"
                />
              </label>
              <label className="ops-field">
                <span>运行时</span>
                <Select
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value as RuntimeId)}
                  data-testid="agent-runtime-select"
                >
                  {RUNTIMES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="ops-field">
                <span>模型</span>
                <Select
                  value={
                    model && (modelCatalog?.models ?? []).some((m) => m.id === model)
                      ? model
                      : model
                        ? '__custom__'
                        : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__custom__') return;
                    setModel(v);
                  }}
                  data-testid="agent-model-select"
                >
                  <option value="">
                    {modelsLoading ? '加载模型…' : 'CLI 默认（不指定）'}
                  </option>
                  {(modelCatalog?.models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                      {m.isDefault ? ' · 推荐' : ''}
                    </option>
                  ))}
                  {model &&
                  !(modelCatalog?.models ?? []).some((m) => m.id === model) ? (
                    <option value="__custom__">{model}（当前）</option>
                  ) : null}
                </Select>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="或手填 model id"
                  list="agent-model-suggestions"
                  data-testid="agent-model-input"
                  autoComplete="off"
                  className="agent-model-freeform"
                />
                <datalist id="agent-model-suggestions">
                  {(modelCatalog?.models ?? []).slice(0, 80).map((m) => (
                    <option key={m.id} value={m.id} />
                  ))}
                </datalist>
                {modelCatalog?.error ? (
                  <span className="text-dim text-sm" data-testid="agent-model-source">
                    {modelCatalog.source === 'cli' ? 'CLI' : modelCatalog.source}：
                    {modelCatalog.error}
                  </span>
                ) : modelCatalog && modelCatalog.models.length > 0 ? (
                  <span className="text-dim text-sm" data-testid="agent-model-source">
                    已发现 {modelCatalog.models.length} 个（{modelCatalog.source}）
                  </span>
                ) : null}
              </label>
              <label className="ops-field">
                <span>Thinking / Effort</span>
                <Select
                  value={
                    ['low', 'medium', 'high', 'max'].includes(thinkingLevel)
                      ? thinkingLevel
                      : thinkingLevel
                        ? '__custom__'
                        : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__custom__') return;
                    setThinkingLevel(v);
                  }}
                  data-testid="agent-thinking-select"
                >
                  <option value="">CLI 默认（不指定）</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="max">max</option>
                  {thinkingLevel &&
                  !['low', 'medium', 'high', 'max'].includes(thinkingLevel) ? (
                    <option value="__custom__">{thinkingLevel}（当前）</option>
                  ) : null}
                </Select>
                <input
                  value={thinkingLevel}
                  onChange={(e) => setThinkingLevel(e.target.value)}
                  placeholder="或手填 effort/variant"
                  data-testid="agent-thinking-input"
                  autoComplete="off"
                  className="agent-model-freeform"
                />
                <span className="text-dim text-sm">
                  claude/grok → --effort；cursor/opencode → --variant（CLI 不支持会失败，可清空）
                </span>
              </label>
              <label className="ops-field">
                <span>并发</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
                />
              </label>
              <label className="ops-field">
                <span>后备 agent</span>
                <Select
                  value={fallbackAgentId}
                  onChange={(e) => setFallbackAgentId(e.target.value)}
                  data-testid="agent-fallback-select"
                >
                  <option value="">无（不启用自动改派）</option>
                  {(agentsList ?? [])
                    .filter((a) => a.id !== agentId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
                <span className="text-dim text-sm">
                  运行时连接不上且自动重试预算用尽时，任务自动转给后备 agent（深度 1，不再链式转派）
                </span>
              </label>
              <label className="ops-field">
                <span>被触发方式</span>
                <Select
                  value={invocationPermission}
                  onChange={(e) =>
                    setInvocationPermission(e.target.value as 'auto' | 'mention-only')
                  }
                  data-testid="agent-invocation-select"
                >
                  <option value="auto">自动（默认）—— 评论路由兜底也会唤醒</option>
                  <option value="mention-only">仅显式 —— 只有被 @ 或回复才唤醒</option>
                </Select>
                <span className="text-dim text-sm">
                  「仅显式」时，指派人的评论兜底与小队 leader 唤醒不会打扰它；显式 @ 与回复不受影响
                </span>
              </label>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={update.isPending}
              >
                {update.isPending ? '保存中…' : '保存'}
              </button>
            </div>
          </form>

          <div className="profile-section profile-actions-stack">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="agent-dm-chat"
              disabled={createChat.isPending}
              onClick={() => {
                createChat.mutate(
                  { agentId, title: `与 ${agent.name} 的对话` },
                  {
                    onSuccess: (t) => {
                      router.push(`/chat?thread=${encodeURIComponent(t.id)}`);
                    },
                  },
                );
              }}
            >
              {createChat.isPending ? '创建会话…' : '私信'}
            </button>
            <Link
              href={`/?assignee=agent:${encodeURIComponent(agentId)}`}
              className="btn btn-secondary btn-sm"
              data-testid="agent-to-board-assignee"
              title="看板筛选指派给本智能体的 Issue"
            >
              分配工作
            </Link>
            <Link
              href={`/runs?agent=${encodeURIComponent(agentId)}&status=active`}
              className="btn btn-ghost btn-sm"
              data-testid="agent-to-active-runs"
            >
              在途运行
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={del.isPending}
              onClick={handleDelete}
            >
              删除智能体
            </button>
          </div>
        </aside>

        <div className="agent-main">
          <div className="detail-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`detail-tab${tab === t.id ? ' active' : ''}`}
                data-testid={`agent-tab-${t.id}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="detail-tab-content">
            {tab === 'overview' && (
              <OverviewTab agentId={agentId} onOpenRuns={() => setTab('work')} />
            )}
            {tab === 'work' && <RunsTab agentId={agentId} />}
            {tab === 'capabilities' && (
              <CapabilitiesTab
                agentId={agentId}
                mcpCapability={mcpCapability}
              />
            )}
            {tab === 'settings' && (
              <InstructionsTab
                agentId={agentId}
                initial={agent.instructions ?? ''}
                allowedPathsInitial={agent.allowedPaths ?? ''}
                envVarsInitial={agent.envVars ?? []}
                customArgsInitial={agent.customArgs ?? []}
                customArgsCapability={customArgsCapability}
              />
            )}
          </div>
        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}

function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

function OverviewTab({
  agentId,
  onOpenRuns,
}: {
  agentId: string;
  onOpenRuns: () => void;
}) {
  const { data: stats, isLoading, isError, error } = useAgentWorkStats(agentId, 30);
  const { data: recent } = useAgentRuns(agentId, 8);

  if (isLoading) return <p className="skill-assign-empty">加载工作概览…</p>;
  if (isError || !stats) {
    return (
      <p className="skill-assign-empty">
        {error instanceof Error ? error.message : '加载工作统计失败'}
      </p>
    );
  }

  const rateLabel =
    stats.successRate == null
      ? '—'
      : `${Math.round(stats.successRate * 1000) / 10}%`;

  return (
    <div className="agent-overview" data-testid="agent-overview">
      <div className="agent-stats-grid" data-testid="agent-work-stats">
        <div className="agent-stat-card">
          <div className="agent-stat-label">近 30 天成功率</div>
          <div className="agent-stat-value" data-testid="agent-stat-success-rate">
            {rateLabel}
          </div>
          <div className="agent-stat-hint text-dim text-sm">
            completed {stats.completed} · failed {stats.failed}
          </div>
        </div>
        <div className="agent-stat-card">
          <div className="agent-stat-label">平均耗时</div>
          <div className="agent-stat-value" data-testid="agent-stat-avg-duration">
            {formatDurationMs(stats.avgDurationMs)}
          </div>
          <div className="agent-stat-hint text-dim text-sm">仅 completed 且有起止时间</div>
        </div>
        <div className="agent-stat-card">
          <div className="agent-stat-label">运行次数</div>
          <div className="agent-stat-value" data-testid="agent-stat-total">
            {stats.total}
          </div>
          <div className="agent-stat-hint text-dim text-sm">
            在途 {stats.active} · 取消 {stats.cancelled}
          </div>
        </div>
        <div className="agent-stat-card">
          <div className="agent-stat-label">最近活动</div>
          <div className="agent-stat-value agent-stat-value--sm" data-testid="agent-stat-last-run">
            {stats.lastRunAt ? new Date(stats.lastRunAt).toLocaleString() : '—'}
          </div>
          <div className="agent-stat-hint text-dim text-sm">按 run 创建时间</div>
        </div>
      </div>

      <div className="agent-stats-distribution" data-testid="agent-stats-distribution-bar" style={{ margin: '16px 0', padding: 12, borderRadius: 8, background: 'color-mix(in srgb, var(--bg-elevated) 80%, transparent)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 6, color: 'var(--text-muted)' }}>
          <span>近 30 天任务构成 ({stats.total} 次)</span>
          <span>完成 {stats.completed} · 失败 {stats.failed} · 取消 {stats.cancelled} · 在途 {stats.active}</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--border-subtle)' }}>
          {stats.total > 0 ? (
            <>
              <div style={{ width: `${(stats.completed / stats.total) * 100}%`, background: 'var(--status-done)' }} title={`完成: ${stats.completed}`} />
              <div style={{ width: `${(stats.failed / stats.total) * 100}%`, background: 'var(--color-red)' }} title={`失败: ${stats.failed}`} />
              <div style={{ width: `${(stats.cancelled / stats.total) * 100}%`, background: 'var(--color-orange)' }} title={`取消: ${stats.cancelled}`} />
              <div style={{ width: `${(stats.active / stats.total) * 100}%`, background: 'var(--status-in-progress)' }} title={`在途: ${stats.active}`} />
            </>
          ) : (
            <div style={{ width: '100%', background: 'var(--border-subtle)' }} />
          )}
        </div>
      </div>

      <div className="agent-overview-section">
        <div className="agent-overview-section-head">
          <h3 className="agent-overview-title">最近工作</h3>
          <div className="agent-overview-actions">
            <button
              type="button"
              className="btn-ghost btn-sm"
              data-testid="agent-overview-open-runs"
              onClick={onOpenRuns}
            >
              全部工作
            </button>
            <Link
              href={`/runs?agent=${encodeURIComponent(agentId)}`}
              className="btn-secondary btn-sm"
              data-testid="agent-overview-workspace-runs"
            >
              工作区运行
            </Link>
          </div>
        </div>
        {!recent || recent.length === 0 ? (
          <p className="skill-assign-empty" data-testid="agent-overview-empty">
            暂无运行。可「分配工作」或从看板指派。
          </p>
        ) : (
          <ul className="agent-recent-work" data-testid="agent-overview-recent">
            {recent.map((r) => {
              let dur: number | null = null;
              if (r.startedAt && r.finishedAt) {
                const a = new Date(r.startedAt).getTime();
                const b = new Date(r.finishedAt).getTime();
                if (Number.isFinite(a) && Number.isFinite(b) && b >= a) dur = b - a;
              }
              const title =
                r.kind === 'chat'
                  ? '聊天'
                  : r.kind === 'quick_create'
                    ? '快速派活'
                    : r.issueId
                      ? `Issue ${r.issueId.slice(0, 8)}…`
                      : '运行';
              const ok = r.status === 'completed';
              const bad =
                r.status === 'failed' ||
                r.status === 'cancelled' ||
                r.status === 'timed_out';
              return (
                <li
                  key={r.id}
                  className="agent-recent-work-row"
                  data-run-id={r.id}
                  data-run-status={r.status}
                  data-testid="agent-recent-work-row"
                >
                  <span
                    className={`agent-recent-work-status agent-recent-work-status--${
                      ok ? 'ok' : bad ? 'bad' : 'live'
                    }`}
                    aria-hidden
                    title={r.status}
                  >
                    {ok ? '✓' : bad ? '×' : '·'}
                  </span>
                  <div className="agent-recent-work-main">
                    <div className="agent-recent-work-title">
                      {r.issueId ? (
                        <Link
                          href={`/issues/${r.issueId}`}
                          className="agent-recent-work-issue"
                          data-testid="agent-recent-issue-link"
                        >
                          {title}
                        </Link>
                      ) : (
                        <span>{title}</span>
                      )}
                    </div>
                    <div className="agent-recent-work-meta text-dim text-sm">
                      <span className={`run-pill run-pill--${r.status}`}>{r.status}</span>
                      <span>·</span>
                      <span>{r.createdAt ? relativeWorkTime(r.createdAt) : '—'}</span>
                      <span>·</span>
                      <span>{formatDurationMs(dur)}</span>
                      {r.kind !== 'issue' ? (
                        <>
                          <span>·</span>
                          <code>{r.kind}</code>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="agent-recent-work-actions">
                    {r.issueId ? (
                      <Link
                        href={`/issues/${r.issueId}`}
                        className="agent-work-icon-btn"
                        data-testid="agent-work-open-issue"
                        title="打开 Issue"
                        aria-label="打开 Issue"
                      >
                        ↗
                      </Link>
                    ) : null}
                    <Link
                      href={`/runs/${encodeURIComponent(r.id)}`}
                      className="agent-work-icon-btn"
                      data-testid="agent-work-open-run"
                      title="运行详情 / 轨迹"
                      aria-label="运行详情"
                    >
                      ⌗
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function relativeWorkTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day} 天前`;
  return new Date(iso).toLocaleString();
}

function RunsTab({ agentId }: { agentId: string }) {
  const { data: runs, isLoading, isError, error } = useAgentRuns(agentId);
  const retry = useRetryRun();

  if (isLoading) return <p className="skill-assign-empty">加载中…</p>;
  if (isError) {
    return (
      <p className="skill-assign-empty">
        {error instanceof Error ? error.message : '加载 runs 失败'}
      </p>
    );
  }
  if (!runs || runs.length === 0) {
    return (
      <div className="skill-assign-empty" data-testid="agent-runs-empty">
        <p>暂无运行记录。指派该 agent 后会出现在此。</p>
        <div className="agent-runs-empty-actions">
          <Link
            href={`/?assignee=agent:${encodeURIComponent(agentId)}`}
            className="btn-secondary btn-sm"
            data-testid="agent-runs-empty-board"
          >
            看板指派
          </Link>
          <Link
            href={`/runs?agent=${encodeURIComponent(agentId)}`}
            className="btn-ghost btn-sm"
            data-testid="agent-runs-empty-workspace"
          >
            工作区运行
          </Link>
        </div>
      </div>
    );
  }

  const failedCount = runs.filter((r) => r.status === 'failed').length;

  return (
    <div className="data-table-wrap" data-testid="agent-runs-table">
      <div className="agent-runs-toolbar" data-testid="agent-runs-toolbar">
        <Link
          href={`/runs?agent=${encodeURIComponent(agentId)}`}
          className="btn-ghost btn-sm"
          data-testid="agent-runs-workspace-all"
        >
          工作区全部
        </Link>
        {failedCount > 0 ? (
          <Link
            href={`/runs?agent=${encodeURIComponent(agentId)}&status=failed`}
            className="btn-secondary btn-sm"
            data-testid="agent-runs-workspace-failed"
          >
            工作区失败 · {failedCount}
          </Link>
        ) : null}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>状态</th>
            <th>类型</th>
            <th>Issue</th>
            <th>Runtime</th>
            <th>创建</th>
            <th>错误</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const canRetry =
              (r.status === 'failed' ||
                r.status === 'cancelled' ||
                r.status === 'timed_out') &&
              !!r.issueId &&
              r.kind !== 'chat';
            const chatHref =
              r.kind === 'chat' && r.chatThreadId
                ? `/chat?thread=${encodeURIComponent(r.chatThreadId)}`
                : null;
            return (
              <tr key={r.id} data-run-id={r.id} data-run-status={r.status}>
                <td>
                  <Link
                    href={`/runs?agent=${encodeURIComponent(agentId)}&status=${encodeURIComponent(r.status)}`}
                    className={`run-pill run-pill--${r.status} run-pill--link`}
                    data-testid="agent-run-status-link"
                    data-status={r.status}
                    title="在工作区运行中筛选"
                  >
                    {r.status}
                  </Link>
                </td>
                <td>
                  <code>{r.kind}</code>
                </td>
                <td>
                  {r.issueId ? (
                    <span className="runs-issue-cell">
                      <Link href={`/issues/${r.issueId}`} data-testid="agent-run-issue-link">
                        <code>{r.issueId.slice(0, 8)}…</code>
                      </Link>
                    </span>
                  ) : chatHref ? (
                    <Link href={chatHref} data-testid="agent-run-chat-link">
                      会话
                    </Link>
                  ) : (
                    <span className="text-dim">
                      {r.kind === 'quick_create'
                        ? '（无 Issue）'
                        : r.kind === 'chat'
                          ? '聊天'
                          : '—'}
                    </span>
                  )}
                </td>
                <td>
                  <Link
                    href={`/agents?runtime=${encodeURIComponent(r.runtime)}`}
                    data-testid="agent-run-runtime-link"
                    title="筛选同 runtime 智能体"
                  >
                    <code>{r.runtime}</code>
                  </Link>
                </td>
                <td className="text-dim text-sm">{r.createdAt}</td>
                <td className="text-dim text-sm">
                  {r.error
                    ? r.error.length > 80
                      ? `${r.error.slice(0, 80)}…`
                      : r.error
                    : '—'}
                </td>
                <td>
                  <div className="agent-run-row-actions">
                    {r.issueId ? (
                      <Link
                        href={`/issues/${r.issueId}`}
                        className="agent-work-icon-btn"
                        data-testid="agent-run-open-issue"
                        title="打开 Issue"
                        aria-label="打开 Issue"
                      >
                        ↗
                      </Link>
                    ) : null}
                    <Link
                      href={`/runs/${encodeURIComponent(r.id)}`}
                      className="agent-work-icon-btn"
                      data-testid="agent-run-open-detail"
                      title="运行详情 / 轨迹"
                      aria-label="运行详情"
                    >
                      ⌗
                    </Link>
                    {chatHref &&
                    (r.status === 'failed' ||
                      r.status === 'cancelled' ||
                      r.status === 'queued' ||
                      r.status === 'running') ? (
                      <Link
                        href={chatHref}
                        className="btn btn-secondary btn-sm"
                        data-testid="agent-run-open-chat"
                      >
                        打开会话
                      </Link>
                    ) : null}
                    {canRetry ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(r.id)}
                      >
                        再执行
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// G3-4：环境变量 / 自定义参数编辑器（API 落库 + 保存/回读）
function EnvVarsEditor({
  envVars,
  customArgs,
  customArgsCapability,
  onChangeEnvVars,
  onChangeCustomArgs,
  onClearUnsupportedCustomArgs,
  isClearingCustomArgs,
}: {
  envVars: AgentEnvVar[];
  customArgs: string[];
  customArgsCapability: RuntimeCapabilityState;
  onChangeEnvVars: (v: AgentEnvVar[]) => void;
  onChangeCustomArgs: (v: string[]) => void;
  onClearUnsupportedCustomArgs: () => void;
  isClearingCustomArgs: boolean;
}) {
  function setRow(index: number, patch: Partial<AgentEnvVar>) {
    onChangeEnvVars(envVars.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function removeRow(index: number) {
    onChangeEnvVars(envVars.filter((_, i) => i !== index));
  }
  return (
    <div className="mcp-editor" data-testid="agent-envvars-editor">
      <div className="mcp-editor-hint" style={{ marginTop: '24px' }}>
        环境变量：随该 Agent 的 CLI 执行注入。普通配置可填 value；密钥请填 envRef（例如{' '}
        <code>ANTHROPIC_API_KEY</code>），真实值只从服务端进程环境读取，不会写入数据库。
      </div>
      {envVars.length === 0 ? (
        <p className="text-dim text-sm" data-testid="agent-envvars-empty">
          尚未配置环境变量
        </p>
      ) : null}
      {envVars.map((row, i) => (
        <div key={i} className="envvar-row" data-testid="agent-envvar-row">
          <input
            className="envvar-key"
            value={row.key}
            onChange={(e) => setRow(i, { key: e.target.value })}
            placeholder="KEY"
            spellCheck={false}
            data-testid="agent-envvar-key"
          />
          <span className="envvar-eq">=</span>
          <input
            className="envvar-value"
            value={row.value}
            onChange={(e) => setRow(i, { value: e.target.value })}
            disabled={Boolean(row.envRef)}
            placeholder={row.envRef ? '由进程环境注入' : 'value'}
            spellCheck={false}
            data-testid="agent-envvar-value"
          />
          <input
            className="envvar-ref"
            value={row.envRef ?? ''}
            onChange={(e) =>
              setRow(i, { envRef: e.target.value.trim() || undefined, value: '' })
            }
            placeholder="envRef（密钥）"
            spellCheck={false}
            data-testid="agent-envvar-ref"
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="删除该环境变量"
            onClick={() => removeRow(i)}
            data-testid="agent-envvar-remove"
          >
            删除
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => onChangeEnvVars([...envVars, { key: '', value: '' }])}
        data-testid="agent-envvar-add"
      >
        + 添加环境变量
      </button>

      {customArgsCapability === 'supported' ? (
        <>
          <div className="mcp-editor-hint" style={{ marginTop: '24px' }}>
            自定义参数：追加到 CLI 启动参数（每行一个；executor 注入点见运行文档）。
          </div>
          <textarea
            value={customArgs.join('\n')}
            onChange={(e) =>
              onChangeCustomArgs(
                e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            placeholder={"例如：--permission-mode acceptEdits\n--max-turns 40"}
            spellCheck={false}
            rows={3}
            data-testid="agent-customargs-input"
          />
        </>
      ) : (
        <section
          className="mcp-editor-warning"
          style={{ marginTop: '24px' }}
          data-testid="agent-customargs-unavailable"
          role="status"
        >
          <strong>
            {customArgsCapability === 'unknown'
              ? '自定义参数能力尚未确认'
              : '当前 adapter 不消费自定义参数'}
          </strong>
          <p>
            {customArgsCapability === 'unknown'
              ? '运行时能力目录尚未加载、未收录该 runtime，或未声明此能力。为避免保存后静默无效，暂不提供可编辑入口。'
              : '该 runtime adapter 不会把 Agent 级自定义参数传给 CLI。为避免保存后静默无效，已禁用编辑入口。'}
          </p>
          {customArgs.length > 0 ? (
            <>
              <textarea
                value={customArgs.join('\n')}
                readOnly
                aria-label="未消费的历史自定义参数"
                rows={Math.min(Math.max(customArgs.length, 2), 6)}
                data-testid="agent-customargs-readonly"
              />
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={isClearingCustomArgs}
                onClick={onClearUnsupportedCustomArgs}
                data-testid="agent-customargs-clear"
              >
                {isClearingCustomArgs ? '清除中…' : '清除未消费的自定义参数'}
              </button>
            </>
          ) : null}
        </section>
      )}
    </div>
  );
}

function InstructionsTab({
  agentId,
  initial,
  allowedPathsInitial,
  envVarsInitial,
  customArgsInitial,
  customArgsCapability,
}: {
  agentId: string;
  initial: string;
  allowedPathsInitial: string;
  envVarsInitial: AgentEnvVar[];
  customArgsInitial: string[];
  customArgsCapability: RuntimeCapabilityState;
}) {
  const update = useUpdateAgent(agentId);
  const [draft, setDraft] = useState(initial);
  const [draftPaths, setDraftPaths] = useState(allowedPathsInitial);
  const [envVars, setEnvVars] = useState<AgentEnvVar[]>(envVarsInitial);
  const [customArgs, setCustomArgs] = useState<string[]>(customArgsInitial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  useEffect(() => {
    setDraftPaths(allowedPathsInitial);
  }, [allowedPathsInitial]);

  useEffect(() => {
    setEnvVars(envVarsInitial);
  }, [envVarsInitial]);

  useEffect(() => {
    setCustomArgs(customArgsInitial);
  }, [customArgsInitial]);

  function save() {
    const cleanedPaths = draftPaths
      .split(/[\n,]+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .join('\n');
    const cleanedEnvVars = envVars
      .map((row) => ({
        key: row.key.trim(),
        value: row.envRef ? '' : row.value,
        ...(row.envRef ? { envRef: row.envRef.trim() } : {}),
      }))
      .filter((row) => row.key.length > 0);
    setDraftPaths(cleanedPaths);
    setEnvVars(cleanedEnvVars);
    update.mutate({
      instructions: draft,
      allowedPaths: cleanedPaths,
      envVars: cleanedEnvVars,
      ...(customArgsCapability === 'supported' ? { customArgs } : {}),
    });
  }

  function clearUnsupportedCustomArgs() {
    void (async () => {
      const confirmed = await confirmDialog({
        title: '清除未消费的自定义参数？',
        description:
          '当前 runtime 不会消费这些参数，或能力尚未确认。清除后不可恢复；其他尚未保存的设置草稿不会被提交。',
        confirmLabel: '清除参数',
        variant: 'danger',
      });
      if (!confirmed) return;
      update.mutate(
        { customArgs: [] },
        {
          onSuccess: () => setCustomArgs([]),
        },
      );
    })();
  }

  return (
    <div className="mcp-editor">
      <div className="mcp-editor-hint">
        Agent 级指令会注入执行 prompt（位于 memory 之后、squad briefing 之前）。
        非空时以 <code># Agent Instructions</code> 块出现。
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="例如：Always reply short. Prefer existing project conventions."
        spellCheck={false}
        rows={8}
      />
      
      <div className="mcp-editor-hint" style={{ marginTop: '24px' }}>
        修改边界与路径围栏 (Allowed Paths)。这是注入 prompt 的提示性约束，不是文件系统沙箱；
        runtime 仍可能访问白名单之外的路径。非空时注入 <code>&lt;boundary-fence&gt;</code>，支持逗号或换行分隔 Glob。
      </div>
      <textarea
        value={draftPaths}
        onChange={(e) => setDraftPaths(e.target.value)}
        placeholder="例如：src/frontend/**, docs/*"
        spellCheck={false}
        rows={4}
      />

      <EnvVarsEditor
        envVars={envVars}
        customArgs={customArgs}
        customArgsCapability={customArgsCapability}
        onChangeEnvVars={setEnvVars}
        onChangeCustomArgs={setCustomArgs}
        onClearUnsupportedCustomArgs={clearUnsupportedCustomArgs}
        isClearingCustomArgs={update.isPending}
      />

      <div className="mcp-editor-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={update.isPending}
        >
          {update.isPending ? '保存中…' : '保存设置'}
        </button>
      </div>
    </div>
  );
}

// —— 能力 Tab：Skills + MCP 同屏（G13 / Multica 能力）——
function CapabilitiesTab({
  agentId,
  mcpCapability,
}: {
  agentId: string;
  mcpCapability: RuntimeCapabilityState;
}) {
  return (
    <div className="agent-capabilities" data-testid="agent-capabilities">
      <section className="agent-cap-section" data-testid="agent-cap-skills">
        <div className="agent-cap-head">
          <h3 className="agent-cap-title">Skills</h3>
          <Link href="/skills" className="agent-cap-link">
            工作区 Skills
          </Link>
        </div>
        <p className="agent-cap-hint text-dim text-sm">
          勾选后绑定到此智能体；执行时由 runtime/bridge 注入可用 skill 列表。
        </p>
        <SkillsTab agentId={agentId} />
      </section>
      {mcpCapability === 'supported' ? (
        <section className="agent-cap-section" data-testid="agent-cap-mcp">
          <div className="agent-cap-head">
            <h3 className="agent-cap-title">MCP</h3>
          </div>
          <p className="agent-cap-hint text-dim text-sm">
            本机 MCP server 配置（stdio object）。敏感值请使用 {'${env:NAME}'} 引用，勿写入 JSON。
          </p>
          <McpTab agentId={agentId} />
        </section>
      ) : mcpCapability === 'unsupported' ? (
        <section className="agent-cap-section" data-testid="agent-cap-mcp-unsupported">
          <div className="agent-cap-head">
            <h3 className="agent-cap-title">MCP</h3>
          </div>
          <p className="agent-cap-hint text-dim text-sm">
            当前 runtime adapter 不消费 Agent 级 MCP 配置，已禁用此编辑入口；避免保存后静默无效。
          </p>
        </section>
      ) : (
        <section className="agent-cap-section" data-testid="agent-cap-mcp-unknown">
          <div className="agent-cap-head">
            <h3 className="agent-cap-title">MCP</h3>
          </div>
          <p className="agent-cap-hint text-dim text-sm">
            运行时能力目录尚未加载、未收录该 runtime，或未声明 MCP 能力。为避免保存后静默无效，编辑入口暂不可用；这不表示 adapter 已支持或已验证 MCP。
          </p>
        </section>
      )}
    </div>
  );
}

// —— Skills：checkbox 分配（spec §9.2）——
function SkillsTab({ agentId }: { agentId: string }) {
  const { data: allSkills } = useSkills();
  const { data: assigned } = useAgentSkills(agentId);
  const update = useUpdateAgentSkills(agentId);

  if (!allSkills || !assigned) return <p className="skill-assign-empty">加载中…</p>;

  const assignedSet = new Set(assigned);

  const toggle = (name: string) => {
    const next = assignedSet.has(name)
      ? assigned.filter((n) => n !== name)
      : [...assigned, name];
    update.mutate(next);
  };

  if (allSkills.length === 0) {
    return (
      <p className="skill-assign-empty">
        工作区暂无 skill。在 .skills/ 放 SKILL.md 后点「重新扫描」。
      </p>
    );
  }

  return (
    <div className="skill-assign-list" data-testid="agent-skills-list">
      <div className="skill-assign-summary" data-testid="agent-skills-summary">
        已绑定 {assigned.length} / {allSkills.length}
      </div>
      {allSkills.map((sk) => (
        <label key={sk.name} className="skill-assign-item">
          <input
            type="checkbox"
            checked={assignedSet.has(sk.name)}
            onChange={() => toggle(sk.name)}
            disabled={update.isPending}
            data-testid="agent-skill-toggle"
            data-skill={sk.name}
          />
          <span className="skill-assign-info">
            <span className="skill-assign-name">{sk.name}</span>
            {sk.description && <div className="skill-assign-desc">{sk.description}</div>}
          </span>
        </label>
      ))}
    </div>
  );
}

// —— MCP Tab：JSON 编辑器（spec §9.3）——
function McpTab({ agentId }: { agentId: string }) {
  const { data } = useAgentMcp(agentId);
  const update = useUpdateAgentMcp(agentId);
  const [draft, setDraft] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  if (data && !loaded) {
    setDraft(data.mcpServers ?? '');
    setLoaded(true);
  }

  const handleSave = () => {
    setError('');
    const trimmed = draft.trim();
    if (!trimmed) {
      update.mutate(null);
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        setError('MCP 配置必须是 object 格式：{ "<name>": { command, args, env } }');
        return;
      }
      update.mutate(trimmed);
    } catch {
      setError('JSON 解析失败，请检查格式');
    }
  };

  const handleClear = () => {
    setDraft('');
    setError('');
    update.mutate(null);
  };

  return (
    <div className="mcp-editor">
      <div className="mcp-editor-hint">
        MCP server 配置（object 格式，对齐 claude <code>--mcp-config</code>）。每个 server 以 name 为
        key，含 <code>type</code> / <code>command</code>，可选 <code>args</code> / <code>env</code>。
        <br />
        示例：
        <code>{`{ "github": { "type": "stdio", "command": "npx", "args": ["server-github"] } }`}</code>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={`{\n  "oracle": {\n    "type": "stdio",\n    "command": "npx",\n    "args": ["mcp-oracle-db"],\n    "env": { "ORACLE_USER": "..." }\n  }\n}`}
        spellCheck={false}
      />
      {draft.includes('[redacted]') ? (
        <div className="mcp-editor-warning" data-testid="agent-mcp-redacted-warning">
          历史配置中的敏感值已脱敏，不能原样保存；请改成{' '}
          <code>{'${env:NAME}'}</code> 引用，或先清空后重新配置。
        </div>
      ) : null}
      {error && <div className="mcp-editor-error">{error}</div>}
      <div className="mcp-editor-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={update.isPending}
        >
          保存
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={handleClear}
          disabled={update.isPending}
        >
          清空
        </button>
        {update.isPending && <span className="text-dim text-sm">保存中…</span>}
      </div>
    </div>
  );
}
