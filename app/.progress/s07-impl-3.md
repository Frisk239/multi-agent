# Handoff: s07-impl-3

> 切片：`S07` · 角色：`impl` · 序号：`3`
> 日期：2026-07-16
> 分支：`feat/s07-query-health-lint`

## 上下文（给下一个会话读）

S07 = Phase 2（Wiki 知识层）第二切片。impl-1 完成数据层（shared + store + health），impl-2 完成 query/lint 管线 + 4 个 API。impl-3 是**最后一个执行者**：前端 query 对话框 + health/lint 面板 + 端到端验收。

spec：[`docs/superpowers/specs/2026-07-16-s07-wiki-query-health-lint-design.md`](../../docs/superpowers/specs/2026-07-16-s07-wiki-query-health-lint-design.md) §5.3–5.5 / §6
计划：[`docs/superpowers/plans/2026-07-16-s07-query-health-lint.md`](../../docs/superpowers/plans/2026-07-16-s07-query-health-lint.md) 执行者片段 C（Task 3.1–3.6）
前序：[`app/.progress/s07-impl-2.md`](./s07-impl-2.md)

## 本会话完成了什么

- **Task 3.1** `app/packages/web/lib/api.ts`：加 4 个 hooks
  - `useWikiQuery()` mutation → POST `/api/wiki/query`
  - `useWikiHealth()` query + `enabled: false`（按钮 `refetch()`）
  - `useWikiLint()` mutation → POST `/api/wiki/lint`
  - `useCreateWikiPage()` mutation → POST `/api/wiki/pages`，`onSuccess` invalidate `['wiki-pages']`
- **Task 3.2** `app/packages/web/components/WikiQueryDialog.tsx`（新建）：modal + 输入/提问 + MarkdownBody 答案 + 引用 tag + 存回 + 无 key 错误提示
- **Task 3.3** `app/packages/web/components/WikiHealthPanel.tsx`（新建）：结构检查表格 + 🔴/🟡/✅ pill + 语义检查报告 + 「跳转」定位
- **Task 3.4** `app/packages/web/components/WikiPage.tsx`：右上角「问答」按钮 + HealthPanel + dialog 状态
- **Task 3.5** `app/packages/web/app/globals.css`：modal / query / health / lint 样式（暗色主题变量）

5 个 commit（a82e064 / 09f8475 / 368c295 / e21208d / 340f9d2）+ handoff commit。

## 自测结果

**完整 typecheck：**

```
$ cd app && pnpm -r typecheck
Scope: 3 of 4 workspace projects
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done
```

**`pnpm dev`**（`MA_WORKSPACE_CWD=/d/code/multi-agent/tmp-s07-impl3-wiki`）：server :3001 + web :3000 正常。

**API curl（无 `WIKI_LLM_API_KEY`）：**

```
GET  /api/wiki/health 空 → {"orphans":[],"brokenLinks":[],"stubs":[],"total":0}
POST /api/wiki/query     → 500 "WIKI_LLM_API_KEY 未配置"（server 仍存活）
POST /api/wiki/lint 空页 → 200 "Wiki 中没有页面可供检查。"
POST /api/wiki/pages     → 201 slug=`query-验收测试页` 等（query- 前缀）
GET  /api/wiki/health 有数据 → total:3, orphans:2, brokenLinks:1, stubs:2
POST /api/wiki/lint 有页 → 500 无 key（不崩）
```

**Playwright UI 验收（`http://localhost:3000/wiki`）：**

| 项 | 结果 |
|---|---|
| 页头「问答」按钮 | ✓ |
| 结构检查 / 语义检查按钮 | ✓ |
| 左侧列表 3 页 + 右渲染 | ✓ |
| 结构检查表格 + 总页数/孤儿/断链/空短摘要 | ✓ `总页数: 3 · 孤儿: 2 · 断链: 1 · 空短: 2` |
| 状态 pill 🔴 孤儿 / 🔴 断链 / 🟡 空短 | ✓ |
| 「跳转」→ 选中对应左侧页并渲染正文 | ✓（断链页 active） |
| 问答 modal 打开/关闭 | ✓ |
| 无 key 提问 → 错误提示「检查 WIKI_LLM_API_KEY」 | ✓，不崩 |
| 语义检查无 key → 同样错误提示 | ✓，不崩 |
| Issues 看板回归（/） | ✓ Backlog/Todo 等列与 seed issue 正常 |

## 端到端验收（对照 spec §6）

### §6.1 工程
- [x] `pnpm -r typecheck` 全绿
- [x] `pnpm dev` 起 server + web
- [ ] 配 `WIKI_LLM_*` 后 query/lint 能调 LLM — **需配 key，本会话未配，标「需配 key」**

