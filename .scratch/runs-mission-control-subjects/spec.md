# Slice：Runs Mission Control — 任务语义与定位

日期：2026-08-19
Owner 决策：P0 先做 `/runs` 的 task subject 投影、服务端定位和 URL 筛选；不重写运行状态机或既有恢复流。

## 用户路径

用户从侧栏打开「运行」后，输入 `Alpha` / `登录` 或选择项目，即可在全量 run 中定位到对应 Issue 或会话；列表主文本显示 `ISS-42 · 标题` 或会话标题，次行显示类型与项目。打开 Run / Issue / 会话再返回时，浏览器保留原 URL 筛选和列表锚点。

## 参考与裁决

- Multica 将 durable trigger / issue 文本置于执行记录主位，而不是只显示内部 ID：`references/repos/multica/packages/views/issues/components/execution-log-section.tsx:178-220,365-423`。
- 本仓现状只从 `agent_run` 读列表，Web 仅显示 `issueId` / `chatThreadId` short id：`app/packages/server/src/routes/runs.ts:57-96`、`app/packages/web/components/RunsPage.tsx:739-780`。
- 选定：服务端关系投影和 SQL 过滤；不把默认 80 条浏览器结果伪装成全局搜索。

## Must

1. shared 为 `AgentRun` 增加向后兼容的 `subject` 观察态：
   - `issue?: { id, identifier, title } | null`
   - `chat?: { id, title } | null`
   - `project?: { id, title } | null`
   - `/api/runs` 列表始终给出该投影；丢失关联的旧行可为 null，UI 回退到 kind + short run id。
2. `GET /api/runs` 支持 `q` 和 `projectId`，在 DB 端完成过滤、total 和 createdAt DESC 分页；subject 关联必须是 join / 固定批量查询，禁止逐 run 再查 Issue、Thread 或 Project。
3. 有效项目归属固定为：`Issue.projectId` 优先；无 Issue 时 `chat_thread.projectId`；二者均无才 `agent_run.projectId`（独立 quick-create）。已回填 Issue 的 QC 视为 Issue 归属。
4. `q` 只搜索 Issue `identifier/title`、chat `title`、有效 project `title`。trim 后空串等于无筛选；最多 200 字符；以绑定参数和 LIKE 转义 `%`、`_`、`\\`。
5. SQLite 语义固定为 `lower(column) LIKE lower(:needle) ESCAPE '\\'`：ASCII 大小写不敏感；中文保持 Unicode 字面子串匹配；不承诺拼音、全文检索或通用 Unicode case-fold。
6. `/runs` URL 使用 `?q=` 与 `?project=`；hook queryKey/request 使用 `q` 与 API `projectId`。搜索输入可 250ms debounce + `router.replace({ scroll:false })`，不制造历史栈噪音；新维度进入 listViewKey，避免返回列表串锚。
7. UI 增搜索和项目筛选、可移除 chip 与清除全部；任务列主文本显示 Issue 编号+标题或会话标题，次行保留 kind、有效项目、重试 / cwd / 等待等既有信息。Issue/chat 嵌套 Link 必须继续 `stopPropagation`，行键盘行为不变。
8. 正常零结果文案为「没有匹配的任务/会话」；`isError` 仍显示 ErrorState，绝不伪装为空态。
9. 补真实 DB 路由契约测试与 Playwright：Issue 项目 A、chat 项目 A、独立 QC 项目 B、无命中行；验证 q、project、交集、排序/total、subject、URL/chip、主文本、嵌套链接及返回保留筛选。

## Out

- transcript / quick prompt / message 全文搜索、拼音搜索、FTS 索引
- 多工作区、BI / 甘特、run 状态机与 runtime 改造
- 把既有 auto-retry / path-lock 的每行 enrich 一并重构成另一项性能切片；本刀只确保 subject 不新增 N+1，不能宣称端点所有既有 enrich 已消除。

## 验证门槛

- server route contract + shared/web 相关单测
- `pnpm check`
- `node scripts/check-docs.mjs`
- 隔离 current-source Server + Next + Playwright，验证真实 URL/API/UI 路径

## 关刀后候选

P1：Chat 标题编辑 + 仅归档后确认删除（先拍板含历史 chat run 的保留策略）。
P2：Issue 工作面中 `/api/runs` 失败不得被伪装成「尚未执行」。
