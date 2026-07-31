# next-wave-2026-07-31-plan.md — 灾备 Wiki 覆盖 + Issue Sheet 深度 + Rich Text 附件切片

**执行日期：2026-07-31**  
**Slice Owner：** [Owner]  
**状态：** 启动中（调研 → implement → Playwright → closeout）

## 前序
- disaster-recovery v1 已收（`.ma-backup.zip` 基础版，仅 DB）。
- 当前 gap：Wiki tree 未打包进 snapshot；Issue Sheet 深度不足（缺少富文本附件全支持）；CommentComposer Rich Text 附件切片未完成（仅 image dataURL）。
- Multica snapshot / wiki roots 调研已就绪（见 references/repos/multica/ 和 project-wiki-roots.ts）。

## 核心任务
执行三刀：
1. **灾备项目 Wiki 覆盖**：ops-snapshot.ts 扩展为全 tree snapshot + manifest（include project wiki roots）。
2. **Issue Sheet 深度**：IssueSideSheet.tsx 增加深度/附件/富文本支持。
3. **Rich Text 附件切片**：CommentComposer.tsx 完整化富文本附件（image, file, rich embed）。

## 调研（先做 explore 子代理）
- 先用 explore 子代理调研：
  - Multica snapshot 实现（references/repos/multica/server/internal/handler/backup.go 或类似）。
  - wiki roots 细节（wiki/project-wiki-roots.ts, wiki/store.ts, ops-recovery.ts）。
  - IssueSideSheet / CommentComposer 当前实现（app/packages/web/components/）。
- 输出结构化摘要 + file:line + 选项。

## 实现子代理（优先派 explore → implement）
- implement 子代理编辑：
  - ops-snapshot.ts （新增 buildOpsWikiTreeSnapshot, manifest 生成）。
  - IssueSideSheet.tsx （增加 depth, rich text tabs, attachment preview）。
  - CommentComposer.tsx （完整 rich text toolbar, attachment upload/preview, file support）。
- 同时编辑相关：routes/ops.ts, wiki/store.ts, lib/comment-attachments.ts 等。
- 准备 Playwright 验收（e2e-slicexx-wiki-coverage.js, issue-sheet-depth.js）。

## 验收与关闭
- Playwright 跑：`pnpm test:e2e` 或专用脚本。
- 记录变更（git diff, progress）。
- 写 closeout：app/.progress/disaster-wiki-coverage-2026-07-31.md 或 .scratch/disaster-recovery/closeout.md。

**Out**：灾备 snapshot 含 Wiki + full rich text issue sheet + attachments 支持。无云/daemon 变更。

## 工程模式
- Slice Owner：选型 → 派 explore 子代理 → 派 implement 子代理（thick path） → Playwright → push main。
- 优先参考 Multica/Hermes/OpenWiki。
- 禁止在 references/ 改上游。