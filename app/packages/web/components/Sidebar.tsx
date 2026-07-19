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

// S12：已实现路由；run-observability 增加「运行」
// issue-assignee-desk：侧栏「我的 issue」→ /?assignee=any
const NAV_ITEMS: NavItem[] = [
  { id: 'issues', label: 'Issues', icon: 'issues', section: 'workspace', href: '/' },
  {
    id: 'my-issues',
    label: '我的 issue',
    icon: 'user',
    section: 'workspace',
    href: '/?assignee=any',
  },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', section: 'workspace', href: '/inbox' },
  { id: 'chat', label: '聊天', icon: 'user', section: 'workspace', href: '/chat' },
  { id: 'projects', label: '项目', icon: 'project', section: 'workspace', href: '/projects' },
  // 有活跃 run 时 href 会被替换为 /runs?status=active
  { id: 'runs', label: '运行', icon: 'usage', section: 'workspace', href: '/runs' },
  { id: 'squads', label: '小队', icon: 'squad', section: 'workspace', href: '/squads' },
  { id: 'agents', label: '智能体', icon: 'agent', section: 'workspace', href: '/agents' },
  { id: 'usage', label: '用量', icon: 'usage', section: 'workspace', href: '/usage' },
  { id: 'wiki', label: 'Wiki', icon: 'wiki', section: 'workspace', href: '/wiki' },
  { id: 'memory', label: '记忆', icon: 'memory', section: 'workspace', href: '/memory' },
  { id: 'automation', label: '自动化', icon: 'automation', section: 'config', href: '/automation' },
  { id: 'runtime', label: '本机 CLI', icon: 'runtime', section: 'config', href: '/runtimes' },
  { id: 'skills', label: 'Skills', icon: 'skills', section: 'config', href: '/skills' },
  { id: 'settings', label: '设置', icon: 'settings', section: 'config', href: '/settings' },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const hasFail = (item.failBadge ?? 0) > 0;
  const isRuns = item.id === 'runs';
  const badge =
    item.badge != null && item.badge > 0 ? (
      <span
        className={`nav-badge${hasFail ? ' nav-badge--fail' : ''}${isRuns ? ' nav-badge--active-runs' : ''}`}
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
      <span className="nav-item-label">{item.label}</span>
      {badge}
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className={`nav-item${active ? ' active' : ''}${hasFail ? ' nav-item--has-fail' : ''}`}
        aria-current={active ? 'page' : undefined}
        data-testid={item.id === 'inbox' ? 'nav-inbox' : undefined}
      >
        {content}
      </Link>
    );
  }
  return (
    <span className="nav-item nav-item--disabled" aria-disabled="true">
      {content}
    </span>
  );
}

function wsLabel(status: 'connecting' | 'open' | 'closed') {
  if (status === 'open') return '已连接';
  if (status === 'connecting') return '连接中';
  return '已断开';
}

/** Issues vs 我的 issue：同 pathname `/`，靠 assignee= 区分高亮 */
function navItemActive(
  item: NavItem,
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  if (item.id === 'my-issues') {
    return pathname === '/' && searchParams.get('assignee') === 'any';
  }
  if (item.id === 'issues') {
    return pathname === '/' && searchParams.get('assignee') !== 'any';
  }
  if (item.id === 'runs') {
    return pathname === '/runs' || pathname.startsWith('/runs/');
  }
  if (item.href && item.href !== '/' && !item.href.includes('?')) {
    return pathname.startsWith(item.href);
  }
  return false;
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
      key: 'workspace',
      label: '工作区',
      items: navItems.filter((n) => n.section === 'workspace'),
    },
    {
      key: 'config',
      label: '配置',
      items: navItems.filter((n) => n.section === 'config'),
    },
  ];

  return (
    <aside className="sidebar" aria-label="主导航">
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
        <span>Multi-Agent</span>
      </div>

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
            title={`${unreadFailCount} 条未读失败 · 打开 Inbox`}
          >
            失败 {unreadFailCount > 99 ? '99+' : unreadFailCount}
          </Link>
        ) : null}
      </div>

      <div className="sidebar-actions">
        <button
          type="button"
          className="sidebar-search"
          onClick={() => setPaletteOpen(true)}
        >
          <Icon name="search" size={14} className="nav-icon-svg" />
          搜索...
          <span className="kbd-hint">Ctrl+K</span>
        </button>
        <button
          type="button"
          className="sidebar-new-issue"
          onClick={() => {
            setQuickPrefill(undefined);
            setQuickDispatchOpen(true);
          }}
        >
          <Icon name="plus" size={14} className="nav-icon-svg" />
          快速派活
          <span className="kbd-hint">Q</span>
        </button>
        <button
          type="button"
          className="sidebar-new-issue"
          onClick={() => router.push('/?new=1')}
        >
          <Icon name="issues" size={14} className="nav-icon-svg" />
          新建 Issue
          <span className="kbd-hint">C</span>
        </button>
      </div>
      <nav>
        {sections.map((sec) => (
          <div className="nav-section" key={sec.key}>
            {sec.label && <div className="nav-section-label">{sec.label}</div>}
            <ul className="nav-list">
              {sec.items.map((item) => (
                <li key={item.id}>
                  <NavRow
                    item={item}
                    active={navItemActive(item, pathname, searchParams)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
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
        <button type="button" className="help-btn" title="帮助" aria-label="帮助">
          <Icon name="help" size={16} />
        </button>
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
