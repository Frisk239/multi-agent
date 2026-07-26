# Slice 15 (S3): Token 成本归因与可视化面板 关刀记录 (Closeout Report)

## 1. 任务概述
本切片完成了全栈 Token 成本归因与可视化面板系统。实现了对 `agent_run` 记录的 `prompt_tokens` 与 `completion_tokens` 按 `agent` / `project` / `day` 三维度的灵活归因统计，结合标准费率 (Prompt $3.00 / 1M tokens, Completion $15.00 / 1M tokens) 计算推估美元成本，并在 Web 控制台上提供了现代化精致的卡片与数据表可视化展示。

---

## 2. 改动明细

### 2.1 后端 API (`packages/server` & `@ma/shared`)
- **类型定义 (`packages/shared/src/schema.ts`)**:
  - 新增 `TokenUsageGroupItem` Schema / Type：定义单个归因维度的 Prompt Tokens, Completion Tokens, Total Tokens, Prompt Cost (USD), Completion Cost (USD), Total Cost (USD) 及 Run Count。
  - 新增 `TokenUsageAnalyticsResponse` Schema / Type：定义全局 Totals 汇总、Rates 费率表及维度聚合明细列表 (`items`, `byAgent`, `byProject`, `byDay`)。
- **后端路由 (`packages/server/src/routes/analytics.ts`)**:
  - 创建并实现了 `GET /api/analytics/token-usage` API 端点。
  - 支持 `days` (时间窗口 1~180 天，默认 30 天) 及 `groupBy` ('agent' | 'project' | 'day') 查询参数。
  - 自动从 SQLite 关联查询 `agent_run`, `agent`, `project`, `issue` 数据，按本地时区生成日期聚合及归因。
  - 导出并注册 `analyticsRoutes` 至 Fastify 主程序 `packages/server/src/app.ts`。

### 2.2 前端可视化 (`packages/web`)
- **API Client Hook (`packages/web/lib/api.ts`)**:
  - 增加 `useTokenUsageAnalytics(days, groupBy)` React Query Hook。
- **可视化核心组件 (`packages/web/components/TokenCostDashboard.tsx`)**:
  - **精致 KPI 卡片**: 总 Token 消耗、总推估费用 (USD $)、Token 消耗榜首 Agent、有 Token 记录的任务覆盖率。
  - **榜单排行与进度条**: 展示前 5 名最消耗 Token 的 Agent 及其占比进度条。
  - **明细数据表与交互**: 提供 7d/30d/90d 天数选择器、按 Agent/项目/日期 维度切换器、数据刷新按钮，以及精准明细表格。
- **页面挂载 (`packages/web/components/AnalyticsPage.tsx` & `/analytics`)**:
  - 创建 `AnalyticsPage.tsx` 页面组件与 Next.js `/analytics` 路由。
  - 在 `UsagePage.tsx` 页面同步挂载 `TokenCostDashboard` 组件。
  - 在 `Sidebar.tsx` 侧边栏菜单中新增「Token 成本」入口。

---

## 3. 验证结果

### 3.1 静态类型检查 (`pnpm typecheck`)
- 运行 `pnpm typecheck`：**0 TypeScript 报错**，所有 Package (shared, server, web) 均无类型问题。

### 3.2 Playwright E2E 自动化测试 (`scripts/e2e-slice15-tokencost.js`)
- 编写并执行了专用 Playwright 验证脚本 `scripts/e2e-slice15-tokencost.js`：
  - 测试后端 API 3 个聚合维度 (`agent`, `project`, `day`) 的 HTTP 响应与 Schema 正确性。
  - 使用 SQLite 注入 2M Prompt + 1M Completion Tokens 模拟 Run 数据，验证 API 推算总金额精确等于 $21.00 USD ($6.00 + $15.00)。
  - 打开 Playwright 无头浏览器访问 `/analytics` 与 `/usage` 页面，验证 `TokenCostDashboard` 渲染、KPI 卡片存在性及按钮点击交互响应。
  - **测试结果**: `🎉 [Playwright E2E] Slice 15 Token 成本归因与可视化面板 100% PASS!`

---

## 4. 相关文件汇总
- `packages/shared/src/schema.ts`
- `packages/server/src/routes/analytics.ts`
- `packages/server/src/app.ts`
- `packages/web/lib/api.ts`
- `packages/web/components/TokenCostDashboard.tsx`
- `packages/web/components/AnalyticsPage.tsx`
- `packages/web/app/analytics/page.tsx`
- `packages/web/components/UsagePage.tsx`
- `packages/web/components/Sidebar.tsx`
- `scripts/e2e-slice15-tokencost.js`
