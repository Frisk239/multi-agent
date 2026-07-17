'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useInboxUnreadCount, useIssues } from '@/lib/api';
import { useWsStore } from '@/lib/ws';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { CommandPalette } from './CommandPalette';
import { QuickDispatchPanel } from './QuickDispatchPanel';

type NavItem = {
  id: string;
  label: string;
  icon: IconName;
  section: string;
  href?: string;
  badge?: number;
};

// S12：只保留已实现路由（Inbox/Squads 本棒激活）
const NAV_ITEMS: NavItem[] = [
  { id: 'issues', label: 'Issues', icon: 'issues', section: 'workspace', href: '/' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', section: 'workspace', href: '/inbox' },
  { id: 'squads', label: '小队', icon: 'squad', section: 'workspace', href: '/squads' },
  { id: 'agents', label: '智能体', icon: 'agent', section: 'workspace', href: '/agents' },
  { id: 'wiki', label: 'Wiki', icon: 'wiki', section: 'workspace', href: '/wiki' },
  { id: 'memory', label: '记忆', icon: 'memory', section: 'workspace', href: '/memory' },
  { id: 'runtime', label: '运行时', icon: 'runtime', section: 'config', href: '/runtimes' },
  { id: 'skills', label: 'Skills', icon: 'skills', section: 'config', href: '/skills' },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const badge =
    item.badge != null && item.badge > 0 ? (
      <span className="nav-badge" aria-label={`${item.badge} 未读`}>
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
        className={`nav-item${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}
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

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const wsStatus = useWsStore((s) => s.status);
  const { data: issues = [] } = useIssues();
  const { data: inboxUnread } = useInboxUnreadCount();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickDispatchOpen, setQuickDispatchOpen] = useState(false);

  const workingCount = useMemo(
    () =>
      issues.filter((i) => i.status === 'in_progress' || i.status === 'in_review').length,
    [issues],
  );

  const navItems = useMemo(() => {
    const unread = inboxUnread?.count ?? 0;
    return NAV_ITEMS.map((item) =>
      item.id === 'inbox' ? { ...item, badge: unread } : item,
    );
  }, [inboxUnread?.count]);

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
        <span className="working-count" title="In Progress / In Review">
          工作中 {workingCount}
        </span>
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
          onClick={() => setQuickDispatchOpen(true)}
        >
          <Icon name="plus" size={14} className="nav-icon-svg" />
          快速派活
          <span className="kbd-hint">Q</span>
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
                    active={
                      (item.href === '/' && pathname === '/') ||
                      (item.href !== '/' && item.href != null && pathname.startsWith(item.href))
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="help-btn" title="帮助" aria-label="帮助">
          <Icon name="help" size={16} />
        </button>
      </div>
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} />
      <QuickDispatchPanel
        open={quickDispatchOpen}
        onClose={() => setQuickDispatchOpen(false)}
      />
    </aside>
  );
}
