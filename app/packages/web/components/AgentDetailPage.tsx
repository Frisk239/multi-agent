'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  useAgent,
  useSkills,
  useAgentSkills,
  useUpdateAgentSkills,
  useAgentMcp,
  useUpdateAgentMcp,
} from '@/lib/api';
import { Icon } from './Icon';

// 照原型 renderAgentDetail（app.js:467）+ AGENT_TABS（app.js:48）：
// 薄 profile（左）+ tab 栏（右）。Skills/MCP Tab 实现，其余 tab 占位 Phase 2。

type TabId = 'skills' | 'mcp' | 'activity' | 'instructions';

const TABS: { id: TabId; label: string }[] = [
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'activity', label: '动态' },
  { id: 'instructions', label: '指令' },
];

export function AgentDetailPage({ agentId }: { agentId: string }) {
  const { data: agent } = useAgent(agentId);
  const [tab, setTab] = useState<TabId>('skills');

  if (!agent) return <div className="page-container">加载中…</div>;

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

          <div className="profile-section">
            <h4>属性</h4>
            <div className="prop-row">
              <span className="prop-label">运行时</span>
              <span><code>{agent.runtime}</code></span>
            </div>
            <div className="prop-row">
              <span className="prop-label">并发</span>
              <span>{agent.concurrency}</span>
            </div>
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
            {tab === 'skills' && <SkillsTab agentId={agentId} />}
            {tab === 'mcp' && <McpTab agentId={agentId} />}
            {tab === 'activity' && <PlaceholderTab label="动态" />}
            {tab === 'instructions' && <PlaceholderTab label="指令" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  return <p className="skill-assign-empty">Phase 2 — {label} 配置</p>;
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
    return <p className="skill-assign-empty">工作区暂无 skill。在 .skills/ 放 SKILL.md 后点「重新扫描」。</p>;
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
// MCP 配置存 object 格式（对齐 claude-code --mcp-config 的 mcpServers 结构）：
//   { "<server-name>": { "type": "stdio", "command": "...", "args": [...], "env": {...} } }
// 前端编辑/存储/注入统一 object，注入边界不做转换。
function McpTab({ agentId }: { agentId: string }) {
  const { data } = useAgentMcp(agentId);
  const update = useUpdateAgentMcp(agentId);
  const [draft, setDraft] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  // 首次加载回填
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
    // 校验 JSON（必须是 object）
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
        MCP server 配置（object 格式，对齐 claude <code>--mcp-config</code>）。每个 server 以 name 为 key，
        含 <code>type</code> / <code>command</code>，可选 <code>args</code> / <code>env</code>。
        <br />
        示例：<code>{`{ "github": { "type": "stdio", "command": "npx", "args": ["server-github"] } }`}</code>
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
