# Goal 连续调研：前端 UX 余缺（2026-08-19）

## 范围、结论与排除

本笔记是只读快照：对照 Multica 的界面源码、已验收的原型和当前 Web/Server 契约，寻找仍会影响本地控制台日用路径的可见性或操作摩擦。结论不是要把 Multica 的 daemon 或云端协议搬进来，而是把其「任务/会话在多次使用后仍可辨、可恢复」的交互原则落在本仓。

- 原型已覆盖主导航、看板筛选和 CmdK 基线（chanpin/prototype/assets/js/app.js:242-288、370-417、785-810）；当前实现还额外提供了 URL 驱动的 Runs、会话项目/cwd 说明、运行恢复和流式消息的就近滚动（app/packages/web/components/RunsPage.tsx:197-248、404-475；app/packages/web/components/ChatPage.tsx:160-211、407-483、546-624）。这不是「重做原型」的需求。
- 已排除 CONTEXT 已关的列表返回锚定及 G7-1…G7-12（CONTEXT.md:63-64；design/roadmap.md:143-154、194），已关的 G8-6 Sheet 尾窗/再执行（design/roadmap.md:166-168、195），以及 CmdK 二阶体验池的泛泛重开（design/roadmap.md:84）。
- 不进入禁区：云/多节点、Multica daemon 1:1、密钥入库、大型 BI、TipTap、甘特/泳道（CONTEXT.md:73；design/roadmap.md:201-209），也不碰 G8-4b adapter probe（design/roadmap.md:164-167）。

### 已有 UX 优点（不作为候选重做）

| 已有能力 | 证据 | 日用价值 |
|---|---|---|
| 运行页是本地控制台独有的全局入口，状态、Agent、小队、leader 筛选及在途批量取消已齐 | app/packages/web/components/RunsPage.tsx:197-248、404-475、489-591 | 能先处理在途/失败，不必逐张 Issue 卡找。 |
| 会话列表有置顶、归档、项目绑定与 cwd 风险提示；流式时用户离开底部不会被强拉回 | app/packages/web/components/ChatPage.tsx:160-211、407-483、546-624 | 会话可以安全暂存，且长输出可读。 |
| Issue 内已有 active/past run 分组、重试和轨迹预览；轨迹请求失败会明确显示失败 | app/packages/web/components/IssueRunHistory.tsx:121-231；app/packages/web/components/RunTranscriptPreview.tsx:79-93 | 单 Issue 的排障路径已经相当完整。 |

## 候选 1（P0，推荐下一刀）：Runs Mission Control 的「任务语义 + 定位」闭环

**结论。** 全局 Runs 已有良好的状态和恢复操作，但其核心「任务」列大多只显示 8 位 issue/chat/run ID。用户在几十条历史 run 中只能凭 ID 和 Agent 猜来源；服务端也只能按结构性字段筛选。应把本仓的独立 /runs 做成可以按工作语义定位的本地 Mission Control，而不是照搬 Multica 页面。

**参考与差异。**

| 对照 | 依据 | 差异 |
|---|---|---|
| Multica 把 active 放在顶部、past 折叠，并由同一任务查询持续更新 | references/repos/multica/packages/views/issues/components/execution-log-section.tsx:23-45、90-163 | 本仓的全局 Runs 在可观测与恢复层面已更强，但还缺「这个 run 为何而生」的可扫描文本。 |
| Multica 的 run 行优先显示 durable trigger_summary；重试保留来源且显式标出 Retry，避免结构标签掩盖工作含义 | references/repos/multica/packages/views/issues/components/execution-log-section.tsx:178-220、365-423 | 本仓行只显示 issueId/chatThreadId 的 shortId（app/packages/web/components/RunsPage.tsx:738-780），没有 Issue 标题/编号、项目或会话标题。 |
| 当前 /api/runs 只从 agentRuns 取行并支持 issueId、agentId、squadId、chatThreadId、status、kind、leader | app/packages/server/src/routes/runs.ts:57-96；app/packages/shared/src/schema.ts:358-377 | 缺少 subject 投影、文本 q 与 project 语义；前端 URL 也只有 status/agent/squad/leader（app/packages/web/components/RunsPage.tsx:197-248、489-591）。 |

**用户路径。** 在侧栏看到「运行」有在途数 → 打开 /runs → 搜索「修复登录」或按项目缩小 → 一眼看到对应 Issue 标题/编号或聊天标题、来源类型和当前状态 → 打开 Issue/会话/Run 处理失败或停止在途任务 → 返回原筛选与列表位置。

