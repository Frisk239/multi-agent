'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  useInbox,
  useInboxUnreadCount,
  useIssues,
  useRunsActiveCount,
  useWikiJobs,
} from '@/lib/api';
import { useWsStore } from '@/lib/ws';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { CommandPalette } from './CommandPalette';
import { QuickDispatchPanel } from './QuickDispatchPanel';
import { useTheme } from '@/lib/theme';

type NavItem = {
  id: string;
  label: string;
  icon: IconName;
  section: string;
  href?: string;
  badge?: number;
  /** 未读失败数：角标强调色 */
  failBadge?: number;
};

// 侧栏 IA：Multica 工作区 + 本仓「知识 · 观测」超车（非运维腔）
// 调研结论：Hermes dashboard / Sidecar Mission Control 把 run 观测与知识产物分列；
// llm-wiki 模式强调 Wiki 为编译式知识层、Memory 为可插拔会话层——与 Issue 派活闭环，而非纯运维。
const NAV_ITEMS: NavItem[] = [
  { id: 'inbox', label: '收件箱', icon: 'inbox', section: 'personal', href: '/inbox' },
  { id: 'chat', label: '聊天', icon: 'user', section: 'personal', href: '/chat' },
  {
    id: 'my-issues',
    label: '我的 issue',
    icon: 'user',
    section: 'personal',
    href: '/my-issues',
  },
  { id: 'issues', label: 'Issues', icon: 'issues', section: 'workspace', href: '/' },
  { id: 'projects', label: '项目', icon: 'project', section: 'workspace', href: '/projects' },
  { id: 'automation', label: '自动化', icon: 'automation', section: 'workspace', href: '/automation' },
  { id: 'agents', label: '智能体', icon: 'agent', section: 'workspace', href: '/agents' },
  { id: 'squads', label: '小队', icon: 'squad', section: 'workspace', href: '/squads' },
  { id: 'usage', label: '用量', icon: 'usage', section: 'workspace', href: '/usage' },
  // 知识层（编译式 Wiki + 可插拔记忆）— 先于 run 观测，贴近「读知识 / 写经验」
  { id: 'wiki', label: 'Wiki', icon: 'wiki', section: 'knowledge', href: '/wiki' },
  { id: 'memory', label: '记忆', icon: 'memory', section: 'knowledge', href: '/memory' },
  // 运行观测（Sidecar Mission Control 式）
  { id: 'runs', label: '运行', icon: 'usage', section: 'observe', href: '/runs' },
  { id: 'runtime', label: '本机 CLI', icon: 'runtime', section: 'config', href: '/runtimes' },
  { id: 'skills', label: 'Skills', icon: 'skills', section: 'config', href: '/skills' },
  { id: 'settings', label: '设置', icon: 'settings', section: 'config', href: '/settings' },
];

function NavRow({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
}) {
  const hasFail = (item.failBadge ?? 0) > 0;
  const isRuns = item.id === 'runs';
  const badge =
    item.badge != null && item.badge > 0 ? (
      <span
        className={`nav-badge${hasFail ? ' nav-badge--fail' : ''}${isRuns ? ' nav-badge--active-runs' : ''}${
          collapsed ? ' nav-badge--collapsed' : ''
        }`}
        data-testid={
          item.id === 'inbox'
            ? 'nav-inbox-badge'
            : isRuns
              ? 'nav-runs-badge'
              : item.id === 'wiki'
                ? 'nav-wiki-badge'
                : undefined
        }
        data-fail={hasFail ? String(item.failBadge) : '0'}
        aria-label={
          isRuns
            ? `${item.badge} 个在途运行`
            : item.id === 'wiki'
              ? `${item.badge} 个 dead Wiki 编译任务`
            : hasFail
              ? `${item.badge} 未读，其中 ${item.failBadge} 条失败`
              : `${item.badge} 未读`
        }
        title={
          isRuns
            ? 'queued + running'
            : item.id === 'wiki'
              ? 'Wiki dead 编译任务'
            : hasFail
              ? `含 ${item.failBadge} 条未读失败`
              : undefined
        }
      >
        {item.badge > 99 ? '99+' : item.badge}
      </span>
    ) : null;

  const content = (
    <>
      <Icon name={item.icon} size={15} className="nav-icon-svg" />
      {!collapsed ? <span className="nav-item-label">{item.label}</span> : null}
      {badge}
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className={`nav-item${active ? ' active' : ''}${hasFail ? ' nav-item--has-fail' : ''}${
          collapsed ? ' nav-item--collapsed' : ''
        }`}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        data-testid={
          item.id === 'inbox'
            ? 'nav-inbox'
            : item.id === 'settings'
              ? 'nav-settings'
              : undefined
        }
      >
        {content}
      </Link>
    );
  }
  return (
    <span className="nav-item nav-item--disabled" aria-disabled="true" title={item.label}>
      {content}
    </span>
  );
}

