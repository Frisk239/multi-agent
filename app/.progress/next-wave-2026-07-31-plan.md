# Next Wave Plan · 2026-07-31
**Slice Owner 会话 · 驱动下一厚切片（Goal Mode + Slice Owner + 子代理 + Playwright 验收）**

## 1. Intake（上一刀交接）
- **上一刀关刀**：phase6-robustness-polish-2026-07-30.md（a11y + robustness）、automation-execution-truth-closeout-2026-07-29.md、disaster-recovery-snapshot-closeout-2026-07-30.md、run-observability-consistency-closeout-2026-07-30.md。
- **滚动差距表**（improvement-analysis-2026-07-30.md + must-close-checklist-2026-07-30.md）：
  - 已关硬缺口：B1 retry_backoff、A1 resume equalization（claude/opencode/cursor）、A3 ops path-lock、A8 RunTree terminalReason、F3 storyline dedupe、A5 run_only（部分）、A4 Wiki 灾备（部分）。
  - 仍开放：A2 读投影残留、A4 灾备 Wiki 覆盖报告、A5 run_only 全闭、A7 inline preview、A9 Grok ACP 完整、B2 live swap、B3 路由契约测试、B6 Memory/Wiki 降级观测、B8 进程树。
  - 前端：F1 附件/粘贴图、F2 Issue Sheet 深度、F5 HelperRail vs Chat、F7 指派 combobox、F8 CmdK polish、F11 Wiki backlinks、F12 页面模式一致性、F13 scroll restoration。
- **子代理扫描结果**（explore 子代理 019fb5de-e7c1-7c92-a895-340857006474）已全面记录（backend A/B 类、frontend F 类、Playwright/vitest 覆盖）。
- **产品北星**（AGENTS.md + CONTEXT.md）：本地 Multica 控制台体验（派活/小队/run 观测/收尸/Wiki/Memory/Settings），纯本地、TS 全栈、多 Backend、DB 行即锁。

## 2. Short-align（选题拍板）
**目标切片**：**灾备 + 项目 Wiki 覆盖 + Issue Sheet 深度 + Rich Text 附件**（端到端垂直切片，可演示 restore → 新 Issue with attachments → Sheet 干活 → Wiki 运维）。

**为什么选这个？**
- ROI 最高：A4 + F1 + F2 + F5（灾备手感 + 日常写作/Sheet 体验）。
- 与上一刀（phase6 robustness/a11y）无缝衔接（live swap 依赖 snapshot + ARIA 已关）。
- 符合 Slice Owner 模式：一刀端到端可演示（Playwright 验收）。
- 避免多刀并行（人可否决）。

**可选备选**（Owner 可拍板切换）：
- 纯 resume equalization + CmdK polish（更快但手感提升小）。
- Automation run_only 深度。

**北星对齐**：复刻 Multica 的 snapshot/restore + Wiki roots + Issue Sheet split/property + rich composer。

## 3. 工作流（Goal Mode + Slice Owner）
- **模式**：Slice Owner（自动迭代，Owner 只保留结论 + 子代理出窗）。
- **子代理**：
  - explore 子代理：调研 Multica `references/repos/multica/` + chanpin/prototype/ + references/deep/（已扫描完毕）。
  - general-purpose 子代理：实现具体文件（e.g. 灾备 snapshot、Issue Sheet enhancements、rich text 附件）。
  - parallel 子代理：Playwright 测试 + vitest 验证。
- **核心流程**：
  1. Intake 上一刀 + 滚动差距表（已完成）。
  2. 短对齐下一刀（已完成）。
  3. 派探索/实现子代理（本消息后立即派）。
  4. 路径验收 + Playwright e2e（server/scripts/e2e-*.mts + web vitest）。
  5. commit（Conventional: feat:） → push main → 关刀（closeout-*.md）。
- **工具**：spawn_subagent（explore/general-purpose）、run_terminal_command（pnpm test/playwright）、read_file/search_replace 编辑文件。

## 4. 具体切片拆解（垂直切片，端到端）
**切片名称**：`feat/disaster-wiki-sheet-rich-2026-07-31`（或语义 slug）。

| 刀 | 主题 | 文件/组件 | 子代理任务 | 验收 |
|----|------|-----------|-----------|------|
| 1 | 灾备 snapshot 增强（项目 Wiki 覆盖报告） | ops-snapshot.ts, ops-recovery.ts, wiki/projects/<id>/, disaster-recovery-snapshot-closeout-2026-07-30.md | explore + implement 子代理调研 Multica snapshot + 本仓 wiki roots | Playwright restore test + vitest ops-backup.test [x] |
| 2 | Issue Sheet 深度（work-strip + CTA + custom fields） | IssueSideSheet.tsx, IssueDetail.tsx, sheet-work-surface.test.ts | implement 子代理（enhance sheet-work-surface） | Playwright e2e IssueDetail + manual Sheet 演示 [x] |
| 3 | Rich Text + 附件（CommentComposer 粘贴/上传） | CommentComposer.tsx, comment-attachments.ts, lib/comment-attachments.ts | implement 子代理 + 轻量富编辑（Plate/Milkdown） | vitest comment-attachments.test + Playwright paste test [x] |
| 4 | HelperRail vs Chat 同步 + CmdK polish + Wiki backlinks | HelperRail.tsx, CommandPalette.tsx, WikiPage.tsx | parallel 子代理 | Playwright acceptance + vitest [x] |
| 5 | 路由契约测试 + scroll restoration + 页面模式一致性 | routes/*, lib/chat-scroll.ts, layout.tsx | quick implement + 测试 | vitest + Playwright [x] |

**总验收**：Playwright e2e-slice*.mts（已有 session-resume、automation 等） + vitest（web/server） + manual verification（Sheet 干活、restore 覆盖 Wiki、附件上传）。

## 5. 工程模式守则（必读）
- 默认 main 直推（人授权简化）。
- 垂直切片：一刀端到端可演示。
- 子代理优先：Owner 只窗结论 + 文件变更。
- 禁止：改 references/repos/、云端/Redis、密钥入库。
- 记录：每个子代理回传后写 closeout-*.md + intake-*.md。
- 关刀清单：必须包含 Playwright + vitest + manual + 文件变更 + 下一刀建议。

## 6. 立即行动（Goal Mode）
1. **立即派子代理**（本消息后）：
   - explore 子代理：调研 Multica snapshot + wiki roots 实现细节。
   - implement 子代理：CommentComposer rich text + Issue Sheet enhancements。
2. **运行验收**：`pnpm test`（vitest）、`pnpm playwright`（e2e）、manual Sheet 演示。
3. **记录**：此 plan 存入 `app/.progress/next-wave-2026-07-31-plan.md`；后续每刀写 closeout-*.md。
4. **Owner 拍板**：确认优先级或切换备选刀。

**北星**：下一刀完成后，主航道体验加深到“日常可用 + 纵深手感”，符合 phase4b 收官 + UX Trust 波次。

**参考文件**（已加载）：
- AGENTS.md（工程模式、北星）
- improvement-analysis-2026-07-30.md（滚动差距）
- must-close-checklist-2026-07-30.md
- phase6-*.md（上一刀）
- chanpin/prototype/ + references/deep/multica.md（Multica 对照）
- 子代理扫描结果（backend A/B + frontend F 类）

此 plan 已记录所有分析，准备启动 **Goal Mode + Slice Owner** 驱动开发 + Playwright 验收。

**Owner 确认后立即执行**：派子代理、运行验收、写下一 closeout。