**Must（端到端一刀）。**

1. 扩展 shared 观察态为稳定的 subject 投影：Issue 至少含 id、identifier、title、project；chat 至少含 id、title；quick-create 无来源时保留清晰 run 回退。服务端一次批量取关联数据，不能按每行 N+1。
2. /api/runs 与 Web hook 支持小写化 q 和 projectId（或等价且可分享的 URL 参数）；SQL/内存边界须在实现前拍板，80 条客户端过滤不可伪装成全局搜索。
3. Runs 表将「标题 + 编号/会话」作为主文本，将 kind、项目、retry/source 作为次级信息；保留现有 status、failure action、row keyboard 行为与 nested Link 的 stopPropagation。
4. 保持 URL、筛选 chip 与 list anchor 的维度包含新参数；空态要说明「没有匹配的任务/会话」，不能把加载错误伪装成空列表。

**Out。** transcript 全文搜索、跨工作区搜索、BI 报表/甘特重构、改变 run 状态机或增加云端索引。

**Playwright 验证建议。** 用确定性 fixture 建两个同 Agent 的 Issue（不同标题/项目）和一个 chat run；访问 /runs 后输入标题片段，只余目标行且 URL 含 q；改项目筛选后只显示该项目；断言主文本是标题和编号/会话标题而非仅短 ID；点 Issue/chat 链接不触发行 row 点击，返回后筛选和滚动锚点仍在；保留现有停止/重试用例。

**优先级。** P0。它直接降低每日「run 多了以后找不到工作」的成本，且是 shared 契约 + server 投影 + Web 可演示闭环，符合厚垂直切片。

## 候选 2（P1）：会话语义标题与「归档后才永久删除」的生命周期

**结论。** Chat 已经有置顶、归档和 cwd 诚实性，但没有标题编辑或永久清理接口；一批默认同名会话会迅速失去可辨性。应补会话生命周期的两个安全缺口：可命名，且只能从归档区经确认删除。

**参考与差异。**

| 对照 | 依据 | 差异 |
|---|---|---|
| Multica 在 header 提供可聚焦的行内改名，trim 后更新，输入限制 200 | references/repos/multica/packages/views/chat/components/chat-session-header.tsx:68-87、116-140 | 本仓 header 只渲染 h2 标题（app/packages/web/components/ChatPage.tsx:546-558）；shared 只有创建时可选 title，没有 title PATCH input（app/packages/shared/src/schema.ts:1836-1878、1890-1894）。 |
| Multica 默认提供可逆归档；hard delete 仅在 archived view，经确认后执行 | references/repos/multica/packages/views/chat/components/chat-thread-list.tsx:63-70、337-354、386-418；references/repos/multica/packages/views/chat/components/chat-session-header.tsx:168-205 | 本仓也有活跃/归档切换与归档/取消归档（app/packages/web/components/ChatPage.tsx:407-483），但 server 只提供 project、pin、archive 路由（app/packages/server/src/routes/chat.ts:161-229），无 rename/delete。 |

**用户路径。** 新建「与某 Agent 对话」→ 在标题处改成「G8 运行日志排障」→ 列表和 header 同步，之后可按标题区分 → 不再需要时先归档 → 在归档视图点删除、阅读确认后永久清理 → 活跃选择状态和 URL 不悬空。

**Must（端到端一刀）。**

1. shared Zod 新增非空、trim 后 1…200 的 title 更新输入；server 新增 title PATCH，并让 active/archived list 和选中 header 的 React Query cache 同步失效。
2. Header 支持明确的「重命名」入口和键盘语义：Enter 保存、Escape/取消恢复草稿、blur 不写入空白；rail 同步可见新标题。
3. 新增 delete API/UI，但只允许 archived row，必须二次确认；删除当前会话时清除/迁移选中 URL，归档区删空时回到活跃区。
4. 实现前明确历史 AgentRun 对 chatThreadId 的保留策略。chat_message 有 DB cascade（app/packages/server/src/db/schema.ts:486-501），但不可因此假设 run 历史也可丢失；删除须事务化地保住 run 的可读性，或在有 run 时明确拒绝并提示。

**Out。** AI 自动摘要命名、会话全文搜索、多用户权限、跨 provider session 迁移、在活跃列表直接硬删除。

