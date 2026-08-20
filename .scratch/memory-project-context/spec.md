# Spec: Memory 项目上下文闭环

日期：2026-08-20
状态：已完成（closeout：`app/.progress/memory-project-context-impl-1.md`）
上一刀 Intake：squad-retirement-dispatch-closure closeout（`app/.progress/squad-retirement-dispatch-closure-impl-1.md`，Owner 已验收）
调研：`app/.progress/memory-project-context-discovery-2026-08-20.md`

## 用户路径

操作者在 Memory 页用「项目」下拉按项目过滤记忆（URL 持久化，刷新/分享不丢）；表格行与详情把 raw projectId 显示为项目名并可回链项目详情；从项目详情页一键进入「本项目记忆」；选中项目时新建 curated memory 默认归属该项目；项目被删除后记忆不迁移不消失，显示不可点击的历史 ID fallback。

## 参考与决策

- Hook/服务端三态语义已就绪（`lib/api/memory.ts:477-485`、`server routes/memory.ts:33-41`、`sqlite-text-provider.ts:94-101`）：省略=全量、空=仅全局、ID=项目+全局。
- queryKey 现把 undefined/null 折为 `''` 会串缓存，必须区分三态。
- Multica ProjectPicker 交互基线（名称化、可清空）：`references/repos/multica/packages/views/projects/components/project-picker.tsx:20-155`。
- Project hard delete 后 memory.project_id 保留原值；不静默转全局。

## Must

1. `useMemoryList` queryKey 三态区分（undefined/null/ID 各自独立缓存），queryFn 语义不变。
2. MemoryPage：项目筛选下拉（来自 `useProjects()`，`lib/api/issues.ts:399`；选项=全部项目(undefined)/仅全局(null)/各项目名称；可清空回 undefined）；筛选状态写 URL `?project=`（沿用现有 q/kind/scope 的 URLSearchParams 模式，`MemoryPage.tsx:89-152`），URL 是唯一真源；选中项目时 `useMemoryList` 传该 ID。
3. 表格行与详情「项目边界」从 raw `<code>id</code>` 升级：有项目→项目名 + 回链 `/projects/:id`；项目已删（useProjects 查不到）→ 不可点击的历史 ID 文案（如「已删项目 <id>」）。
4. ProjectDetailPage 增加「项目记忆」入口链接 → `/memory?project=<id>`。
5. 选中项目（URL 有 project=ID 且该 ID 存在）时，handleCreate 的 curated memory 默认 `projectId=当前项目`；未选项目维持现状（undefined）。UI 需可见当前将归属的项目（创建区提示或 scope 标签），且项目不存在于列表时不强塞。
6. 测试：hook queryKey 三态不串（undefined/null/ID 三个 key）；组件测试覆盖 picker 选项/URL 写入/名称回链/已删 fallback/创建默认项目；沿用本仓组件测试 mock 模式（`components/SquadsPage.test.tsx` 风格）。
7. 隔离 E2E（headless Chromium，双端口+独立 DB）：项目入口→Memory URL 带 project→刷新保持→列表只含该项目+全局（global/P/Q 三条数据不泄漏断言）→创建归属→名称回链→删除项目后 fallback 显示。不启动 CLI、不污染开发库。

## Out

- 不改 memory provider/FTS/schema/轮询语义；不做记忆编辑、批量项目迁移、项目记忆统计。
- 不重开 Wiki/Inbox/Squad；不做 Multica ProjectPicker 组件级移植。

## 验收

- 三态缓存独立；URL 刷新/回退不丢项目过滤；global-only 与跨项目隔离在 API 与 UI 均可证。
- 名称化 + 回链 + fallback 在表格与详情一致；创建默认归属可见且正确；项目删除后记忆仍在且不再误导为可点击。
