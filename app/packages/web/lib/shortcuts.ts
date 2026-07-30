/**
 * Slice 53 · 快捷键映射（纯函数，可单测）
 * g-chord + 帮助 modal 共用此表，避免 use-shortcuts 与 KeyboardShortcutsModal 漂移。
 */

/** 窄屏侧栏抽屉阈值（px，含）：≤ 此值默认隐藏侧栏 + 汉堡 + overlay */
export const NARROW_SIDEBAR_MAX_PX = 900;

/**
 * g + 第二键 → 路由。
 * 约定：i Issues · n Inbox · c Chat · a Agents · w Wiki · r Runs · s Settings
 * 扩展：q Squads · m Memory · p Projects · u Usage/Automation 不占 g（用 CmdK）
 */
export const G_CHORD_ROUTES: Readonly<Record<string, string>> = {
  i: '/',
  n: '/inbox',
  c: '/chat',
  a: '/agents',
  w: '/wiki',
  r: '/runs',
  s: '/settings',
  q: '/squads',
  m: '/memory',
  p: '/projects',
} as const;

/** 解析 g-chord 第二键；未知键 → null */
export function resolveGChordRoute(key: string): string | null {
  if (!key) return null;
  const k = key.length === 1 ? key.toLowerCase() : key.toLowerCase();
  return G_CHORD_ROUTES[k] ?? null;
}

export type ShortcutHelpItem = {
  label: string;
  keys: string[];
};

export type ShortcutHelpGroup = {
  category: string;
  items: ShortcutHelpItem[];
};

/** 帮助 modal 用：与运行时映射同步 */
export function getShortcutHelpGroups(): ShortcutHelpGroup[] {
  return [
    {
      category: '导航 Navigation',
      items: [
        { label: '跳转到 Kanban/Issues', keys: ['g', 'i'] },
        { label: '跳转到 Inbox', keys: ['g', 'n'] },
        { label: '跳转到 Chat', keys: ['g', 'c'] },
        { label: '跳转到 Agents', keys: ['g', 'a'] },
        { label: '跳转到 Wiki', keys: ['g', 'w'] },
        { label: '跳转到 Runs', keys: ['g', 'r'] },
        { label: '跳转到 Settings', keys: ['g', 's'] },
        { label: '跳转到 Squads', keys: ['g', 'q'] },
        { label: '跳转到 Memory', keys: ['g', 'm'] },
        { label: '跳转到 Projects', keys: ['g', 'p'] },
      ],
    },
    {
      category: '操作 Actions',
      items: [
        { label: '新建 Issue', keys: ['c', '或', 'n'] },
        { label: '快速派活 (Quick Dispatch)', keys: ['q'] },
        { label: '全局搜索', keys: ['/'] },
      ],
    },
    {
      category: '视图 Views',
      items: [
        { label: '查看快捷键帮助', keys: ['?'] },
        { label: '关闭弹窗 / 撤销焦点', keys: ['Esc'] },
      ],
    },
  ];
}

/** 是否属于「可解析的 g-chord 第二键」 */
export function isGChordKey(key: string): boolean {
  return resolveGChordRoute(key) != null;
}