function wsLabel(status: 'connecting' | 'open' | 'closed') {
  if (status === 'open') return '已连接';
  if (status === 'connecting') return '连接中';
  return '已断开';
}

/** Issues vs 我的 issue：独立路由 /my-issues（G24） */
function navItemActive(
  item: NavItem,
  pathname: string,
  _searchParams: URLSearchParams,
): boolean {
  if (item.id === 'my-issues') {
    return pathname === '/my-issues' || pathname.startsWith('/my-issues/');
  }
  if (item.id === 'issues') {
    return pathname === '/' || pathname.startsWith('/issues');
  }
  if (item.id === 'runs') {
    return pathname === '/runs' || pathname.startsWith('/runs/');
  }
  if (item.href && item.href !== '/' && !item.href.includes('?')) {
    return pathname.startsWith(item.href);
  }
  return false;
}

const SIDEBAR_COLLAPSED_KEY = 'ma-sidebar-collapsed';

function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, toggleTheme } = useTheme();
  const wsStatus = useWsStore((s) => s.status);
  const { data: issues = [] } = useIssues();
  const { data: inboxUnread } = useInboxUnreadCount();
  // 轻量：列表里数未读失败，驱动侧栏角标强调（与 Inbox strip 同源数据）
  const { data: inboxData } = useInbox();
  const { data: activeRuns } = useRunsActiveCount();
  const { data: wikiDeadJobs = [] } = useWikiJobs('dead');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickDispatchOpen, setQuickDispatchOpen] = useState(false);
  const [quickPrefill, setQuickPrefill] = useState<string | undefined>(undefined);
  const [collapsed, setCollapsed] = useState(false);
  const [collapseReady, setCollapseReady] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
    setCollapseReady(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // wiki-memory-ops D1：/runs「去快速派活」带 ?quickPrompt=
  useEffect(() => {
    const raw = searchParams.get('quickPrompt');
    if (!raw) return;
    setQuickPrefill(raw);
    setQuickDispatchOpen(true);
    router.replace(pathname || '/', { scroll: false });
  }, [searchParams, router, pathname]);

  const workingCount = useMemo(
    () =>
      issues.filter((i) => i.status === 'in_progress' || i.status === 'in_review').length,
    [issues],
  );

  const unreadFailCount = useMemo(() => {
    const items = inboxData?.items ?? [];
    return items.filter(
      (i) => !i.read && (i.kind === 'run_failed' || i.type === 'run_failed'),
    ).length;
  }, [inboxData?.items]);

  const navItems = useMemo(() => {
    const unread = inboxUnread?.count ?? 0;
    const activeCount = activeRuns?.count ?? 0;
    return NAV_ITEMS.map((item) => {
      if (item.id === 'inbox') {
        return { ...item, badge: unread, failBadge: unreadFailCount };
      }
      if (item.id === 'runs') {
        return {
          ...item,
          badge: activeCount,
          href: activeCount > 0 ? '/runs?status=active' : '/runs',
        };
      }
      if (item.id === 'wiki') {
        const dead = wikiDeadJobs.length;
        return {
          ...item,
          badge: dead,
          failBadge: dead > 0 ? dead : undefined,
          href: dead > 0 ? '/wiki?jobStatus=dead' : '/wiki',
        };
      }
      return item;
    });
  }, [inboxUnread?.count, unreadFailCount, activeRuns?.count, wikiDeadJobs.length]);

  const sections = [
    {
      key: 'personal',
      label: '', // Multica 顶部无「个人」小标题：收件箱/聊天/我的 issue 直接列出
      items: navItems.filter((n) => n.section === 'personal'),
    },
    {
      key: 'workspace',
      label: '工作区',
      items: navItems.filter((n) => n.section === 'workspace'),
    },
    {
      key: 'knowledge',
      label: '知识',
      items: navItems.filter((n) => n.section === 'knowledge'),
    },
    {
      key: 'observe',
      label: '观测',
      items: navItems.filter((n) => n.section === 'observe'),
    },
    {
      key: 'config',
      label: '配置',
      items: navItems.filter((n) => n.section === 'config'),
    },
  ];

  const isCollapsed = collapseReady && collapsed;

  return (
    <aside
      className={`sidebar${isCollapsed ? ' sidebar--collapsed' : ''}`}
      aria-label="主导航"
      data-testid="app-sidebar"
      data-collapsed={isCollapsed ? '1' : '0'}
    >
      <div className="sidebar-workspace">
        <svg
          className="workspace-logo"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
          <line x1="12" y1="8.8" x2="12" y2="4.5" />
          <circle cx="12" cy="3.5" r="2" />
          <line x1="9.2" y1="13.2" x2="5.8" y2="15.6" />
          <circle cx="4.8" cy="16.3" r="2" />
          <line x1="14.8" y1="13.2" x2="18.2" y2="15.6" />
          <circle cx="19.2" cy="16.3" r="2" />
        </svg>
        {!isCollapsed ? <span className="sidebar-workspace-name">Multi-Agent</span> : null}
        <button
          type="button"
          className="sidebar-collapse-btn"
          data-testid="sidebar-collapse-toggle"
          title={isCollapsed ? '展开侧栏' : '折叠侧栏'}
          aria-label={isCollapsed ? '展开侧栏' : '折叠侧栏'}
          aria-expanded={!isCollapsed}
          onClick={toggleCollapsed}
        >
          {isCollapsed ? '⟩' : '⟨'}
        </button>
      </div>

      {!isCollapsed ? (
        <div className="sidebar-status-row">
          <span
            className={`ws-chip ws-chip--${wsStatus}`}
            title={`WebSocket ${wsLabel(wsStatus)}`}
          >
            <span className="ws-chip-dot" aria-hidden="true" />
            {wsLabel(wsStatus)}
          </span>
          <span className="working-count" title="进行中 / 审核中">
            工作中 {workingCount}
          </span>
          {(activeRuns?.count ?? 0) > 0 ? (
            <Link
              href="/runs?status=active"
              className="active-runs-chip active-runs-chip--hot"
              data-testid="sidebar-active-runs"
              data-count={String(activeRuns?.count ?? 0)}
              title={`queued ${activeRuns?.queued ?? 0} · running ${activeRuns?.running ?? 0}`}
            >
              在途 {activeRuns?.count}
            </Link>
          ) : (
            <span
              className="active-runs-chip"
              data-testid="sidebar-active-runs"
              data-count="0"
              title="无 queued/running run"
            >
              在途 0
            </span>
          )}
          {unreadFailCount > 0 ? (
            <Link
              href="/inbox?kind=run_failed&read=unread"
              className="sidebar-fail-chip"
              data-testid="sidebar-fail-chip"
              data-count={String(unreadFailCount)}
              title={`${unreadFailCount} 条未读失败 · 打开收件箱`}
            >
              失败 {unreadFailCount > 99 ? '99+' : unreadFailCount}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="sidebar-scroll" data-testid="sidebar-scroll">
        <div className="sidebar-actions">
          <button
            type="button"
            className="sidebar-search"
            onClick={() => setPaletteOpen(true)}
            title="搜索"
          >
            <Icon name="search" size={14} className="nav-icon-svg" />
            {!isCollapsed ? (
              <>
                搜索...
                <span className="kbd-hint">Ctrl+K</span>
              </>
            ) : null}
          </button>
          <button
            type="button"
            className="sidebar-new-issue"
            title="快速派活"
            onClick={() => {
              setQuickPrefill(undefined);
              setQuickDispatchOpen(true);
            }}
          >
            <Icon name="plus" size={14} className="nav-icon-svg" />
            {!isCollapsed ? (
              <>
                快速派活
                <span className="kbd-hint">Q</span>
              </>
            ) : null}
          </button>
          <button
            type="button"
            className="sidebar-new-issue"
            title="新建 Issue"
            onClick={() => router.push('/?new=1')}
          >
            <Icon name="issues" size={14} className="nav-icon-svg" />
            {!isCollapsed ? (
              <>
                新建 Issue
                <span className="kbd-hint">C</span>
              </>
            ) : null}
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="页面导航">
          {sections.map((sec) => (
            <div className="nav-section" key={sec.key}>
              {sec.label && !isCollapsed ? (
                <div className="nav-section-label">{sec.label}</div>
              ) : null}
              <ul className="nav-list">
                {sec.items.map((item) => (
                  <li key={item.id}>
                    <NavRow
                      item={item}
                      active={navItemActive(item, pathname, searchParams)}
                      collapsed={isCollapsed}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="help-btn theme-toggle"
          title={theme === 'dark' ? '切换浅色' : '切换深色'}
          aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}
          data-testid="theme-toggle"
          data-theme={theme}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? '浅' : '深'}
        </button>
        <Link
          href="/settings"
          className="help-btn sidebar-settings-link"
          title="设置"
          aria-label="设置"
          data-testid="sidebar-settings-link"
        >
          <Icon name="settings" size={16} />
        </Link>
      </div>
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} />
      <QuickDispatchPanel
        open={quickDispatchOpen}
        onClose={() => {
          setQuickDispatchOpen(false);
          setQuickPrefill(undefined);
        }}
        initialPrompt={quickPrefill}
      />
    </aside>
  );
}
