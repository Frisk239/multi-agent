# Slice 53 · 快捷键扩面 + 窄屏侧栏（U12）· impl-1

> 2026-07-27 · 实现子代理 · 未 commit / 未 push

## 交付

| 路径 | 内容 |
|---|---|
| `packages/web/lib/shortcuts.ts` | g-chord 映射表 + `resolveGChordRoute` + 帮助 groups + `NARROW_SIDEBAR_MAX_PX=900` |
| `packages/web/lib/shortcuts.test.ts` | 纯函数单测（gc/ga/gw + help 同步 + 阈值） |
| `packages/web/lib/use-shortcuts.ts` | 接入映射表；**g-chord 优先于单键 c/n**（修 g c 被新建吞） |
| `packages/web/components/KeyboardShortcutsModal.tsx` | 帮助列表改走 `getShortcutHelpGroups()` |
| `packages/web/components/Sidebar.tsx` | ≤900 默认隐 + 汉堡 + overlay；Esc/遮罩/路由关 |
| `packages/web/app/globals.css` | 抽屉 / 汉堡 / overlay 样式 |
| `packages/server/scripts/e2e-slice53-shortcuts-sidebar.mts` | 键盘路由 + 窄屏侧栏 Playwright |

## Must

1. ✅ 新增 g-chord：`g c` → `/chat`，`g a` → `/agents`，`g w` → `/wiki`
2. ✅ 帮助 modal 与映射同步（同源 `getShortcutHelpGroups`）
3. ✅ ≤**900px**（`NARROW_SIDEBAR_MAX_PX`）：侧栏默认隐 + `shell-hamburger` + overlay；Esc / 点遮罩关闭
4. ✅ e2e `e2e-slice53-shortcuts-sidebar.mts`（优先键盘）
5. ✅ 单测 `lib/shortcuts.test.ts`
6. ✅ typecheck web
7. ✅ progress 本文件

## Out

- 快捷键自定义设置页
- 移动 App
- 未拆 53a/53b（Must 键 + 窄屏最小集一次做完）

## testids

- `shell-hamburger` / `sidebar-overlay` / `app-sidebar`（`data-narrow` / `data-mobile-open`）
- 既有 `shortcuts-modal`

## 验收

```bash
cd D:/code/multi-agent/app/packages/web && pnpm exec vitest run lib/*shortcut* --reporter=dot 2>&1 | tail -20
pnpm typecheck
cd ../server && pnpm exec tsx scripts/e2e-slice53-shortcuts-sidebar.mts
```

## 证据（本地）

- `pnpm exec vitest run lib/*shortcut*` → 1 file, **8 passed**
- `pnpm typecheck`（@ma/web）绿
- `pnpm exec tsx scripts/e2e-slice53-shortcuts-sidebar.mts` → pass=11 fail=0
  - `g c` → `/chat` · `g a` → `/agents` · `g w` → `/wiki`
  - 帮助 modal 含 Chat/Agents
  - ≤900：汉堡默认隐侧栏 · open+overlay · Esc 关 · 点遮罩关
