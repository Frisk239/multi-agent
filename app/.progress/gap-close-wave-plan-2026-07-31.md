# Gap-close 波次计划 · 2026-07-31

> **来源：** 本会话后端/前端全量盘点（3 个子代理 + Owner 实测复核）
> **北星：** 本地 Multica 控制台体验 —— 纯本地、TS 全栈、多 Backend、DB 行即锁
> **模式：** Slice Owner 自动迭代 · 实现优先派子代理 · main 直推 · vitest + e2e 关刀
> **前置：** [improvement-analysis-2026-07-30](./improvement-analysis-2026-07-30.md) · [must-close-checklist-2026-07-30](./must-close-checklist-2026-07-30.md) · [next-wave-2026-07-31-plan](./next-wave-2026-07-31-plan.md)

---

## 0. 实测基线（本会话亲自跑过，非转述）

| 项 | 实测值 | 命令 / 出处 |
|---|---|---|
| typecheck | shared / server / web 三包全绿 | `pnpm -r typecheck` |
| 单元测试 | **124 文件 / 942 用例全通过** | `pnpm test`（shared 92 + server 538 + web 312） |
| 后端表面 | 24 路由插件 · **147 HTTP + 1 WS** | `app.ts:72-95` |
| 执行层 | 5 backend：4 真 spawn CLI + 1 诚实 stub | `runtime/registry.ts:9-15` |
| e2e | `server/scripts` **66 个 .mts**（44 个 `e2e-*`，29 用 playwright / 29 走 fetch）+ 根 `scripts/` 15 个 node 脚本 | 目录实测 |
| CI | **只跑 `pnpm -r typecheck`** | `.github/workflows/feat-branch-ci.yml:38` |

**总体判断：** 骨架齐全，差距在**纵深 + 一致性 + 护栏**。按参考侧 24 条「本地也该有的 Multica 体验」：✅17 · ◐5 · ✗4 —— 后端约 85%，前端骨架约 90%、手感层约 70%。

**未发现「文档假完成」**：半成品均为诚实 stub 或 closeout 明文 Remaining。

---

## W0 · 先修正既有文档错判（零代码，防重复功）

这四条会直接误导排期，必须先钉正。

| # | 错判 | 事实 | 处置 |
|---|---|---|---|
| 1 | [optimization-plan-2026-07-31](./optimization-plan-2026-07-31.md) TD-3「WebSocket 无重连」列为待处理 | `lib/ws.ts:243-281` **已有**指数退避重连（上限 30s）+ `WsConnectionBanner`（5 单测）+ 重连后按路由定向 invalidate（`ws.ts:144-208`，18 单测）。该文 §1.1 自己标了「O2 已有」，但 §2 Slice O2 与 §6.2 TD 表仍开放 | Slice O2 标 **已有，勿重开**；TD-3 关闭 |
| 2 | `references/deep/multica.md` 行号 | 已系统性漂移：`agent.sql` 偏移约 +140（`ClaimAgentTask` deep `:349` → 实际 `:493`）；`Backend interface` deep `agent.go:16` → `:17`；`agent.New` deep `:177` → `:284` | 差距表引用一律用 clone 实测行号，deep 只当结论索引 |
| 3 | 差距表把 Wiki / Memory 写成「对齐 Multica」 | **Multica 没有 Wiki 层也没有 Memory 层**（`server/internal`、`server/cmd` grep `wiki` 命中 0；`\bmemory\b` 只命中 in-memory 缓存） | 这两层是本仓**超车项**，口径改为「对齐 openwiki / hermes 族 + Multica 的注入形状」 |
| 4 | 「前端只有 15 个手写 e2e 脚本」 | `app/packages/server/scripts` 有 66 个 `.mts`（44 个 `e2e-*`），29 个跑 playwright | 真缺口是**无 runner、不在 CI、需手动起 dev server**，见 W4 |

---

## 波次总览

| 刀 | 主题 | 层 | 成本 | 日用痛感 | 依赖 |
|---|---|---|---|---|---|
| **W1** | 附件端到端接入 | 前端（后端零改） | 中 | **高** | — |
| **W2** | 乐观更新扩面 | 前端 | 中 | **高** | — |
| **W3** | 表单校验 + a11y 补齐 | 前端 | 中 | 中高 | — |
| **W4** | CI 护栏（测试进 CI + e2e runner） | 工程 | 小 | 间接最高 | — |
| **W5** | 后端契约 + 故障注入测试（含搜索超时） | 后端 | 中 | 间接高 | W4 先落更值 |
| **W6** | 内置自省 skill | 后端/产品 | 中 | 中（杠杆高） | — |
| **W7** | invoke gate + stage 屏障 | 后端 | 中 | 中 | — |

