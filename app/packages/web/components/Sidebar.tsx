'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';
import type { IconName } from './Icon';

type NavItem = { id: string; label: string; icon: IconName; section: string; href?: string };

// 照原型 NAV_ITEMS（app.js:16-29）；S03 只激活 issues/runtime，其余展示但不可点
const NAV_ITEMS: NavItem[] = [
  { id: 'inbox', label: '收件箱', icon: 'inbox', section: 'personal' },
  { id: 'my-issues', label: '我的 issue', icon: 'user', section: 'personal' },
  { id: 'issues', label: 'Issues', icon: 'issues', section: 'workspace', href: '/' },
  { id: 'projects', label: '项目', icon: 'project', section: 'workspace' },
  { id: 'automation', label: '自动化', icon: 'automation', section: 'workspace' },
  { id: 'agents', label: '智能体', icon: 'agent', section: 'workspace', href: '/agents' },
  { id: 'squads', label: '小队', icon: 'squad', section: 'workspace' },
  { id: 'usage', label: '用量', icon: 'usage', section: 'workspace' },
  { id: 'wiki', label: 'Wiki', icon: 'wiki', section: 'workspace' },
  { id: 'runtime', label: '运行时', icon: 'runtime', section: 'config', href: '/runtimes' },
  { id: 'skills', label: 'Skills', icon: 'skills', section: 'config', href: '/skills' },
  { id: 'settings', label: '设置', icon: 'settings', section: 'config' },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const content = (
    <>
      <Icon name={item.icon} size={15} className="nav-icon-svg" />
      {item.label}
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
  // 未实现页面：展示但不可点
  return (
    <span className="nav-item nav-item--disabled" aria-disabled="true">
      {content}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const sections = [
    { key: 'personal', items: NAV_ITEMS.filter((n) => n.section === 'personal') },
    { key: 'workspace', label: '工作区', items: NAV_ITEMS.filter((n) => n.section === 'workspace') },
    { key: 'config', label: '配置', items: NAV_ITEMS.filter((n) => n.section === 'config') },
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
      <div className="sidebar-actions">
        <button type="button" className="sidebar-search" disabled>
          <Icon name="search" size={14} className="nav-icon-svg" />
          搜索...
          <span className="kbd-hint">Ctrl+K</span>
        </button>
        <button type="button" className="sidebar-new-issue" disabled>
          <Icon name="plus" size={14} className="nav-icon-svg" />
          新建 issue
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
    </aside>
  );
}
