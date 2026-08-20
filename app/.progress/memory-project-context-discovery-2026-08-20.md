# 调研：Memory 项目上下文闭环

日期：2026-08-20
结论：`memory-project-context` 是 Squad 退役闭环之后推荐立即取的 G4/G3 小中型 UX 垂直刀。

## 本仓真实差距

- `MemoryPage` 只读/传 `q`、`kind`、`scope`，没有接 `projectId` URL 或 picker；表格和详情显示截断 raw ID，而不是项目名称/回链：`app/packages/web/components/MemoryPage.tsx:45-55,342-354,663,895`。
- Hook 和服务端已支持第三个 `projectId` 参数及其语义：`app/packages/web/lib/api/memory.ts:476-485`、`app/packages/server/src/routes/memory.ts:33-41`；SQLite provider 保证项目查询只返回「该项目 + 全局」，不泄漏其它项目：`sqlite-text-provider.ts:94-101`。

## 决策与语义

- 使用名称化 ProjectPicker，URL 是唯一筛选状态；项目详情增加「项目记忆」入口。创建 curated memory 默认携带当前项目；行/详情显示名称并可回项目，已删项目保留不可点击的历史 ID fallback。
- 必须区分 `projectId` 三态：省略参数=`undefined`（运营全量），空参数=`null`（仅全局），具体 ID=该项目+全局。现有 `queryKey` 把 undefined/null 都折为 `''`，本刀需修正，否则缓存会串结果。
- Project hard delete 之后 Memory 的 `project_id` 本就保留；不可静默变成全局或删除。

## 对标与验收

- Multica 没有同类 Memory，但其 `ProjectPicker` 用名称、可清空选择，是可复用交互基线：`references/repos/multica/packages/views/projects/components/project-picker.tsx:20-155`；原型对此只有后续 mock。
- 隔离 SQLite 写 global/P/Q 记忆；API 确认 all/global/P+global/Q 不泄漏；Playwright 走项目入口→URL→刷新→创建归属→名称回链→删除项目 fallback。