---

## W1 · 附件端到端接入

**性质：最确凿的断点，不是缺口。** 后端已完整建好且测过，前端一行没接。

**后端现成能力**（本刀零改动）
- `POST /api/issues/:id/attachments` —— 原始二进制 body + `X-Filename` 头（`routes/attachments.ts:44`），**上限 25 MiB**（`local-store.ts` `MAX_ATTACHMENT_BYTES`）
- `GET /api/issues/:id/attachments` 清单（`:74`）
- `GET /api/attachments/:id` 稳定下载/预览，**支持 Range 206**、`nosniff` + 收紧 CSP（`:82`）
- `DELETE /api/attachments/:id`（`:130`）· `POST /api/attachments/gc`（`:138`）
- **评论绑定链路已通**：`CreateCommentInput.attachmentIds`（`shared/schema.ts:936`，max 20）→ `routes/comments.ts:80-82` → `bindAttachmentsToComment`
- 孤儿回收：上传 24h 未绑定即可 GC（`service.ts` `ORPHAN_TTL_MS`）
- 测试：`local-store.test.ts` 29 例 + `delivery` + `range` + `routes/attachments`

**前端现状**
- grep `/attachments` = **0** · `type="file"` = **0** · `FormData(` = **0**
- 唯一替代：`comment-attachments.ts` 粘贴图 → data URL → 内嵌 markdown，**限 512 KiB**，污染评论正文，大文件不可能

### Must
1. `lib/api.ts` 加附件数据层：`useIssueAttachments(issueId)` · `useUploadAttachment()`（raw body + `encodeURIComponent` 文件名）· `useDeleteAttachment()`；失败走既有 `toastError` 语义
2. `CommentComposer`：**文件选择按钮 + 拖拽区**（`onDragOver`/`onDrop`），上传成功后把 `attachmentId` 收进本地 pending 列表，提交评论时随 `attachmentIds` 一起发
3. 粘贴图**改走真实上传**（≤25 MiB），不再内嵌 data URL；`validateImageDataUrl` 的 512 KiB 路径保留为回退并标注
4. `IssueDetail`：附件区（名称/大小/类型/下载链接/删除 + 确认弹窗），空态走 `EmptyState`
5. 纯函数抽出并单测：文件名 header 编码、大小/类型前端预校验（口径与后端一致）、pending 附件列表增删

### Out
- TipTap / 富文本全量（宪法：默认不优先）
- 图片缩略图生成、粘贴板多文件批量
- 后端任何改动（发现契约不足则记 closeout，不顺手改）

### 文件面
`web/lib/api.ts` · `web/lib/comment-attachments.ts`(+test) · `web/components/CommentComposer.tsx` · `web/components/IssueDetail.tsx` · 新 `web/lib/attachment-upload.ts`(+test)

### 验收
vitest（新纯函数 + Composer 附件态）· 新 `server/scripts/e2e-attachment-upload.mts`（上传 → 列表 → 评论绑定 → 下载 200/206 → 删除 404）· 手动：拖一个 >512 KiB 的 png 进评论框能成

---

## W2 · 乐观更新扩面

**现状：`api.ts` 70 个 `useMutation`，只有 3 个有 `onMutate`** —— `:746` reorder、`:866` issue 更新、`:929`。状态改、批量操作、Memory 增删全是等一个网络往返。

### Must
1. 抽 `lib/optimistic.ts`：`withOptimisticList` / `withOptimisticEntity`（cancelQueries → 快照 → 本地 patch → onError 回滚 → onSettled invalidate），**纯函数部分单测**
2. 接入高频路径：issue 状态改、issue 指派、批量 `bulk-status` / `bulk-assign` / `bulk-delete`
3. 回滚可见：失败时 toast 说明「已还原」，不静默回退
4. 与 WS 幂等：乐观 patch 与 `ws.ts:283-330` 的 `setQueryData` 不打架（同 key 同 shape）

### Out
- **评论乐观插入**（`ws.ts:390` spec D12 明确禁止，等 WS 回灌）
- 指派带 label 的完整回填（`api.ts:865` 注释已说明为何不乐观）
- Memory / Wiki / Automation（低频，本刀不做）

