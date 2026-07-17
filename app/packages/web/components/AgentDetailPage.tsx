'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AgentReadiness, RuntimeId } from '@ma/shared';
import {
  useAgent,
  useAgentReadiness,
  useAgentRuns,
  useDeleteAgent,
  useSkills,
  useAgentSkills,
  useUpdateAgent,
  useUpdateAgentSkills,
  useAgentMcp,
  useUpdateAgentMcp,
  useRetryRun,
} from '@/lib/api';
import { Icon } from './Icon';

// bu02：profile 可编辑 + readiness；Tabs = runs / skills / mcp / instructions
type TabId = 'runs' | 'skills' | 'mcp' | 'instructions';

const TABS: { id: TabId; label: string }[] = [
  { id: 'runs', label: 'Runs' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'instructions', label: '指令' },
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
  const [tab, setTab] = useState<TabId>('runs');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [runtime, setRuntime] = useState<RuntimeId>('claude-code');
  const [concurrency, setConcurrency] = useState(1);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    if (!agent) return;
    setName(agent.name);
    setCategory(agent.category ?? '');
    setRuntime(agent.runtime);
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
                >
                  {RUNTIMES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
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

          <div className="profile-section">
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
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="detail-tab-content">
            {tab === 'runs' && <RunsTab agentId={agentId} />}
            {tab === 'skills' && <SkillsTab agentId={agentId} />}
            {tab === 'mcp' && <McpTab agentId={agentId} />}
            {tab === 'instructions' && (
              <InstructionsTab agentId={agentId} initial={agent.instructions ?? ''} />
            )}
          </div>
        </div>
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
    return <p className="skill-assign-empty">暂无运行记录。指派该 agent 后会出现在此。</p>;
  }

  return (
    <div className="data-table-wrap">
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
              <tr key={r.id}>
                <td>
                  <code>{r.status}</code>
                </td>
                <td>
                  <code>{r.kind === 'quick_create' ? 'quick_create' : 'issue'}</code>
                </td>
                <td>
                  {r.issueId ? (
                    <Link href={`/issues/${r.issueId}`}>
                      <code>{r.issueId.slice(0, 8)}…</code>
                    </Link>
                  ) : (
                    <span className="text-dim">
                      {r.kind === 'quick_create' ? '（无 Issue）' : '—'}
                    </span>
                  )}
                </td>
                <td>
                  <code>{r.runtime}</code>
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

// —— Skills Tab：checkbox 分配（spec §9.2）——
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
    <div className="skill-assign-list">
      {allSkills.map((sk) => (
        <label key={sk.name} className="skill-assign-item">
          <input
            type="checkbox"
            checked={assignedSet.has(sk.name)}
            onChange={() => toggle(sk.name)}
            disabled={update.isPending}
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
