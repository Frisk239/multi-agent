'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AgentReadiness, RuntimeId } from '@ma/shared';
import {
  useAgent,
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
} from '@/lib/api';
import { Icon } from './Icon';

// bu02 + G12 + G13：对齐 Multica 概览/工作/能力/设置
type TabId = 'overview' | 'work' | 'capabilities' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: '概览' },
  { id: 'work', label: '工作' },
  { id: 'capabilities', label: '能力' },
  { id: 'settings', label: '设置' },
];

const RUNTIMES: RuntimeId[] = ['claude-code', 'opencode', 'cursor'];

function readinessClass(status: AgentReadiness['status']): string {
  if (status === 'ready') return 'readiness-chip readiness-ready';
  if (status === 'busy') return 'readiness-chip readiness-busy';
  return 'readiness-chip readiness-missing';
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
  const [concurrency, setConcurrency] = useState(1);
  const [profileReady, setProfileReady] = useState(false);
  const { data: modelCatalog, isFetching: modelsLoading } = useRuntimeModels(runtime);

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setCategory(agent.category ?? '');
    setRuntime(agent.runtime);
    setModel(agent.model ?? '');
    setConcurrency(agent.concurrency);
    setProfileReady(true);
  }, [agent]);

  if (isLoading || !profileReady) return <div className="page-container">加载中…</div>;
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
      concurrency,
    });
  }

  function handleDelete() {
    if (!agent) return;
    if (!window.confirm(`确定删除智能体「${agent.name}」？`)) return;
    del.mutate(agentId, {
      onSuccess: () => router.push('/agents'),
    });
  }

  return (
    <div className="page-container">
      <div className="agent-detail-breadcrumb">
        <Link href="/agents">智能体</Link>
        <span>›</span>
        <span>{agent.name}</span>
      </div>

      <div className="agent-detail-layout">
        <aside className="agent-profile">
          <div className="agent-profile-icon">
            <Icon name="agent" size={24} />
          </div>
          <div className="agent-profile-name">{agent.name}</div>
          <div className="agent-profile-cat">{agent.category || '—'}</div>

          {readiness && (
            <div className={readinessClass(readiness.status)} title={readiness.detail ?? undefined}>
              {readiness.status}
              {readiness.detail ? ` · ${readiness.detail}` : ''}
            </div>
          )}

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
                <select
                  value={runtime}
                  onChange={(e) => setRuntime(e.target.value as RuntimeId)}
                  data-testid="agent-runtime-select"
                >
                  {RUNTIMES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ops-field">
                <span>模型</span>
                <select
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
                </select>
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
                <span>并发</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
                />
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
            {tab === 'capabilities' && <CapabilitiesTab agentId={agentId} />}
            {tab === 'settings' && (
              <InstructionsTab agentId={agentId} initial={agent.instructions ?? ''} />
            )}
          </div>
        </div>
      </div>
    </div>
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
          <div className="data-table-wrap">
            <table className="data-table" data-testid="agent-overview-recent">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>类型</th>
                  <th>Issue</th>
                  <th>耗时</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  let dur: number | null = null;
                  if (r.startedAt && r.finishedAt) {
                    const a = new Date(r.startedAt).getTime();
                    const b = new Date(r.finishedAt).getTime();
                    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) dur = b - a;
                  }
                  return (
                    <tr key={r.id} data-run-id={r.id}>
                      <td>
                        <span className={`run-pill run-pill--${r.status}`}>{r.status}</span>
                      </td>
                      <td>
                        <code>{r.kind}</code>
                      </td>
                      <td>
                        {r.issueId ? (
                          <Link href={`/issues/${r.issueId}`}>
                            <code>{r.issueId.slice(0, 8)}…</code>
                          </Link>
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </td>
                      <td className="text-dim text-sm">{formatDurationMs(dur)}</td>
                      <td className="text-dim text-sm">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
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
              (r.status === 'failed' || r.status === 'cancelled') && !!r.issueId;
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
                      {(r.status === 'failed' || r.status === 'running' || r.status === 'queued') ? (
                        <Link
                          href={`/issues/${r.issueId}#run-trace`}
                          className="runs-inline-filter"
                          data-testid="agent-run-trace-link"
                        >
                          轨迹
                        </Link>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-dim">
                      {r.kind === 'quick_create' ? '（无 Issue）' : '—'}
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
                  {canRetry ? (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(r.id)}
                    >
                      再执行
                    </button>
                  ) : !r.issueId && (r.status === 'failed' || r.status === 'cancelled') ? (
                    <span className="text-dim text-sm">请快速派活</span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InstructionsTab({
  agentId,
  initial,
}: {
  agentId: string;
  initial: string;
}) {
  const update = useUpdateAgent(agentId);
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  function save() {
    update.mutate({ instructions: draft });
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
        rows={12}
      />
      <div className="mcp-editor-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={update.isPending}
        >
          {update.isPending ? '保存中…' : '保存指令'}
        </button>
      </div>
    </div>
  );
}

// —— 能力 Tab：Skills + MCP 同屏（G13 / Multica 能力）——
function CapabilitiesTab({ agentId }: { agentId: string }) {
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
      <section className="agent-cap-section" data-testid="agent-cap-mcp">
        <div className="agent-cap-head">
          <h3 className="agent-cap-title">MCP</h3>
        </div>
        <p className="agent-cap-hint text-dim text-sm">
          本机 MCP server 配置（stdio object）。密钥仍只走 env，勿写入 JSON。
        </p>
        <McpTab agentId={agentId} />
      </section>
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
