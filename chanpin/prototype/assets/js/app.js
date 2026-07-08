/**
 * Multica V2 High-Fidelity Replica — SPA Prototype
 */
(function () {
  'use strict';

  const KANBAN_COLS = ['planning', 'todo', 'in_progress', 'in_review', 'done'];
  const KANBAN_LABELS = {
    planning: '待规划',
    todo: '待办',
    in_progress: '进行中',
    in_review: '审核中',
    done: '已完成'
  };

  const NAV_ITEMS = [
    { id: 'inbox', label: '收件箱', icon: '◉', section: 'personal' },
    { id: 'my-issues', label: '我的 issue', icon: '◎', section: 'personal' },
    { id: 'issues', label: 'Issues', icon: '◫', section: 'workspace' },
    { id: 'projects', label: '项目', icon: '▣', section: 'workspace' },
    { id: 'automation', label: '自动化', icon: '⚙', section: 'workspace' },
    { id: 'agents', label: '智能体', icon: '◇', section: 'workspace' },
    { id: 'squads', label: '小队', icon: '◈', section: 'workspace' },
    { id: 'usage', label: '用量', icon: '◐', section: 'workspace' },
    { id: 'wiki', label: 'Wiki', icon: '📖', section: 'workspace' },
    { id: 'runtime', label: '运行时', icon: '⬡', section: 'config' },
    { id: 'skills', label: 'Skills', icon: '⚡', section: 'config' },
    { id: 'settings', label: '设置', icon: '⚙', section: 'config' }
  ];

  const VIEW_LABELS = {
    inbox: '收件箱',
    'my-issues': '我的 issue',
    issues: 'Issues',
    projects: '项目',
    automation: '自动化',
    agents: '智能体',
    squads: '小队',
    usage: '用量',
    wiki: 'Wiki',
    runtime: '运行时',
    skills: 'Skills',
    settings: '设置',
    'agent-detail': '智能体详情',
    'squad-detail': '小队详情'
  };

  const AGENT_TABS = [
    { id: 'activity', label: '动态' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'instructions', label: '指令' },
    { id: 'skills', label: 'Skills' },
    { id: 'env', label: '环境变量' },
    { id: 'params', label: '自定义参数' },
    { id: 'mcp', label: 'MCP' },
    { id: 'integrations', label: '集成' }
  ];

  const SQUAD_TABS = [
    { id: 'members', label: 'Members' },
    { id: 'instructions', label: '指令' }
  ];

  const SETTINGS_SECTIONS = [
    { id: 'profile', label: '个人资料', group: 'account' },
    { id: 'preferences', label: '偏好设置', group: 'account' },
    { id: 'notifications', label: '通知', group: 'account' },
    { id: 'api-token', label: 'API Token', group: 'account' },
    { id: 'daemon', label: 'Daemon', group: 'account' },
    { id: 'updates', label: '更新', group: 'account' },
    { id: 'general', label: '通用', group: 'workspace' },
    { id: 'repos', label: '代码仓库', group: 'workspace' },
    { id: 'github', label: 'GitHub', group: 'workspace' },
    { id: 'integrations', label: '集成', group: 'workspace' },
    { id: 'lab', label: '实验室', group: 'workspace' },
    { id: 'members', label: '成员', group: 'workspace' }
  ];

  const state = {
    view: 'inbox',
    tabs: [{ id: 'tab-1', view: 'inbox', label: '收件箱' }],
    activeTabId: 'tab-1',
    selectedInboxId: null,
    selectedIssueId: null,
    selectedAgentId: null,
    selectedSquadId: null,
    selectedMachineId: 'machine-local',
    selectedWikiId: 'wiki-home',
    settingsSection: 'profile',
    agentDetailTab: 'activity',
    squadDetailTab: 'members',
    boardFilter: 'all',
    agentFilter: 'mine',
    skillsSearch: '',
    agentsSearch: '',
    modal: null,
    newIssueMode: 'agent',
    newIssueDraft: { title: '', description: '', assigneeId: 'agt-lead', status: 'todo' },
    paletteQuery: '',
    dragIssueId: null,
    data: null
  };

  let tabCounter = 1;

  function init() {
    state.data = window.__SEED__ ? structuredClone(window.__SEED__) : { issues: [], agents: [], squads: [], skills: [], wikiPages: [], inboxItems: [] };
    if (state.data.inboxItems?.length && !state.selectedInboxId) {
      state.selectedInboxId = state.data.inboxItems[0].id;
    }
    document.addEventListener('keydown', onGlobalKeydown);
    render();
    fetch('data/seed.json').then(r => r.ok ? r.json() : null).then(d => {
      if (d) { state.data = d; if (!state.selectedInboxId && d.inboxItems?.length) state.selectedInboxId = d.inboxItems[0].id; render(); }
    }).catch(() => {});
  }

  function onGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openModal('command-palette');
    }
    if (e.key === 'c' && !isInputFocused() && !state.modal) {
      e.preventDefault();
      openModal('new-issue-agent');
    }
    if (e.key === 'Escape' && state.modal) closeModal();
  }

  function isInputFocused() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  function navigate(view, opts = {}) {
    state.view = view;
    if (opts.agentId) state.selectedAgentId = opts.agentId;
    if (opts.squadId) state.selectedSquadId = opts.squadId;
    if (opts.issueId) state.selectedIssueId = opts.issueId;
    updateTab(view, opts.label);
    render();
  }

  function updateTab(view, label) {
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (tab) {
      tab.view = view;
      tab.label = label || VIEW_LABELS[view] || view;
    }
  }

  function openModal(type) {
    state.modal = type;
    if (type === 'new-issue-agent') state.newIssueMode = 'agent';
    if (type === 'new-issue-manual') state.newIssueMode = 'manual';
    renderModal();
  }

  function closeModal() {
    state.modal = null;
    state.paletteQuery = '';
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
  }

  function showToast(msg) {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  /* ── Data helpers ── */
  function getIssue(id) { return state.data.issues.find(i => i.id === id); }
  function getAgent(id) { return state.data.agents.find(a => a.id === id); }
  function getSquad(id) { return state.data.squads.find(s => s.id === id); }
  function getSkill(id) { return state.data.skills.find(s => s.id === id); }
  function getMachine(id) { return state.data.machines?.find(m => m.id === id); }

  function assigneeLabel(issue) {
    if (!issue?.assignee) return '未指派';
    if (issue.assignee.type === 'squad') return getSquad(issue.assignee.id)?.name || 'Squad';
    return getAgent(issue.assignee.id)?.name || 'Agent';
  }

  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 3600000) return Math.max(1, Math.floor(diff / 60000)) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric' });
  }

  function formatRelative(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const diff = Date.now() - d;
    if (diff < 86400000) return '今天';
    if (diff < 172800000) return '1 天前';
    return Math.floor(diff / 86400000) + ' 天前';
  }

  function parseMentions(text) {
    if (!text) return '';
    const escaped = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return escaped.replace(
      /\[@([^\]]+)\]\(mention:\/\/agent\/([^)]+)\)/g,
      (_, name) => `<span class="mention-pill">@${name}</span>`
    );
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function filterIssues(scope) {
    let issues = [...state.data.issues];
    if (scope === 'my-issues') {
      issues = issues.filter(i => i.assignee && (
        i.assignee.type === 'squad' || i.assignee.type === 'agent'
      ));
    }
    if (state.boardFilter === 'assigned') issues = issues.filter(i => i.assignee);
    if (state.boardFilter === 'created') issues = issues.filter(i => i.id.startsWith('iss-'));
    return issues;
  }

  /* ── Shell render ── */
  function render() {
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = renderShell();
    bindShellEvents();
    renderModal();
  }

  function renderShell() {
    const ws = state.data.workspace || {};
    const workingCount = state.data.issues.filter(i => i.status === 'in_progress').length;
    return `<div class="app-shell" data-req-id="NAV-V2-001">
      <aside class="sidebar" aria-label="主导航" data-req-id="NAV-V2-002">
        <div class="sidebar-workspace">
          <div class="workspace-avatar">M</div>
          <span>${escapeHtml(ws.name || 'Workspace')}</span>
        </div>
        <div class="sidebar-actions">
          <button type="button" class="sidebar-search" id="btn-open-palette" data-req-id="MOD-PALETTE">
            <span class="nav-icon">⌕</span> 搜索...
            <span class="kbd-hint">Ctrl+K</span>
          </button>
          <button type="button" class="sidebar-new-issue" id="btn-new-issue-sidebar" data-req-id="MOD-NEW-ISSUE">
            <span class="nav-icon">+</span> 新建 issue
            <span class="kbd-hint">C</span>
          </button>
        </div>
        <nav>
          <div class="nav-section">
            <ul class="nav-list">${renderNavItems('personal')}</ul>
          </div>
          <div class="nav-section">
            <div class="nav-section-label">工作区</div>
            <ul class="nav-list">${renderNavItems('workspace')}</ul>
          </div>
          <div class="nav-section">
            <div class="nav-section-label">配置</div>
            <ul class="nav-list">${renderNavItems('config')}</ul>
          </div>
        </nav>
        <div class="sidebar-footer">
          <button type="button" class="help-btn" title="帮助" aria-label="帮助">?</button>
        </div>
      </aside>
      <div class="main-column">
        <div class="tab-bar" data-req-id="NAV-V2-TABS">
          ${state.tabs.map(t => `<button type="button" class="tab-item${t.id === state.activeTabId ? ' active' : ''}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`).join('')}
          <button type="button" class="tab-add" id="btn-tab-add" title="新建标签">+</button>
          <div class="tab-bar-spacer"></div>
          <span class="working-counter" data-req-id="NAV-V2-WORKING">${workingCount} 工作中</span>
        </div>
        <main class="main-content" id="main-view" role="main">${renderView()}</main>
      </div>
    </div>`;
  }

  function renderNavItems(section) {
    return NAV_ITEMS.filter(n => n.section === section).map(n => {
      const active = state.view === n.id || (state.view === 'agent-detail' && n.id === 'agents') || (state.view === 'squad-detail' && n.id === 'squads');
      return `<li><button type="button" class="nav-item${active ? ' active' : ''}" data-nav="${n.id}">
        <span class="nav-icon">${n.icon}</span>${n.label}
      </button></li>`;
    }).join('');
  }

  function renderView() {
    switch (state.view) {
      case 'inbox': return renderInbox();
      case 'my-issues': return renderBoard('my-issues');
      case 'issues': return renderBoard('issues');
      case 'agents': return renderAgentsList();
      case 'agent-detail': return renderAgentDetail();
      case 'squads': return renderSquadsList();
      case 'squad-detail': return renderSquadDetail();
      case 'skills': return renderSkills();
      case 'settings': return renderSettings();
      case 'runtime': return renderRuntime();
      case 'wiki': return renderWiki();
      case 'projects': return renderPlaceholder('项目', 'Projects');
      case 'automation': return renderPlaceholder('自动化', 'Automation');
      case 'usage': return renderPlaceholder('用量', 'Usage');
      default: return renderInbox();
    }
  }

  /* ── Inbox ── */
  function renderInbox() {
    const items = state.data.inboxItems || [];
    const selected = items.find(i => i.id === state.selectedInboxId) || items[0];
    const issue = selected ? getIssue(selected.issueId) : null;
    return `<div class="inbox-layout" data-req-id="V2-INBOX">
      <div class="inbox-list">
        <div class="inbox-list-header">收件箱</div>
        ${items.map(item => {
          const active = item.id === (selected?.id) ? ' active' : '';
          const unread = item.unread ? ' unread' : '';
          return `<div class="inbox-item${active}${unread}" data-inbox-id="${item.id}">
            <div class="inbox-status-dot ${item.status || 'success'}"></div>
            <div>
              <div class="inbox-item-title">${escapeHtml(item.title)}</div>
              <div class="inbox-item-snippet">${escapeHtml(item.snippet)}</div>
              <div class="inbox-item-time">${formatTime(item.timestamp)}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="inbox-detail">
        ${issue ? renderIssueDetailContent(issue) : '<p style="color:var(--text-dim)">选择一封通知</p>'}
      </div>
    </div>`;
  }

  function renderIssueDetailContent(issue) {
    return `
      <div class="issue-id-badge">${issue.identifier}</div>
      <h1 class="detail-title">${escapeHtml(issue.title)}</h1>
      <p class="detail-desc">${escapeHtml(issue.description || '')}</p>
      <div class="timeline" data-req-id="ISS-005">
        <div class="timeline-header">动态 · ${(issue.comments || []).length} 条</div>
        ${(issue.comments || []).map(c => renderComment(c)).join('')}
      </div>`;
  }

  function renderComment(c) {
    let author = c.authorName || 'Unknown';
    if (c.authorType === 'agent' && c.authorId) author = getAgent(c.authorId)?.name || c.authorId;
    const delegated = c.delegated ? '<span class="delegated-tag">已委派</span>' : '';
    return `<div class="timeline-item">
      <div class="timeline-meta">
        <span class="timeline-author">${escapeHtml(author)}</span>
        <span class="timeline-time">${formatTime(c.timestamp)}</span>${delegated}
      </div>
      <div class="timeline-body">${parseMentions(c.body)}</div>
    </div>`;
  }

  /* ── Kanban Board ── */
  function renderBoard(scope) {
    const issues = filterIssues(scope);
    const title = scope === 'my-issues' ? '我的 issue' : 'Issues';
    return `<div data-req-id="V2-BOARD">
      <div class="page-header">
        <div><div class="page-title">${title}</div></div>
        <div class="page-actions">
          <button type="button" class="btn btn-primary" id="btn-new-issue-board">+ 新建 issue</button>
        </div>
      </div>
      <div class="board-toolbar">
        <div class="filter-tabs">
          <button type="button" class="filter-tab${state.boardFilter === 'all' ? ' active' : ''}" data-filter="all">全部</button>
          <button type="button" class="filter-tab${state.boardFilter === 'assigned' ? ' active' : ''}" data-filter="assigned">已分配</button>
          <button type="button" class="filter-tab${state.boardFilter === 'created' ? ' active' : ''}" data-filter="created">我创建的</button>
        </div>
        <div class="board-view-toggle">
          <button type="button" class="view-btn active" data-req-id="V2-BOARD-VIEW">看板</button>
          <button type="button" class="view-btn">列表</button>
        </div>
      </div>
      <div class="kanban" data-req-id="ISS-001">
        ${KANBAN_COLS.map(col => {
          const colIssues = issues.filter(i => i.status === col);
          return `<div class="kanban-col" data-col="${col}">
            <div class="col-header ${col}"><span class="status-dot"></span><span>${KANBAN_LABELS[col]}</span><span class="col-count">${colIssues.length}</span></div>
            <div class="col-body" data-drop="${col}">
              ${colIssues.length ? colIssues.map(i => renderIssueCard(i)).join('') : '<div class="col-empty">无 issue</div>'}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function renderIssueCard(issue) {
    const squad = issue.assignee?.type === 'squad';
    return `<article class="issue-card" draggable="true" data-issue-id="${issue.id}" data-req-id="ISS-003">
      <div class="card-id" data-req-id="ISS-009">${issue.identifier}</div>
      <div class="card-title">${escapeHtml(issue.title)}</div>
      <div class="card-footer">
        <span class="assignee-badge${squad ? ' squad' : ''}">${escapeHtml(assigneeLabel(issue))}</span>
        <span class="card-time">${formatTime(issue.updatedAt)}</span>
      </div>
    </article>`;
  }

  /* ── Agents ── */
  function renderAgentsList() {
    let agents = state.data.agents.filter(a => !a.archived);
    if (state.agentsSearch) {
      const q = state.agentsSearch.toLowerCase();
      agents = agents.filter(a => a.name.toLowerCase().includes(q));
    }
    const user = state.data.user || {};
    return `<div data-req-id="V2-AGENTS">
      <div class="page-header">
        <div>
          <div class="page-title">智能体 <span class="count">${agents.length}</span></div>
          <div class="page-desc">能够领取 issue，留下评论，推进状态的 AI 队友。</div>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn-primary" id="btn-new-agent">+ 新建智能体</button>
        </div>
      </div>
      <div class="filter-pills">
        <button type="button" class="filter-pill${state.agentFilter === 'mine' ? ' active' : ''}" data-agent-filter="mine">我的 ${agents.length}</button>
        <button type="button" class="filter-pill${state.agentFilter === 'all' ? ' active' : ''}" data-agent-filter="all">全部 ${agents.length}</button>
        <button type="button" class="filter-pill" data-agent-filter="archived">已归档 0</button>
      </div>
      <div class="table-search">
        <input type="search" id="agents-search" placeholder="搜索智能体..." value="${escapeHtml(state.agentsSearch)}" />
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>智能体</th><th>状态</th><th>Owner</th><th>运行时</th><th>最近活跃</th><th>运行次数</th>
          </tr></thead>
          <tbody>
            ${agents.map(ag => `<tr class="clickable" data-agent-id="${ag.id}">
              <td><div class="agent-cell">
                <div class="agent-icon">🤖</div>
                <div><div class="agent-name">${escapeHtml(ag.name)}</div><div class="agent-category">${escapeHtml(ag.category || '')}</div></div>
              </div></td>
              <td><span class="status-online"><span class="status-dot-green"></span> 在线</span></td>
              <td><div class="owner-cell"><span class="avatar">${escapeHtml(user.initials || 'LY')}</span>${escapeHtml(user.name || '林远')}</div></td>
              <td>${escapeHtml(ag.runtimeLabel || ag.runtime)}</td>
              <td>${formatRelative(ag.lastActive)}</td>
              <td>${ag.runCount || 0}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function renderAgentDetail() {
    const ag = getAgent(state.selectedAgentId);
    if (!ag) return '<p>Agent not found</p>';
    const skills = (ag.skillIds || []).map(id => getSkill(id)?.name).filter(Boolean);
    const user = state.data.user || {};
    return `<div data-req-id="V2-AGENT-DETAIL">
      <div class="breadcrumb">
        <button type="button" data-nav="agents">智能体</button> › <span class="current">${escapeHtml(ag.name)}</span>
        <span class="status-online" style="margin-left:8px"><span class="status-dot-green"></span> 在线</span>
      </div>
      <div class="agent-detail-layout">
        <div class="agent-profile">
          <div class="agent-profile-icon">🤖</div>
          <div class="agent-profile-name">${escapeHtml(ag.name)}</div>
          <div class="agent-profile-cat">${escapeHtml(ag.category || '')}</div>
          <div class="profile-section">
            <h4>属性</h4>
            <div class="prop-row"><span class="prop-label">运行时</span><span>${escapeHtml(ag.runtimeLabel || ag.runtime)}</span></div>
            <div class="prop-row"><span class="prop-label">模型</span><span>${ag.model || 'auto'}</span></div>
            <div class="prop-row"><span class="prop-label">可见性</span><span>工作区</span></div>
            <div class="prop-row"><span class="prop-label">并发</span><span>${ag.concurrency || 4}</span></div>
          </div>
          <div class="profile-section">
            <h4>详情</h4>
            <div class="prop-row"><span class="prop-label">所有者</span><span>${escapeHtml(user.name || '')}</span></div>
            <div class="prop-row"><span class="prop-label">创建时间</span><span>${formatRelative(ag.createdAt)}</span></div>
          </div>
          <div class="profile-section">
            <h4>SKILLS (${skills.length})</h4>
            <div class="skill-tags">${skills.map(s => `<span class="skill-tag">${escapeHtml(s)}</span>`).join('')}</div>
          </div>
        </div>
        <div class="agent-main">
          <div class="detail-tabs" data-req-id="V2-AGENT-TABS">
            ${AGENT_TABS.map(t => `<button type="button" class="detail-tab${state.agentDetailTab === t.id ? ' active' : ''}" data-agent-tab="${t.id}">${t.label}</button>`).join('')}
          </div>
          <div class="detail-tab-content">${renderAgentTabContent(ag)}</div>
        </div>
      </div>
    </div>`;
  }

  function renderAgentTabContent(ag) {
    switch (state.agentDetailTab) {
      case 'activity':
        return `<div class="stats-card">
          <div style="color:var(--text-dim);font-size:var(--text-sm);margin-bottom:8px">近 30 天表现</div>
          <div class="stats-big">${ag.runCount || 0} 次运行</div>
          <div class="stats-sub">84% 成功 · 平均 2m 05s</div>
        </div>
        <h4 style="font-size:var(--text-sm);color:var(--text-muted);margin-bottom:12px">最近工作</h4>
        ${(ag.recentTasks || []).map(t => `<div class="task-list-item">
          <span class="task-check">✓</span>
          <div><strong>${t.identifier}</strong> ${escapeHtml(t.title)}<br><span style="color:var(--text-dim);font-size:var(--text-xs)">${formatTime(t.timestamp)} · ${t.duration}</span></div>
        </div>`).join('') || '<p style="color:var(--text-dim)">无进行中的工作</p>'}`;
      case 'instructions':
        return `<pre style="white-space:pre-wrap;font-size:var(--text-sm);color:var(--text-muted)">${escapeHtml(ag.instructions || '')}</pre>`;
      case 'skills':
        return (ag.skillIds || []).map(id => {
          const sk = getSkill(id);
          return sk ? `<div style="padding:8px 0;border-bottom:1px solid var(--border-subtle)">${escapeHtml(sk.name)}</div>` : '';
        }).join('') || '<p style="color:var(--text-dim)">未分配 Skill</p>';
      case 'mcp':
        return `<p style="color:var(--text-dim)">暂无 MCP server 配置</p><button type="button" class="btn btn-secondary" id="btn-add-mcp">+ Add MCP Server</button>`;
      default:
        return `<p style="color:var(--text-dim)">Phase 2 — ${state.agentDetailTab} 配置</p>`;
    }
  }

  /* ── Squads ── */
  function renderSquadsList() {
    const squads = state.data.squads || [];
    return `<div data-req-id="V2-SQUADS">
      <div class="page-header">
        <div><div class="page-title">小队 <span class="count">${squads.length}</span></div></div>
        <div class="page-actions"><button type="button" class="btn btn-primary">+ 新建小队</button></div>
      </div>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>小队</th><th>队长</th><th>成员</th><th>创建者</th></tr></thead>
          <tbody>
            ${squads.map(sq => {
              const leader = getAgent(sq.leaderId);
              const memberCount = (sq.memberIds || []).length + 1;
              return `<tr class="clickable" data-squad-id="${sq.id}">
                <td><strong>${escapeHtml(sq.name)}</strong></td>
                <td>${escapeHtml(leader?.name || '')}</td>
                <td>${memberCount} 人</td>
                <td>${escapeHtml(sq.creatorName || '林远')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function renderSquadDetail() {
    const sq = getSquad(state.selectedSquadId);
    if (!sq) return '<p>Squad not found</p>';
    const leader = getAgent(sq.leaderId);
    const members = (sq.memberIds || []).map(id => getAgent(id)).filter(Boolean);
    return `<div data-req-id="V2-SQUAD-DETAIL">
      <div class="breadcrumb">
        <button type="button" data-nav="squads">小队</button> › <span class="current">${escapeHtml(sq.name)}</span>
      </div>
      <div class="squad-detail-layout">
        <div class="squad-profile">
          <h2 style="font-size:var(--text-lg);margin-bottom:12px">${escapeHtml(sq.name)}</h2>
          <div class="prop-row"><span class="prop-label">队长</span><span>${escapeHtml(leader?.name || '')}</span></div>
          <div class="prop-row"><span class="prop-label">Issue</span><span>${sq.issueCount || 0}</span></div>
          <div class="profile-section">
            <h4>成员 (${members.length + 1})</h4>
            <ul class="member-list">
              <li class="member-item member-leader">★ ${escapeHtml(leader?.name || '')} (队长)</li>
              ${members.map(m => `<li class="member-item"><span class="mention-pill">@${escapeHtml(m.name)}</span></li>`).join('')}
            </ul>
          </div>
        </div>
        <div class="agent-main">
          <div class="detail-tabs">
            ${SQUAD_TABS.map(t => `<button type="button" class="detail-tab${state.squadDetailTab === t.id ? ' active' : ''}" data-squad-tab="${t.id}">${t.label}</button>`).join('')}
          </div>
          <div class="detail-tab-content">
            ${state.squadDetailTab === 'members' ? renderSquadMembers(sq, leader, members) : renderSquadInstructions(sq)}
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderSquadMembers(sq, leader, members) {
    return `<div data-req-id="SQD-002">
      <h4 style="margin-bottom:12px">Roster</h4>
      <ul class="member-list">
        <li class="member-item member-leader">★ ${escapeHtml(leader?.name || '')} — Leader</li>
        ${members.map(m => `<li class="member-item">${escapeHtml(m.name)} <span class="mention-pill">@${escapeHtml(m.name)}</span></li>`).join('')}
      </ul>
      <div class="briefing-block" style="margin-top:24px" data-req-id="SQD-003">
        <div class="briefing-head">Operating Protocol</div>
        <div class="briefing-body">${escapeHtml(sq.operatingProtocol || '')}</div>
      </div>
    </div>`;
  }

  function renderSquadInstructions(sq) {
    return `<div class="briefing-block">
      <div class="briefing-head">Mission Directive</div>
      <div class="briefing-body">${escapeHtml(sq.missionDirective || '')}</div>
    </div>`;
  }

  /* ── Skills ── */
  function renderSkills() {
    let skills = state.data.skills || [];
    if (state.skillsSearch) {
      const q = state.skillsSearch.toLowerCase();
      skills = skills.filter(s => s.name.toLowerCase().includes(q));
    }
    return `<div data-req-id="V2-SKILLS">
      <div class="page-header">
        <div>
          <div class="page-title">Skills <span class="count">${skills.length}</span></div>
          <div class="page-desc">工作区里任何智能体都能使用的指令。</div>
        </div>
        <div class="page-actions"><button type="button" class="btn btn-primary" id="btn-new-skill">+ 新建 skill</button></div>
      </div>
      <div class="table-search">
        <input type="search" id="skills-search" placeholder="搜索 skill..." value="${escapeHtml(state.skillsSearch)}" />
      </div>
      <div class="data-table-wrap">
        <table class="data-table" data-req-id="SKL-002">
          <thead><tr><th>名称</th><th>被谁使用</th><th>添加者</th><th>更新时间</th></tr></thead>
          <tbody>
            ${skills.map(sk => `<tr>
              <td>${escapeHtml(sk.name)}</td>
              <td>${sk.usedBy ? escapeHtml(sk.usedBy.label) : '— 未使用'}</td>
              <td><div class="owner-cell"><span class="avatar">${escapeHtml((sk.addedBy?.name || 'LY').slice(0, 2))}</span>${escapeHtml(sk.addedBy?.name || '')}</div></td>
              <td>${formatRelative(sk.updatedAt)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  /* ── Settings ── */
  function renderSettings() {
    const ws = state.data.workspace || {};
    const user = state.data.user || {};
    const accountSections = SETTINGS_SECTIONS.filter(s => s.group === 'account');
    const wsSections = SETTINGS_SECTIONS.filter(s => s.group === 'workspace');
    return `<div class="settings-layout" data-req-id="V2-SETTINGS">
      <nav class="settings-nav">
        <h3>设置</h3>
        <div class="settings-group">
          <div class="settings-group-label">我的账号</div>
          ${accountSections.map(s => `<button type="button" class="settings-nav-item${state.settingsSection === s.id ? ' active' : ''}" data-settings="${s.id}">${s.label}</button>`).join('')}
        </div>
        <div class="settings-group">
          <div class="settings-group-label">${escapeHtml(ws.name || 'Workspace')}</div>
          ${wsSections.map(s => `<button type="button" class="settings-nav-item${state.settingsSection === s.id ? ' active' : ''}" data-settings="${s.id}">${s.label}</button>`).join('')}
        </div>
      </nav>
      <div class="settings-main">${renderSettingsContent(user)}</div>
    </div>`;
  }

  function renderSettingsContent(user) {
    if (state.settingsSection !== 'profile') {
      return `<div class="settings-card"><p style="color:var(--text-dim)">Phase 2 — ${state.settingsSection} 配置</p></div>`;
    }
    return `<h2 style="font-size:var(--text-xl);margin-bottom:20px">个人资料</h2>
      <div class="settings-card">
        <div class="avatar-upload">
          <div class="avatar-large">${escapeHtml(user.initials || 'LY')}</div>
          <span style="color:var(--text-muted);font-size:var(--text-sm)">点击上传头像</span>
        </div>
        <div class="form-group">
          <label for="profile-name">姓名</label>
          <input type="text" id="profile-name" class="form-control" value="${escapeAttr(user.name || '')}" />
        </div>
        <div class="form-group">
          <label for="profile-about">关于你</label>
          <textarea id="profile-about" class="form-control" maxlength="2000">${escapeHtml(user.about || '')}</textarea>
          <div class="char-count">${(user.about || '').length}/2000</div>
        </div>
        <div style="text-align:right;margin-top:16px">
          <button type="button" class="btn btn-primary" id="btn-save-profile">更新资料</button>
        </div>
      </div>`;
  }

  function escapeAttr(str) { return escapeHtml(str).replace(/'/g, '&#39;'); }

  /* ── Runtime ── */
  function renderRuntime() {
    const machines = state.data.machines || [];
    const machine = getMachine(state.selectedMachineId) || machines[0];
    const runtimes = (state.data.runtimes || []).filter(r => r.machineId === machine?.id);
    return `<div class="runtime-layout" data-req-id="V2-RUNTIME">
      <div class="machine-list">
        <div class="machine-list-header">运行时 ${runtimes.length}</div>
        <div class="machine-filters">
          <button type="button" class="machine-filter active">全部 ${machines.length}</button>
          <button type="button" class="machine-filter">在线 ${machines.length}</button>
        </div>
        <div style="padding:8px 16px;font-size:var(--text-xs);color:var(--text-dim)">本机</div>
        ${machines.map(m => `<div class="machine-item${m.id === machine?.id ? ' active' : ''}" data-machine-id="${m.id}">
          <div class="machine-item-name">${escapeHtml(m.name)}</div>
          <div class="machine-item-meta">${m.runtimeCount || 0} 个运行时</div>
          <span class="machine-tag">本机</span>
        </div>`).join('')}
      </div>
      <div class="runtime-detail">
        ${machine ? `<div class="runtime-detail-header">
          <div class="runtime-detail-title"><span class="status-dot-green"></span> ${escapeHtml(machine.name)} <span style="font-size:var(--text-sm);color:var(--text-dim)">在线</span></div>
          <div class="runtime-meta">${runtimes.length} 个运行时 · ${runtimes.length} 个在线 · ${machine.version} · daemon ${machine.daemonId?.slice(0, 12)}...</div>
          <div class="runtime-actions">
            <button type="button" class="btn btn-secondary btn-sm">+ 添加运行时</button>
            <button type="button" class="btn btn-ghost btn-sm">View logs</button>
            <button type="button" class="btn btn-ghost btn-sm">Restart</button>
          </div>
        </div>
        <div class="data-table-wrap" style="padding:0">
          <table class="data-table">
            <thead><tr><th>运行时</th><th>健康度</th><th>智能体</th><th>费用 - 7天</th><th>CLI</th></tr></thead>
            <tbody>
              ${runtimes.map(rt => `<tr>
                <td><span class="runtime-type-icon">${rt.type === 'Claude' ? '☀' : rt.type === 'Cursor' ? '◧' : '▣'}</span> ${escapeHtml(rt.name)} <span style="color:var(--text-dim);font-size:var(--text-xs)">[内置]</span></td>
                <td><span class="status-online"><span class="status-dot-green"></span> 在线</span></td>
                <td>${rt.agentIds?.length ? rt.agentIds.length + ' 个' : '—'}</td>
                <td>${rt.cost7d != null ? '$' + rt.cost7d.toFixed(2) : '—'}</td>
                <td style="font-family:var(--font-mono);font-size:var(--text-xs)">${escapeHtml(rt.cliVersion || '')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : '<p>选择机器</p>'}
      </div>
    </div>`;
  }

  /* ── Wiki ── */
  function renderWiki() {
    const page = state.data.wikiPages.find(p => p.id === state.selectedWikiId) || state.data.wikiPages[0];
    return `<div class="wiki-layout" data-req-id="WIK-001">
      <nav class="wiki-tree" aria-label="Wiki navigation">
        <ul>${state.data.wikiPages.map(p => {
          const active = p.id === page?.id ? ' active' : '';
          return `<li><button type="button" class="wiki-node${active}" data-wiki-id="${p.id}">${escapeHtml(p.title)}</button></li>`;
        }).join('')}</ul>
      </nav>
      <article class="wiki-article" data-req-id="WIK-002">${page ? page.content : '<p>选择页面</p>'}</article>
    </div>`;
  }

  function renderPlaceholder(title, en) {
    return `<div class="placeholder-page" data-req-id="V2-PLACEHOLDER">
      <h2>${title}</h2>
      <span class="placeholder-badge">Phase 2</span>
      <p>${en} module — coming in Phase 2</p>
    </div>`;
  }

  /* ── Modals ── */
  function renderModal() {
    const root = document.getElementById('modal-root');
    if (!root) return;
    if (!state.modal) { root.innerHTML = ''; return; }

    if (state.modal === 'command-palette') {
      root.innerHTML = renderCommandPalette();
    } else if (state.modal === 'new-issue-agent' || state.modal === 'new-issue-manual') {
      root.innerHTML = renderNewIssueModal();
    }
    bindModalEvents();
  }

  function renderCommandPalette() {
    const q = state.paletteQuery.toLowerCase();
    const recent = state.data.issues.filter(i => !q || i.identifier.toLowerCase().includes(q) || i.title.toLowerCase().includes(q)).slice(0, 6);
    return `<div class="modal-backdrop" id="modal-backdrop" data-req-id="MOD-PALETTE">
      <div class="command-palette" role="dialog" aria-label="命令面板">
        <div class="palette-search">
          <span>⌕</span>
          <input type="text" id="palette-input" placeholder="输入命令或关键词搜索..." value="${escapeAttr(state.paletteQuery)}" autofocus />
          <span class="kbd-hint">ESC</span>
        </div>
        <div class="palette-section">
          <div class="palette-section-label">命令</div>
          <div class="palette-item" id="palette-new-issue"><span>+</span> 新建 issue</div>
        </div>
        <div class="palette-section">
          <div class="palette-section-label">最近</div>
          ${recent.map(i => `<div class="palette-item" data-palette-issue="${i.id}">
            <span class="palette-item-id">${i.identifier}</span>
            <span>${escapeHtml(i.title)}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  function renderNewIssueModal() {
    const isAgent = state.newIssueMode === 'agent';
    const ws = state.data.workspace?.name || 'Workspace';
    return `<div class="modal-backdrop issue-modal-wrap" id="modal-backdrop" data-req-id="MOD-NEW-ISSUE">
      <div class="issue-modal" role="dialog">
        <div class="issue-modal-header">
          <span>${escapeHtml(ws)} › ${isAgent ? '智能体创建' : '手动创建'}</span>
          <button type="button" id="modal-close">✕</button>
        </div>
        ${isAgent ? `
          <div class="agent-mode-body">
            <label style="font-size:var(--text-sm);color:var(--text-muted)">创建者</label>
            <div class="owner-cell" style="margin:8px 0 16px"><span class="avatar">LY</span>林远</div>
            <input type="search" class="agent-search" id="agent-search-input" placeholder="搜索智能体..." />
            <div id="agent-suggestions">
              ${state.data.agents.slice(0, 4).map(ag => `<div class="agent-suggestion${state.newIssueDraft.assigneeId === ag.id ? ' selected' : ''}" data-agent-pick="${ag.id}">
                <div class="agent-icon">🤖</div>
                <div><div class="agent-name">${escapeHtml(ag.name)}</div><div class="agent-category">${escapeHtml(ag.category || '')}</div></div>
              </div>`).join('')}
            </div>
            <textarea class="form-control" id="agent-issue-desc" rows="4" placeholder="描述你的需求，智能体将自动创建 issue..." style="margin-top:16px"></textarea>
          </div>
        ` : `
          <div class="issue-modal-body">
            <input type="text" class="issue-modal-title" id="issue-title" placeholder="issue 标题" value="${escapeAttr(state.newIssueDraft.title)}" />
            <textarea class="issue-modal-desc" id="issue-desc" placeholder="添加描述...">${escapeHtml(state.newIssueDraft.description)}</textarea>
          </div>
          <div class="issue-modal-pills">
            <span class="meta-pill in_review">● 审核中</span>
            <span class="meta-pill">— 无优先级</span>
            <span class="meta-pill">👤 ${escapeHtml(getAgent(state.newIssueDraft.assigneeId)?.name || '未指派')}</span>
            <span class="meta-pill">🏷 添加标签</span>
            <span class="meta-pill">📁 无项目</span>
          </div>
        `}
        <div class="issue-modal-footer">
          <button type="button" class="btn btn-ghost" id="btn-switch-mode">${isAgent ? '⇄ 切换到手动' : '⇄ 切换到智能体'}</button>
          <button type="button" class="btn btn-primary" id="btn-create-issue">创建 Issue</button>
        </div>
      </div>
    </div>`;
  }

  /* ── Event binding ── */
  function bindShellEvents() {
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.dataset.nav;
        state.selectedAgentId = null;
        state.selectedSquadId = null;
        navigate(nav);
      });
    });

    document.getElementById('btn-open-palette')?.addEventListener('click', () => openModal('command-palette'));
    document.getElementById('btn-new-issue-sidebar')?.addEventListener('click', () => openModal('new-issue-agent'));
    document.getElementById('btn-new-issue-board')?.addEventListener('click', () => openModal('new-issue-agent'));
    document.getElementById('btn-tab-add')?.addEventListener('click', () => {
      tabCounter++;
      const id = 'tab-' + tabCounter;
      state.tabs.push({ id, view: state.view, label: VIEW_LABELS[state.view] });
      state.activeTabId = id;
      render();
    });

    document.querySelectorAll('.inbox-item').forEach(el => {
      el.addEventListener('click', () => { state.selectedInboxId = el.dataset.inboxId; render(); });
    });

    document.querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => { state.boardFilter = btn.dataset.filter; render(); });
    });

    bindKanbanDrag();

    document.querySelectorAll('[data-agent-id]').forEach(row => {
      if (row.tagName === 'TR') {
        row.addEventListener('click', () => {
          state.selectedAgentId = row.dataset.agentId;
          navigate('agent-detail', { label: getAgent(row.dataset.agentId)?.name });
        });
      }
    });

    document.getElementById('btn-new-agent')?.addEventListener('click', () => showToast('Phase 2 — 新建智能体向导'));

    document.querySelectorAll('[data-agent-tab]').forEach(btn => {
      btn.addEventListener('click', () => { state.agentDetailTab = btn.dataset.agentTab; render(); });
    });

    document.querySelectorAll('[data-squad-id]').forEach(row => {
      row.addEventListener('click', () => {
        state.selectedSquadId = row.dataset.squadId;
        navigate('squad-detail', { label: getSquad(row.dataset.squadId)?.name });
      });
    });

    document.querySelectorAll('[data-squad-tab]').forEach(btn => {
      btn.addEventListener('click', () => { state.squadDetailTab = btn.dataset.squadTab; render(); });
    });

    document.getElementById('skills-search')?.addEventListener('input', e => {
      state.skillsSearch = e.target.value;
      render();
    });

    document.getElementById('agents-search')?.addEventListener('input', e => {
      state.agentsSearch = e.target.value;
      render();
    });

    document.getElementById('btn-new-skill')?.addEventListener('click', () => showToast('Phase 2 — 新建 skill'));

    document.querySelectorAll('[data-settings]').forEach(btn => {
      btn.addEventListener('click', () => { state.settingsSection = btn.dataset.settings; render(); });
    });

    document.getElementById('btn-save-profile')?.addEventListener('click', () => {
      const name = document.getElementById('profile-name')?.value;
      const about = document.getElementById('profile-about')?.value;
      if (state.data.user) { state.data.user.name = name; state.data.user.about = about; }
      showToast('资料已更新（mock）');
    });

    document.querySelectorAll('[data-machine-id]').forEach(el => {
      el.addEventListener('click', () => { state.selectedMachineId = el.dataset.machineId; render(); });
    });

    document.querySelectorAll('.wiki-node').forEach(btn => {
      btn.addEventListener('click', () => { state.selectedWikiId = btn.dataset.wikiId; render(); });
    });

    document.getElementById('btn-add-mcp')?.addEventListener('click', () => showToast('MCP 配置入口（mock）'));
  }

  function bindKanbanDrag() {
    let dragId = null;
    document.querySelectorAll('.issue-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragId = card.dataset.issueId;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        dragId = null;
      });
      card.addEventListener('click', () => {
        const issue = getIssue(card.dataset.issueId);
        if (issue) {
          state.selectedInboxId = state.data.inboxItems?.find(i => i.issueId === issue.id)?.id;
          navigate('inbox');
        }
      });
    });

    document.querySelectorAll('.col-body').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drag-over');
        if (!dragId) return;
        const issue = getIssue(dragId);
        const newStatus = col.dataset.drop;
        if (issue && issue.status !== newStatus) {
          issue.status = newStatus;
          render();
        }
      });
    });
  }

  function bindModalEvents() {
    document.getElementById('modal-backdrop')?.addEventListener('click', e => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });
    document.getElementById('modal-close')?.addEventListener('click', closeModal);

    document.getElementById('palette-input')?.addEventListener('input', e => {
      state.paletteQuery = e.target.value;
      renderModal();
      document.getElementById('palette-input')?.focus();
    });

    document.getElementById('palette-new-issue')?.addEventListener('click', () => {
      closeModal();
      openModal('new-issue-agent');
    });

    document.querySelectorAll('[data-palette-issue]').forEach(el => {
      el.addEventListener('click', () => {
        const issue = getIssue(state.data.issues.find(i => i.id === el.dataset.paletteIssue)?.id);
        if (issue) {
          state.selectedInboxId = state.data.inboxItems?.find(i => i.issueId === issue.id)?.id;
          closeModal();
          navigate('inbox');
        }
      });
    });

    document.getElementById('btn-switch-mode')?.addEventListener('click', () => {
      state.newIssueMode = state.newIssueMode === 'agent' ? 'manual' : 'agent';
      state.modal = state.newIssueMode === 'agent' ? 'new-issue-agent' : 'new-issue-manual';
      renderModal();
    });

    document.querySelectorAll('[data-agent-pick]').forEach(el => {
      el.addEventListener('click', () => { state.newIssueDraft.assigneeId = el.dataset.agentPick; renderModal(); });
    });

    document.getElementById('btn-create-issue')?.addEventListener('click', () => {
      const isAgent = state.newIssueMode === 'agent';
      const title = isAgent
        ? (document.getElementById('agent-issue-desc')?.value.trim().slice(0, 60) || '智能体创建的 issue')
        : (document.getElementById('issue-title')?.value.trim() || '新 Issue');
      const desc = isAgent
        ? (document.getElementById('agent-issue-desc')?.value || '')
        : (document.getElementById('issue-desc')?.value || '');
      const num = state.data.issues.length + 1;
      const id = 'iss-new-' + Date.now();
      const newIssue = {
        id,
        identifier: 'FRI-' + num,
        title,
        description: desc,
        status: 'todo',
        priority: 'medium',
        assignee: { type: 'agent', id: state.newIssueDraft.assigneeId },
        updatedAt: new Date().toISOString(),
        comments: []
      };
      state.data.issues.push(newIssue);
      closeModal();
      showToast(`Issue「${title}」已创建（mock）`);
      navigate('issues');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
