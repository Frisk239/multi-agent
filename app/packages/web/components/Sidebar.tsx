'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { id: string; label: string; icon: string; section: string; href?: string };

// 照原型 NAV_ITEMS（app.js:16-29）；S03 只激活 issues/runtime，其余展示但不可点
const NAV_ITEMS: NavItem[] = [
  { id: 'inbox', label: '收件箱', icon: '◉', section: 'personal' },
  { id: 'my-issues', label: '我的 issue', icon: '◎', section: 'personal' },
  { id: 'issues', label: 'Issues', icon: '◫', section: 'workspace', href: '/' },
  { id: 'projects', label: '项目', icon: '▣', section: 'workspace' },
  { id: 'automation', label: '自动化', icon: '⚙', section: 'workspace' },
  { id: 'agents', label: '智能体', icon: '◇', section: 'workspace' },
  { id: 'squads', label: '小队', icon: '◈', section: 'workspace' },
  { id: 'usage', label: '用量', icon: '◐', section: 'workspace' },
  { id: 'wiki', label: 'Wiki', icon: '📖', section: 'workspace' },
  { id: 'runtime', label: '运行时', icon: '⬡', section: 'config', href: '/runtimes' },
  { id: 'skills', label: 'Skills', icon: '⚡', section: 'config' },
  { id: 'settings', label: '设置', icon: '⚙', section: 'config' },
];

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  if (item.href) {
    return (
      <Link
        href={item.href}
        className={`nav-item${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <span className="nav-icon">{item.icon}</span>
        {item.label}
      </Link>
    );
  }
  // 未实现页面：展示但不可点
  return (
    <span className="nav-item nav-item--disabled" aria-disabled="true">
      <span className="nav-icon">{item.icon}</span>
      {item.label}
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
          {/* 中心编排节点 */}
          <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
          {/* 三个辐射 agent 节点 + 连线 */}
          <line x1="12" y1="8.8" x2="12" y2="4.5" />
          <circle cx="12" cy="3.5" r="2" />
          <line x1="9.2" y1="13.2" x2="5.8" y2="15.6" />
          <circle cx="4.8" cy="16.3" r="2" />
          <line x1="14.8" y1="13.2" x2="18.2" y2="15.6" />
          <circle cx="19.2" cy="16.3" r="2" />
        </svg>
        <span>毕设 Multi-Agent</span>
      </div>
      <div className="sidebar-actions">
        <button type="button" className="sidebar-search" disabled>
          <span className="nav-icon">⌕</span> 搜索...
          <span className="kbd-hint">Ctrl+K</span>
        </button>
        <button type="button" className="sidebar-new-issue" disabled>
          <span className="nav-icon">+</span> 新建 issue
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
          ?
        </button>
      </div>
    </aside>
  );
}
