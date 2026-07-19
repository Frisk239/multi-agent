# collection-ui-polish · impl-1

日期：2026-07-19  
范围：记忆 / 运行 /小队 / 设置 四页样式对齐 Multica Collection + Settings 模式；浅/深双主题。

## 参考

- Multica `packages/views/layout/collection-page.tsx` · `CollectionPageHeader`
- Multica `packages/views/settings/components/settings-layout.tsx` · `SettingsSection` / `SettingsCard`
- Multica `packages/ui/styles/tokens.css` surface ladder

## 决策

1. **默认浅色**（对齐 Multica 真站默认），`html.dark` 切换暗色；`localStorage.ma-theme` 持久化 + 首屏 inline script 防闪。
2. **Collection header**：icon + `text-sm font-medium` 标题 + mono count + 一行 muted 描述；body 用 `page-body`。
3. **Settings**：按 SettingsSection 分组（工作区 / 阻塞修复 / 健康摘要 / 运营与诊断），卡片用 `settings-card` surface，不再整页橙色块堆叠。
4. 列表表头扁平（memory/runs/squads 无圆角大框），工具条统一 `collection-toolbar`。

## 改动

| 文件 | 说明 |
|---|---|
| `app/packages/web/lib/theme.tsx` | ThemeProvider + useTheme |
| `app/packages/web/lib/providers.tsx` | 挂 ThemeProvider |
| `app/packages/web/app/layout.tsx` | FOUC 防闪 script |
| `app/packages/web/app/globals.css` | light/dark tokens · collection header · settings section/card |
| `MemoryPage.tsx` / `RunsPage.tsx` / `SquadsPage.tsx` / `SettingsPage.tsx` | header + page-body 结构 |
| `Sidebar.tsx` | 主题切换按钮 `data-testid=theme-toggle` |

## 验收（Playwright · localhost:3000）

- `/memory`：title 含「记忆」+ count，`.page-body` / `.page-header-icon` / table 存在
- `/runs`：title「运行」+ filters + table
- `/squads`：title「小队」+ table
- `/settings`：sections = 工作区 / 健康摘要 / 运营与诊断；cards ≥ 1；checks 列表在
- theme toggle：`html.dark` + `localStorage.ma-theme=dark`；按钮 `data-theme` 同步
- `pnpm --filter @ma/web typecheck` 通过

## 非目标

- 未做全站每个页面的 header 统一（仅重点四页 + 全局 token）
- 未引入 Tailwind / shadcn；继续 CSS 变量手写组件
- light 默认可能与旧暗色习惯不同；侧栏可一切换

## 下一刀建议

- Agents / Wiki / Automation 同 Collection header
- Issue 工作台 / Helper rail（live gap）
- 设置页 Appearance 区（显式 light/dark 选项，不只侧栏）
