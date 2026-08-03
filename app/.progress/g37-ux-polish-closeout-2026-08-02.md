# G3-7 二阶体验池（取 2 项）—— closeout（2026-08-02 第四波 M4）

**刀名：** G3-7 二阶体验池（CmdK polish / 列表 scroll restoration / 失败恢复 CTA / 指派可搜 combobox / 页面模式一致性）
**Goal：** G3（前端体验）/ 目标 M4 体验与低价值收尾

## 勘察结论（防重复，教训③）

池内多项已存在（半存在确认）：CmdK 拼音（`lib/command-scorer.ts` pinyinInitial/Initials + rankCandidates 五级打分）· 最近访问（recentVisits + 清空按钮）· 列表 scroll restoration（`issue-list-scroll-restore` + KanbanBoard anchorIndex）· 指派可搜 combobox（`AssigneeSelect` assignee-search + filterAssigneeOptions）。
**缺口：** CmdK 匹配**高亮**（scorer 已产出 highlight 索引数组，渲染层未使用）；失败恢复 CTA 层级（看板卡片失败 → 进详情三步才能重试）。

## 落地 2 项

### 1. CmdK 匹配高亮
- `CommandPalette.tsx`：`filteredNav` 保留 `score.highlight`（原 `.map((x) => x.cmd)` 丢弃）；新增导出 `Highlighted` 组件按索引把匹配字符包 `<mark class="cmdk-highlight">`（前缀/子序列/拼音命中均生效）；Command 类型 + `highlight?: number[]`。
- `globals.css`：`.cmdk-item .cmdk-highlight` 琥珀底色。

### 2. 看板失败 CTA 一键重试（失败恢复三步变一步）
- `IssueCard.tsx`：失败徽标旁加「重试」按钮（`issue-card-retry`，data-testid=issue-card-retry），点按 `useRerunIssue(issue.id).mutate({})`（按当前指派/历史 agent 排队再执行，复用既有 hook + toast）；stopPropagation 不干扰拖拽/卡片点击；pending 禁用。
- `globals.css`：`.issue-card-retry` 红色描边按钮（与失败徽标同色调，层级统一）。

## 测试

- `components/CommandPalette.highlight.test.tsx`（新，4 用例）：无索引原样无 mark；前缀索引 3 段包裹且全文保留；中间命中（子序列）；拼音命中（前缀索引）——均断言 `<mark>` 数量/内容 + container.textContent 完整性。
- `pnpm typecheck` 全绿（shared/web/server）。

## 实证

- 单元：4/4 高亮用例绿（含拼音索引用例）。
- UI 路径：CmdK 输入「Iss」→ Issues 项「Iss」高亮；失败卡片出现「重试」按钮 → 点击 toast「已按当前指派/历史 agent 排队再执行」（Playwright 关刀统一验证）。

## 下一刀建议

M4 已做 G5-7 + G3-7×2，M4 完成。进入最终验收：全量门禁（typecheck + pnpm test 含 shared）+ Playwright 证据（G5-5 Settings 开关 / G5-6 UsagePage 运营区 / G4-5b Wiki backlink / G5-7 看板 JSON / G3-7 卡片重试 + CmdK 高亮）+ 回写 roadmap §4 + CONTEXT + push main。