### §6.2 query（核心）
- [x] `/wiki` 有「问答」按钮，点击弹出对话框
- [ ] 输入问题 → markdown 答案 — **需配 key**
- [ ] 答案下方引用来源 — **需配 key**
- [ ] 关键词命中 ≥2 不调选页 / ≤1 触发 fallback / cap≤15 — **服务端 impl-2 已实现；UI 未配 key 未测 LLM 路径**
- [x] 「存为 wiki 页」链路：`useCreateWikiPage` + invalidate + WS `wiki:page-created` 已接线；API 存回 201 + `query-` 前缀已验
- [ ] 无 wiki 页时「没有找到相关页面」— **需配 key**（空页路径会先走 LLM 选页 fallback，无 key 时先 500）

### §6.3 health（零 LLM）
- [x] 「结构检查」瞬时返回
- [x] 孤儿 / 断链 / 空短检测正确（构造数据：断链页链 missing + 引用验收页；短页 4 字）
- [x] 表格 + 状态 pill
- [x] 「跳转」定位问题页

### §6.4 lint（LLM）
- [x] 「语义检查」有 Loading 态（`语义检查中…`）
- [ ] 返回 markdown 报告 — **需配 key**
- [ ] 报告四类问题 — **需配 key**
- [x] 无 API key 时提示错误、不崩溃

### §6.5 回归
- [x] Issues 看板可开（S01）
- [x] wiki 浏览器左列表右渲染不变（S06）
- [ ] S06 ingest（Issue done → wiki）本会话未重跑端到端，代码路径未改

## 与计划的偏离

1. **按钮 class**：计划写 `btn btn-primary` / `btn btn-secondary`；现有 globals 实际是 `.btn-primary` / `.btn-ghost`（无 `.btn-secondary`）。实现改用现有类，避免无样式按钮。
2. **暗色主题 CSS**：计划示例偏浅色回退值；实现改用项目已有 `--bg-elevated` / `--shadow-modal` / `rgba(red,0.08)` 等，与 S05/S06 一致。
3. **HealthPanel 跳转**：计划伪代码无 onSelectPage；为满足 spec §6.3「跳转」验收，加可选 `onSelectPage?: (slug) => void`，WikiPage 传入 `setSelectedSlug`。
4. **存回失败提示**：Dialog 额外展示 `createPage.isError`，计划未写，防静默失败。
5. **LLM 链路**：本机无 `WIKI_LLM_API_KEY`，query/lint 成功路径标「需配 key」；无 key 错误路径与 health/存回/UI 已验。

## 遗留 / 计划者要注意的点

1. **切片可合并条件**：前端 + API + 无 key 降级已齐；若答辩/演示要 live query/lint，需环境配 `WIKI_LLM_PROVIDER` / `WIKI_LLM_API_KEY` / `WIKI_LLM_MODEL`（可选 `WIKI_LLM_BASE_URL`）后补一次冒烟。
2. **git pull/push**：本会话 `git pull/push origin` 因代理连不上 github.com:443 失败；代码与 handoff 已在本地分支 `feat/s07-query-health-lint`。网络恢复后由计划者或人 push。
3. **临时 wiki 数据**：验收用 `tmp-s07-impl3-wiki/wiki/`（在 repo 根下，一般 gitignore）；可删，不影响代码。
4. **下一步**：计划者做 S07 整体验收 + 开 PR 审查（新会话审 diff）；非再开 impl 执行者。

## 验收结论（仅计划者填）

- [x] typecheck 通过 — 计划者复核 `pnpm -r typecheck` 全绿
- [x] `pnpm dev` 能跑 — handoff + Playwright 证据
- [x] hooks 四件套正确（enabled:false health / invalidate pages）
- [x] WikiPage 集成问答 + HealthPanel + onSelectPage 跳转
- [x] 无 key 降级提示、不崩
- [x] 偏离合理：btn-ghost、暗色 token、跳转回调
- [ ] 配 key 后 query/lint 成功路径冒烟 — 答辩前建议补一次

### S07 切片总结（impl-1~3）

| impl | 内容 | 结论 |
|---|---|---|
| 1 | shared + store + health | 通过 |
| 2 | query/lint + 4 API | 通过 |
| 3 | 前端 dialog/panel + 验收 | 通过 |

**代码层达标，可开 PR 审查合并。** 遗留仅 LLM 实配 key 冒烟（与 S06 同类）。

- 结论：**达标可合并**（PR 审查后合 main）。