**Playwright 验证建议。** 创建两个同 Agent 的会话，编辑其一标题，验证 header/rail/刷新后均为新标题；空标题不发请求、Escape 不改标题；归档当前会话后 URL 无残留；归档视图确认删除可移除，取消不移除；有历史 chat run 的 fixture 需覆盖选定的保留/拒绝策略。

**优先级。** P1。单用户本地 chat 进入长期使用后价值高，但删除与 run 历史的保留决策需在实现前锁定，故排在运行定位之后。

## 候选 3（P2）：Issue 工作面不把「运行加载失败」伪装成「尚未执行」

**结论。** 这不是泛化的错误 UI 重做，而是一个具体真实性缺口：Issue 内 RunStatusBar 解构 runs 为默认空数组，任何 /api/runs 失败都会落入「指派 agent 后自动执行」空提示。页面主体同样只读取 comments/activities/runs 的 data，不保留 error 状态。用户会被误导为没有 run，而不是本地 API 暂不可用。

**参考与差异。**

| 对照 | 依据 | 差异 |
|---|---|---|
| Multica 对页内独立区块使用 section-level ErrorBoundary，并提供 reset/retry，而非整页接管 | references/repos/multica/packages/ui/components/common/error-boundary.tsx:27-34、49-76、80-96 | 本仓已在 Issue 页外层使用 ErrorBoundary（app/packages/web/components/IssueDetail.tsx:43-45、449-474），但 run 数据请求的失败没有被作为区块状态传递。 |
| 本仓轨迹预览本身已区分 loading/error | app/packages/web/components/RunTranscriptPreview.tsx:79-93 | 说明模式已有；RunStatusBar 却把 useRuns 的错误默认为 [] 并显示「指派 agent 后自动执行」（app/packages/web/components/RunStatusBar.tsx:28-55）。 |
| IssueDetail 同时消费 run、comment、activity、attachment 数据 | app/packages/web/components/IssueDetail.tsx:259-265 | runs 失败会影响工作摘要/空态判断，却没有对用户说明资料不可用。 |

**用户路径。** 打开某个有历史 run 的 Issue Sheet → 本地 server 或 runs 请求短暂失败 → 仍能看/编辑 Issue，其运行区准确显示「运行状态暂不可用」和仅重试该查询的按钮 → 网络恢复后点击重试，真实 run/失败 CTA 出现；绝不显示「未执行」。

**Must（端到端一刀）。**

1. 让 Issue 工作面从一个 query source 取得 runs 的 data、isLoading、isError、error、refetch，避免同一 issue 的两个组件各自做出不一致的空态判断。
2. RunStatusBar/工作摘要在 error 时显示区块级 ErrorState + retry；只有成功且空数组时才显示「指派 agent 后自动执行」。
3. 保留 active polling、stop/retry、轨迹 preview 和整页 Issue 错误边界；为 comments/activities/attachments 明确限定本刀是否只显示非阻断提示，不能顺手扩大成全站错误状态重构。

**Out。** 重开 G3-7 的「统一失败 CTA」大池、重设计所有 list/detail 的错误态、离线缓存或服务端重试策略改造。

**Playwright 验证建议。** 拦截一个已知 Issue 的 GET /api/runs?issueId=… 返回 500：打开 Sheet，断言有 run section error/retry，且没有 run-status-empty 文案；Issue 基本字段仍可操作。解除拦截后点击重试，断言真实历史 run/正确空态回来；回归 active run 的停止与失败 run 的再执行。

**优先级。** P2。代码量低于前两项但产品信任收益明确；宜作为 P0/P1 后的短而完整可靠性切片，而不是与 G8 adapter probe 混做。

## 推荐顺序与实施前门槛

1. **P0 Runs 任务语义 + 定位**：最直接改善高频跨 Issue 的观察/恢复。
2. **P1 Chat 标题 + 安全清理**：把现有聊天从短期 demo 路径变成可积累的日用工作台。
3. **P2 Issue 运行请求真实性**：修复错误信息会造成错误行动的可信度缺口。

开 P0 前需先确认 subject 投影的 SQL 查询计划、q 的大小写/中文匹配语义以及现有 e2e fixture 是否有可区分的项目/会话标题。开 P1 前必须先决定删除含历史 chat run 的会话到底是「保留 run 快照后删会话」还是「拒绝删除」，不能仅因 chat_message cascade 就默默损失可观察性。P2 的 fetch-error Playwright route 匹配要以实际 base URL/query 顺序为准。
