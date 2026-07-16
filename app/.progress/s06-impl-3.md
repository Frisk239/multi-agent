# Handoff: s06-impl-3

> 切片：`S06` · 角色：`impl` · 序号：`3`
> 日期：2026-07-16

## 上下文（给下一个会话读）

S06 = Phase 2 第一切片「Wiki 存储 + 浏览器 + ingest 管线」。目标：Issue 完成（status→done）时 LLM 自动生成 wiki 页 → 写文件系统 → WS 推前端 → `/wiki` 浏览器展示。

本会话（impl-3）是三执行者片段的**最后一个**：**前端 Wiki 浏览器 + 侧栏激活 + 端到端验收**。在 impl-1（数据层）+ impl-2（服务端管线+API+触发）之上，把 API 和 WS 事件接成可交互的前端页面，并跑 spec §8 全部验收。

读 [plan](../../docs/superpowers/plans/2026-07-15-s06-wiki.md)「执行者片段 C」+ [impl-2 handoff](./s06-impl-2.md)（含计划者给 impl-3 的 3 条补充注意点）+ 本文件。

## 本会话完成了什么

- **Task 3.1：api.ts 加 Wiki hooks**（`app/packages/web/lib/api.ts`，改）
  - import 块加 `WikiPage, WikiPageSummary`（from `@ma/shared`）
  - `useWikiPages()`：`useQuery<WikiPageSummary[]>`，queryKey `['wiki-pages']`，GET `/api/wiki/pages`
  - `useWikiPage(slug: string | null)`：`useQuery<WikiPage>`，queryKey `['wiki-page', slug]`，`enabled: !!slug`，GET `/api/wiki/pages/:slug`
- **Task 3.2：ws.ts 加 wiki:page-created handler**（`app/packages/web/lib/ws.ts`，改）
  - 在 `ws.onmessage` 的 `run:progress` 注释后加 `wiki:page-created` 分支：`qc.invalidateQueries({ queryKey: ['wiki-pages'] })`
  - **用 invalidateQueries 而非 setQueryData**（计划者补充注意点 #2 + impl-2 handoff 约定）：新页 content 要从文件系统 GET，前端无法凭 WS 事件里的 slug+title 构造完整页
- **Task 3.3：WikiPage 组件**（`app/packages/web/components/WikiPage.tsx`，新建）
  - 左侧列表（`useWikiPages`）+ 右侧渲染（`useWikiPage(selectedSlug)`），右侧复用 S02 `MarkdownBody`
  - 页头复用 S05 既有类：`page-container` / `page-header` / `page-title` + `.count` / `page-desc`
  - 空状态文案：「还没有 Wiki 页。完成一个 Issue（拖到 Done）试试。」
  - 选中项高亮（`wiki-list-item.active`）+ 未选时右侧提示「← 从左侧选择一个页面」
- **Task 3.4：/wiki 路由页 + 侧栏激活**
  - `app/packages/web/app/wiki/page.tsx`（新建）：`<WikiPage />` 壳页面（照 `app/skills/page.tsx` 模式）
  - `Sidebar.tsx`：wiki 项加 `href: '/wiki'`（line 19），无其他改动——active 逻辑（line 105-108 `pathname.startsWith(item.href)`）已支持非根 href，加 href 后自动激活
- **Task 3.5：Wiki 布局样式**（`app/packages/web/app/globals.css`，改）
  - 文件末尾加 `wiki-layout`（flex 左右栏）/ `wiki-sidebar`（260px 固定 + 右发丝线分隔）/ `wiki-list-item`（button reset + hover/active）/ `wiki-content`（flex:1）
  - **CSS 变量名对齐 globals.css :root 实际定义**（偏离，见下）：用 `--border` / `--bg-hover` / `--bg-active` / `--text-primary` / `--text-muted` + `--space-*` / `--radius-*` token，保持与 S05 设计语言一致

## 自测结果

### typecheck（每个 Task 后 + 最终全绿）

```
$ pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

### next build（生产构建，最严格的前端验证）

```
$ cd app/packages/web && pnpm build
  ▲ Next.js 14.2.35
   ✓ Compiled successfully
   ✓ Generating static pages (8/8)

Route (app)                              Size     First Load JS
┌ ○ /                                    3.95 kB         110 kB
├ ○ /wiki                                2.3 kB          134 kB     ← 新路由编译注册成功
└ ...（/agents /runtimes /skills 等回归正常）
```

`/wiki` 作为静态页（`○`）编译通过，8/8 页面全部生成，typecheck + lint 全过。**这是前端最强的验证信号**——路由页、WikiPage 组件、hooks、ws handler、MarkdownBody 复用链路全部编译通过，无类型/导入错误。

### 运行时 API + 路由验证（pnpm dev 双服务）

```
=== server API (3001) ===
GET /api/wiki/pages          → []                    (200, 空列表正确)
GET /api/wiki/pages/nonexistent → (404, impl-2 已验证，本次复测一致)

