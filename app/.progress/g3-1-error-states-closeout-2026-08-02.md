# G3-1 错误态三件套 closeout（2026-08-02）

> Goal G3 前端体验 · roadmap §4 队列第 1 刀（热身刀）。状态：**已关 ✅**

## 目标

Wiki 页正文 / RuntimesPage / 记忆详情三处：isError → ErrorState + 重试；不再「无限 loading / 静默空白 / 失败伪装成 404」。

## 改动

| 文件 | 改动 |
|---|---|
| `app/packages/web/components/WikiPage.tsx` | `useWikiPages`/`useWikiPage` 补 `isError/error/refetch` 解构；正文区三路：列表失败 → 「加载 Wiki 失败」ErrorState+重试；单页失败 → 「加载页面失败」ErrorState+重试（替代无限 PageSkeleton）；正常/空态不变 |
| `app/packages/web/components/RuntimesPage.tsx` | `useRuntimes` 补 `isError/error`；`isError` 早退 → 「加载运行时失败」ErrorState+重试（替代无限「加载中…」） |
| `app/packages/web/components/MemoryPage.tsx` | 列表失败行：明文报错 → ErrorState「加载记忆失败」+重试（保留「打开设置诊断」逃生门）；详情抽屉：补 `isError/error/refetch`，网络失败/真 404 不再伪装成「记忆不存在或已被删除」——前者显示「加载记忆详情失败」+重试，后者仍显示服务端 404 文案 |
| `app/packages/web/components/RuntimesPage.test.tsx` | mock 改为状态驱动（`mockRuntimesState`），新增用例：加载失败 → ErrorState + 重试按钮 + 点击调 refetch |

复用既有 `components/ErrorState.tsx`（13 处既有先例，KanbanBoard 范式）。

## 证据

- **typecheck**：`pnpm typecheck` 全仓绿（shared/server/web）
- **测试**：web 全量 60 文件 / 424 测试通过（含新增 G3-1 用例，RuntimesPage 5/5）
- **Playwright**（live dev server，`playwright-cli route --status=500` 注入失败）：
  1. Runtimes：正常 5 行 → 注入 500 → 「加载运行时失败」+重试按钮 → unroute 点重试 → 恢复 5 行 ✅
  2. Wiki 列表：注入 500 → 「加载 Wiki 失败」+重试 ✅
  3. Wiki 单页：注入 500 → 「加载页面失败」+重试（正文不再骨架屏）→ unroute 重试 → 正文恢复 ✅
  4. Memory 列表：注入 500 → 「加载记忆失败」+重试 → 重试恢复 1 行 ✅
  5. Memory 详情（`?id=` 不在列表触发详情 fetch）：注入 500 → 「加载记忆详情失败」+重试；unroute 重试 → 真 404 显示「记忆不存在」（不再伪装）✅
  - 截图证据：`.playwright-cli/g3-1-runtimes-error.png`（Runtimes 错误态）
- React Query 默认重试 3 次后才进入 isError——实测等待 ~10s 后错误态出现，符合预期

## 决策

- 三处统一 `ErrorState` + `onRetry={() => void refetch()}`（KanbanBoard.tsx:652 范式），不新造组件。
- Memory 列表错误行保留「打开设置诊断」链接（原行为），置于 ErrorState 下方。
- Wiki 404（无效 slug）：保留既有 URL 清理行为（列表加载后自动清 slug 回「从左侧选择」），不额外做 not-found 页——G3-1 范围按 roadmap 原文（正文失败 ErrorState），404 特例价值低且会改变现有导航行为。

## 未做（后续刀）

- `app/not-found.tsx` 路由级 404 页（全站，非本刀范围）
- G3-2 看板键盘可达 / G3-3 inline transcript（G3 队列后续刀）