### 文件面
新 `web/lib/optimistic.ts`(+test) · `web/lib/api.ts` · `web/lib/bulk-issue-mutations.ts`(+test)

### 验收
vitest（回滚路径 + 快照隔离）· e2e：批量改状态后**不等 spinner** 立刻看到列变化，断网态回滚

---

## W3 · 表单校验 + a11y 补齐

**实测硬缺口：`aria-sort` 与 `aria-invalid` 各 0 处。**

### Must
1. `IssueListView.tsx:158-208` 6 个可排序表头：加 `aria-sort` + `tabIndex={0}` + `onKeyDown`(Enter/Space)，**键盘可达**
2. 内联错误组件 `FieldError`：`aria-invalid` + `aria-describedby` 联动，替掉「按钮变灰但不说为什么」（39 处 trim 判空里挑高频表单：新建 Issue、建队、建项目、Automation 规则）
3. **前端复用 shared Zod schema** 做提交前校验（Zod 目前只在 shared/server；前端零校验层）
4. `CreateSkillDialog.tsx` 补 `use-focus-trap`（现有 `aria-modal` 但焦点能 Tab 出去，是 10 个弹层里唯一缺口）
5. 排序状态写 URL（现仅 `sort=updated` 一个模式进 URL）

### Out
- 全站 a11y 审计 / 引入 axe 依赖
- `aria-live` 全面铺开（现 2 处，本刀只在校验失败处补）
- 5 个零 `aria-` 大组件的整体改造（AgentBuilderWizard / IssuePrCard / SquadRunsTimeline / TokenCostDashboard / WikiHealthPanel）

### 文件面
`web/components/IssueListView.tsx` · 新 `web/components/FieldError.tsx` · 新 `web/lib/form-validation.ts`(+test) · `web/components/NewIssueForm.tsx` · `web/components/CreateSkillDialog.tsx` · `web/components/KanbanBoard.tsx`

### 验收
vitest（`aria-sort` 三态断言、键盘触发排序、`aria-invalid` 联动）· e2e：纯键盘完成一次排序

---

## W4 · CI 护栏

**最便宜的杠杆。** 942 个用例 + 44 个 e2e 现在只保护「写代码那一刻的本机」。

### Must
1. `.github/workflows/feat-branch-ci.yml` 加 `pnpm test`（typecheck 后串行，3 包）
2. 写 e2e runner（`server/scripts/run-e2e.mts`）：支持 `--filter`、汇总 PASS/FAIL/SKIP、无服时**明确 SKIP 而非假绿**
3. runner 进 `package.json` script（`pnpm e2e`），**本地一键**
4. README / merge.md 记一行「关刀前跑什么」

### Out
- e2e 进 CI 强制门（需起 dev server + 真 CLI，本刀只做可跑与可选）
- 覆盖率门槛
- Windows/macOS 矩阵

### 文件面
`.github/workflows/feat-branch-ci.yml` · 新 `app/packages/server/scripts/run-e2e.mts` · `app/package.json` · `docs/agents/merge.md`

### 验收
CI 一次绿跑（含 942 用例）· `pnpm e2e --filter attachment` 本地可跑并正确汇总

---

## W5 · 后端契约 + 故障注入测试

**测试密度与风险分布错配**：编排/收尸层约 30 个测试文件，HTTP 契约层只有 1 个 `critical-mutate.contract.test.ts` + 5 个单路由测试；`run-worker.ts`（807 行）零测试 import。

### Must
1. `routes/issues.ts`（1042 行）契约测试：list/search/reorder/PUT/rerun/bulk-* 的状态码 + 错误码 + Zod 边界
2. `run-worker.ts` 故障注入：claim 竞争、prepare_lease 过期、spawn 前终态复核（`:356`）、心跳 touch、wall timeout
3. **搜索超时保护**：`GET /api/issues/search` 加语句级上限（对齐 Multica `search.go:13-26` 的 3s 理由 —— 搜不动要失败而不是转圈），并单测
4. `routes/chat.ts` / `memory.ts` / `wiki.ts` 各补最小契约测试

### Out
- 100% 覆盖 / 覆盖率门槛
- `skill/scanner.ts`(543) + `import-url.ts`(479) 的完整测试（另开一刀）
- 真机 CLI spawn e2e

### 文件面
新 `routes/issues.contract.test.ts` · 新 `orchestration/run-worker.test.ts` · `routes/issues.ts`（超时）· 新 `routes/chat.contract.test.ts` 等

### 验收
新增测试全绿且**测的是 shipped 函数而非 mock 被测逻辑**（沿用本仓既有纪律）