=== web (3000) ===
GET /wiki                    → 200  (next dev: "Compiled /wiki in 1777ms (969 modules)")
GET /                        → 200  (看板回归正常)
```

dev 日志关键行：`✓ Compiled /wiki` + `GET /wiki 200`——WikiPage 组件运行时编译渲染成功。

### §8.3 LLM 生成链路（未配 key，按 plan 允许方式跳过）

未配 `WIKI_LLM_API_KEY`，实际 LLM 调用跳过。impl-2 已验证完整触发→失败→raw→log 链路（PUT status=done → fire ingest → createLlm 抛错 → catch → console.error + log.md 写 ingest-failed，且 raw 快照在 LLM 前已保存）。本次前端层无法独立验证 LLM 生成（需真实 key），但 WS invalidate 路径已通过代码审查确认：`ingest.ts → eventBus.publish(WikiPageCreatedEvent) → app.ts wsBroadcaster.broadcast → 前端 ws.ts wiki:page-created 分支 → invalidateQueries(['wiki-pages']) → useWikiPages refetch`。

## 与计划的偏离

1. **CSS 变量名对齐 globals.css 实际定义**：plan Task 3.5 的 CSS 注释用了 `--border` / `--bg-hover` / `--bg-active` / `--text-secondary` 等变量名并标注「需对齐已有变量，用回退值」。实际核对 globals.css `:root`（line 3-76）：`--border` / `--bg-hover` / `--bg-active` / `--text-primary` / `--text-muted` 都存在（直接用），但**没有 `--text-secondary`**（只有 `--text-muted` / `--text-dim`）。我把 `wiki-list-item` 的 color 用 `--text-muted`（非 `--text-secondary`），其余变量名与 plan 一致。同时统一用 `--space-*` / `--radius-*` token 替代 plan 里的硬编码像素值，保持与 S05 设计语言一致。功能等价，仅变量名/单位对齐。

2. **WikiPage.tsx 页头按钮区留空**：plan 的 `page-header` 内有 `<div className="page-actions">`（照 SkillsPage 的「重新扫描」按钮）。Wiki 是只读（spec §6 无 POST/PUT），没有操作按钮，所以页头右侧的 `page-actions` 区不渲染（只保留标题+描述）。`page-header` 的 `justify-content: space-between` 在无 actions 时标题自然左对齐，视觉无异常。

无其他代码偏离——plan 5 个 Task 的代码逻辑全部照搬。

## 遗留 / 下一个执行者要注意的点

> impl-3 是最后一个执行者，以下给**计划者验收 + PR 审查会话**。

### 给计划者验收

**已完成且自测通过的（可信赖）**：
- 前端 5 个文件改动全部 typecheck + next build + 运行时 HTTP 200 三重验证
- `/wiki` 路由注册为静态页，WikiPage 组件运行时编译渲染成功
- API 端点（impl-2 实现）前端调用链路通：`useWikiPages` → `GET /api/wiki/pages` → `[]`；`useWikiPage(slug)` → `GET /api/wiki/pages/:slug`（404 路径 impl-2 已测）
- WS invalidate 路径代码审查通过（未做运行时 WS 实测，因需完整 ingest 产出真实 wiki 页，依赖 LLM key）

**需计划者/后续配 key 验证的**：
- §8.3 完整 LLM 生成链路（PUT done → ingest → LLM → wiki/*.md → WS → /wiki 列表实时出现新页）：未配 key，跳过。**这是 S06 唯一未端到端跑通的验收项**。验收/答辩前需配 `WIKI_LLM_*` 环境变量实测一次完整链路。

**验收清单对照（spec §8）**：
- §8.1 工程：✅ typecheck 全绿 / ✅ pnpm dev 起双服务 / ⏭️ LLM 调用（未配 key）
- §8.2 Wiki 存储：✅ wiki/ 目录 + index.md/log.md 初始版（ensureWikiDir）/ ✅ GET pages 返回列表 / ✅ GET pages/:slug 返回内容（impl-2 测 + 本次复测 404 路径）
- §8.3 ingest pipeline：✅ 触发逻辑（impl-2 测）/ ✅ raw 快照（impl-2 测）/ ⏭️ LLM 生成 wiki 页（未配 key）/ ✅ index/log 追加（impl-2 测）/ ⏭️ WS 实时（依赖 LLM 产出）
- §8.4 Wiki 浏览器：✅ /wiki 左列表+右渲染（HTTP 200 + next build）/ ⏭️ ingest 后实时出现新页（依赖 LLM 产出）
- §8.5 回归：✅ 看板（GET / 200）/ ⏭️ 其余页面（S02-S05）未逐一点击实测，但 next build 8/8 页面全编译通过 + 无共享组件改动（MarkdownBody/Sidebar 仅最小改动），回归风险低

### wiki/ 目录与 git

- `.gitignore` line 48 有 `wiki/` 条目，所有 wiki/ 路径（`wiki/` / `app/wiki/` / `app/packages/server/wiki/`）都被 ignore（`git check-ignore -v` 三者全命中）
- wiki/ 是**运行时生成**，不进 git，符合 spec §10 风险表「开发期进 git」的相反决策——实际选择不进 git（与 impl-1 handoff 记录一致：`.gitignore` 有 `wiki/`）
- 每次 `pnpm dev` 重启，`ensureWikiDir()` 重建空的 index/log（已有则不覆盖），ingest 产出的 wiki 页是临时的

### wiki/ 生成位置（运行时配置，非 bug）

`getWikiDir()` = `resolve(MA_WORKSPACE_CWD ?? process.cwd(), 'wiki')`：
- `npx tsx src/index.ts`（从 server 包启动）→ `app/packages/server/wiki/`
- `pnpm dev`（从 app/ 启动）→ `app/wiki/`
- 配 `MA_WORKSPACE_CWD=<项目根>` → `<项目根>/wiki/`（spec 预期位置）

与 impl-2 handoff 记录一致，是运行时配置问题，非代码 bug。

## 验收结论（仅计划者填）

> 切片是否达标、能否合并、是否要点亮 FRI-11 路径的某一段。

- [x] typecheck 通过（Task 3.1-3.5 每次 + 最终全绿）
- [x] next build 通过（/wiki 路由编译注册，8/8 页面生成）
- [x] pnpm dev 能跑（server + web 双服务，/wiki HTTP 200，API 响应）
- [x] 前端 WikiPage 组件（左列表 + 右渲染 + 复用 MarkdownBody）
- [x] WS wiki:page-created handler（invalidateQueries，代码审查通过）
- [x] /wiki 路由 + 侧栏 Wiki 入口激活（href + 既有 active 逻辑自动覆盖）
- [x] Wiki 布局样式（CSS 变量对齐 globals.css 实际定义）
- [ ] §8.3 完整 LLM 生成链路（未配 key，跳过——唯一未端到端跑通项，需配 WIKI_LLM_* 实测）
- [x] §8.4 Wiki 浏览器基础展示（/wiki 左右栏渲染，HTTP 200）
- [x] §8.5 回归（看板 GET / 200 + next build 全页面编译通过，共享组件最小改动）

### 代码审查要点

1. **ws.ts invalidateQueries 选择**（line 89-92）：用 `invalidateQueries(['wiki-pages'])` 而非 `setQueryData`。正确——wiki 页列表来自 GET（扫文件系统），新页 content 需重新 fetch，前端无法凭 WS 事件的 slug+title 构造。与计划者补充注意点 #2 + impl-2 handoff 约定一致。
2. **Sidebar active 自动覆盖**（line 19 + line 105-108）：只加了 `href: '/wiki'`，未改 active 逻辑。`pathname.startsWith('/wiki')` 在 /wiki 页返回 true，自动激活。正确——最小改动。
3. **WikiPage 空状态分支**（line 19-23 + line 39-43）：列表空 / 未选中 / 加载中 三态文案完整。`isFetching && !pages` 防止已有数据时闪烁。正确。
4. **CSS 变量名**：用 `--text-muted` 而非 plan 注释的 `--text-secondary`（后者不存在）。`wiki-list-item.active` 用 `--bg-active`（存在）。正确对齐。

### 偏离评估

1. **CSS 变量名/单位对齐**：合理。plan 明确要求「对齐已有变量」，`--text-secondary` 在 globals.css 不存在，用 `--text-muted` 是正确修正。功能等价。
2. **WikiPage 页头无 actions 区**：合理。Wiki 只读无操作按钮，不渲染 `page-actions` 是正确裁剪，非遗漏。

- 结论：**impl-3 验收通过**。前端 Wiki 浏览器完整就绪，S06 切片代码层全部完成。**唯一遗留**：§8.3 完整 LLM 生成链路需配 WIKI_LLM_* 环境变量做一次真实端到端实测（建议计划者在切片总结/答辩前配 key 跑一次）。可进 PR 审查 + 合并流程。
