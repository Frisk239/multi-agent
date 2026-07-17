'use client';

/**
 * 集中式 SVG 图标组件（Lucide 风格：24x24 viewBox, 2px stroke, round caps）
 * 替代原型中的 emoji/几何符号字符，统一视觉风格。
 */

export type IconName =
  | 'inbox'
  | 'user'
  | 'issues'
  | 'project'
  | 'automation'
  | 'agent'
  | 'squad'
  | 'usage'
  | 'wiki'
  | 'memory'
  | 'runtime'
  | 'skills'
  | 'settings'
  | 'search'
  | 'plus'
  | 'help'
  | 'arrow-left'
  | 'bot';

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

const PATHS: Record<IconName, React.ReactNode> = {
  // 收件箱：托盘 + 向下箭头
  inbox: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.5 5.5 18.5 5.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" />
    </>
  ),
  // 我的 issue：单人
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  // Issues：列表
  issues: (
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  // 项目：文件夹
  project: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  // 自动化：闪电
  automation: (
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  ),
  // 智能体：机器人
  agent: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none" />
      <line x1="12" y1="4" x2="12" y2="8" />
      <circle cx="12" cy="3" r="1" />
    </>
  ),
  // 小队：多人
  squad: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8" />
      <path d="M18 21a7 7 0 0 0-3-5.7" />
    </>
  ),
  // 用量：柱状图
  usage: (
    <>
      <line x1="4" y1="20" x2="4" y2="14" />
      <line x1="10" y1="20" x2="10" y2="8" />
      <line x1="16" y1="20" x2="16" y2="11" />
      <line x1="22" y1="20" x2="2" y2="20" />
    </>
  ),
  // Wiki：文档
  wiki: (
    <>
      <path d="M4 4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="14" y2="17" />
    </>
  ),
  // 记忆：大脑（brain-first）
  memory: (
    <>
      <path d="M9.5 2a4 4 0 0 0-3.6 5.7A3.5 3.5 0 0 0 5 14.2V15a3 3 0 0 0 3 3h.5" />
      <path d="M14.5 2a4 4 0 0 1 3.6 5.7A3.5 3.5 0 0 1 19 14.2V15a3 3 0 0 1-3 3h-.5" />
      <path d="M9.5 18v2a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-2" />
      <path d="M12 8v4" />
      <path d="M10 11h4" />
    </>
  ),
  // 运行时：服务器
  runtime: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="1" />
      <rect x="3" y="14" width="18" height="6" rx="1" />
      <circle cx="7" cy="7" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="0.8" fill="currentColor" stroke="none" />
    </>
  ),
  // Skills：星
  skills: (
    <polygon points="12 2 15.1 8.6 22 9.3 17 14.1 18.2 21 12 17.6 5.8 21 7 14.1 2 9.3 8.9 8.6 12 2" />
  ),
  // 设置：齿轮
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  // 搜索：放大镜
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </>
  ),
  // 新建：加号
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  // 帮助：问号圆圈
  help: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </>
  ),
  // 返回：左箭头
  'arrow-left': (
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </>
  ),
  // 运行时类型：终端/机器人
  bot: (
    <>
      <rect x="5" y="9" width="14" height="10" rx="2" />
      <circle cx="9.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <line x1="12" y1="5" x2="12" y2="9" />
      <circle cx="12" cy="4" r="1" />
    </>
  ),
};

export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