---

## W6 · 内置自省 skill（产品自带说明书）

**杠杆最高的产品缺口。** Multica 有 8 个 `multica-*` builtin skill 带 source map（`service/builtin_skills/`），让 agent 自己学会用产品。本仓 scanner 扫根 `.skills`，但没有产品自带说明书 —— agent 学会用 `ma issue create` 全靠 prompt 里的说明文字。

### Must
1. 建 `server/src/skill/builtin/`，先 **3 个核心**：`ma-working-on-issues`（状态流转 + CLI 回写）· `ma-squads`（leader 委派协议）· `ma-mentioning`（mention 语法与触发语义）
2. 每个含 `SKILL.md` + `references/*-source-map.md`（带本仓 `file:line`）
3. 内置 skill 进 `scanSkills()` 索引，可绑定到 agent，**但在 `/skills` UI 标为内置不可删**
4. `prompt.ts` Skills 段（`:437-443`）能注入内置 skill

### Out
- 8 个全量（先 3 个验证形状）
- skill 版本化 / 热更新
- 从上游导入 `multica-*`（不改 `references/repos/`，也不照搬文案）

### 文件面
新 `server/src/skill/builtin/**` · `server/src/skill/scanner.ts`(+test) · `server/src/runtime/prompt.ts` · `web/components/SkillsPage.tsx`

### 验收
vitest（内置 skill 被索引、不可删、能注入 prompt）· e2e：绑定内置 skill 后 run 的 prompt 含该段

---

## W7 · invoke gate + stage 屏障

两条 Multica 有、本仓 grep **0 命中**的编排语义。

### Must
1. **invoke ≠ view 闸门**：agent 上加「谁能调起我」的最小配置（`invocationPermission`），mention/subagent 派活前过闸；A2A 按**链首人类**判定（对齐 `agent_access.go:12-42`）。现只有 `subagent-dispatch.ts:13` 的深度上限 K=2，只能截长度不能表达授权
2. **stage 屏障**：子 issue 加 `stage`，**同阶段全终态**才唤醒父 agent（对齐 `issue_child_done.go:66/115/231`）；现有 child-done 传播会被每个子任务分别惊动
3. 两条都要 DB 迁移 + 条件 UPDATE（守宪法：DB 行即锁）

### Out
- 多人 RBAC / workspace 成员 / 角色（宪法：不做多用户）
- task-scoped token（另议，与本地 token 方案有交叉）
- 多层子 issue（`issue-create.ts:105` 现明确拒绝，保持）

### 文件面
`shared/src/schema.ts` · `server/src/db/schema.ts` + migration · `orchestration/subagent-dispatch.ts` · `orchestration/comment-trigger.ts` · 新 `orchestration/issue-stage.ts`(+test) · `web` 对应设置面

### 验收
vitest（闸门拒绝路径、屏障未闭合不唤醒、闭合唤醒一次）· e2e：两个子 issue 同 stage，先完成一个不唤醒父

---

## 排序理由

1. **W1/W2/W3 先行**：日用痛感最高且互不依赖，三刀都可独立演示。W1 尤其干净 —— 后端零改动，纯接线。
2. **W4 紧随**：等到 W1-W3 改了大量前端再补 CI，等于让这三刀的回归风险裸奔一段时间。W4 成本最小、保护面最大。
3. **W5 在 W4 之后**：测试写了但不在 CI 里，价值打半折。
4. **W6/W7 最后**：产品能力增量，不阻塞日用；W7 涉及迁移，风险最高放最后。

## 关刀规范（每刀必做）

- `pnpm -r typecheck` + `pnpm test` 全绿
- 新增/改动路径有 vitest；端到端路径有 `e2e-*.mts`
- Conventional Commits（`feat:` / `fix:` / `refactor:` / `test:` / `perf:`）
- 写 `app/.progress/<slice>-closeout-<date>.md`：改了什么 / 怎么验的 / 残留 / 下一刀建议
- push main（人已授权简化流程）
- **勿 commit** `wiki/` `*.db` 等运行产物

## 刻意不做（本波次 Out）

云 webhook · 多节点 / Redis · daemon 协议 1:1 · 密钥入库 · TipTap 全量 · Wiki 图谱 · Pi 真执行 harness · 泳道/甘特视图 · 多人 RBAC · live restore 全量 swap（等 `reopenable-db-lifecycle` 主线）

---

*计划制定：2026-07-31 · Owner 可随时否决或改序*
