# Runs Mission Control discovery（2026-08-19）

- 推荐一刀：`GET /api/runs` 在 SQL 端做 subject 投影和 `q`/`projectId` 过滤；绝不把 `limit=80` 结果拿到 Web 再搜索（现路由只读 `agent_run`：`routes/runs.ts:57-96`）。
- shared 新增可选兼容的 `RunSubject`（`issue:{id,identifier,title}|null`、`chat:{id,title}|null`、`project:{id,title}|null`）；`AgentRun.subject` 对旧 event wire 可选，但 `/api/runs` 列表必须总返回此投影，UI 有空值则退回 kind + short run id（现 `AgentRun`：`shared/src/schema.ts:103-218`）。
- 用一条 `agent_run LEFT JOIN issue LEFT JOIN chat_thread LEFT JOIN project`（项目别名分别来自 issue/chat/run）同时取行、subject 和筛选；不得 `rows.map(...db.get())`，表关系见 `db/schema.ts:130-171,262-353,462-484`。
- `projectId` 的有效归属：有 Issue 时用 `issue.project_id`（含挂回 Issue 的 QC 子 run）；否则有会话时用 `chat_thread.project_id`；否则 standalone QC 用 `agent_run.project_id`；三者皆空不命中项目筛选。QC 的直接 project 落在 run 上：`routes/quick-runs.ts:17-27,89-106`；chat 项目落在线程：`routes/chat.ts:50-67,309-326`。
- `q` 仅匹配 issue `identifier/title`、chat `title`、有效 project `title`；不搜 `quickPrompt`/messages/transcript/跨工作区。`trim` 后空串等同未筛；建议 `max(200)`，绑定参数并转义 `%`、`_`、`\\`。
- SQLite 语义写死为 `lower(column) LIKE lower(:needle) ESCAPE '\\'`：ASCII 不分大小写；中文按 Unicode 字面子串匹配（无需/不承诺拼音或通用 Unicode case-fold），与既有 issue q 的低写意图对齐：`routes/issues.ts:162-186`。
- Web 读取并保留 `?q=&project=`（沿用项目页/看板的 `project` 命名），`useWorkspaceRuns` 的 queryKey 与请求均带二者：`RunsPage.tsx:197-248`、`lib/api/runs.ts:171-218`；输入 250ms debounce、URL replace、不滚动。
- 在现有 filter toolbar/chips 增搜索框、项目 Select、`runs-chip-q`/`runs-chip-project` 和 clear-all；listViewKey 也加入 q/project，避免返回列表串锚：`RunsPage.tsx:204-228,489-607`。
- 任务主文本显示 `ISS-1 · 标题` 或会话标题，次行显示 kind、项目、重试；保持 Issue/chat nested Link 的 `stopPropagation` 和整行键盘行为：`RunsPage.tsx:695-767,768-875`。
- 成功空数组文案改为“没有匹配的任务/会话”，仍保留 `isError` 的 ErrorState，不能混淆：`RunsPage.tsx:610-659`。
- 路由 contract test 局部造 4 行：issue→项目 A、chat→项目 A、standalone QC→项目 B、项目 C 未匹配；断言 q、project、交集、total/created 排序和 subject 内容。不要污染全局 seed（`__test-helpers__/seed-fixtures.ts:17-69`）。
- Playwright 新增 runs subjects fixture：直开 `/runs?status=all&project=proj-a&q=alpha`，断言 URL、两条 A 行及编号/标题/项目；切 B 只余 QC，清 chip 保留 status。沿用 API mock/intercept 范式：`scripts/e2e-slice64-failure-chips.mts:39-84,265-297`；当前 runs e2e 只验回滚锚：`scripts/e2e-g37-runs-scroll.mts:9-33`。
- 注意当前列表另有既存每行 auto-retry/path-lock enrich（`routes/runs.ts:25-49,86`、`path-lock.ts:243-268`）；本刀至少不可为 subject 再添 N+1，若宣称端点完全消除 N+1，须把这些改为批量输入，勿改状态机。
