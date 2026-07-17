# 02 — Memory 可行动 UX + D1 轻债（run-obs）

**What to build:** Memory 空态/不可用/错误分流 + Settings 深链；run-observability 票 Acceptance 勾选；`/runs` QC「去快速派活」预填 `quickPrompt`。

**Blocked by:** 01（可同会话串行；Memory 与 01 无硬代码依赖，但合并验收同刀）  

**Status:** resolved  

**Branch:** 继续 `feat/wiki-memory-ops`

## Acceptance

- [x] Memory：`status.available === false` 时横幅/提示 + 链 Settings；加载错误可读且可去 Settings
- [x] Memory：有查询无结果仍为「没有匹配的记忆」（不与不可用混淆）
- [x] `QuickDispatchPanel` 支持初始 prompt；Sidebar 识别 `?quickPrompt=` 打开并预填后清理 URL
- [x] `/runs` 无 issue 的 failed/cancelled：链到带 `quickPrompt` 的入口（有则预填）
- [x] `.scratch/run-observability/issues/0N-*.md` Acceptance 勾为完成（文档债）
- [x] typecheck 绿

## Implementation notes

- 不改 MemoryProvider 契约。  
- QC 预填为 D1 最小实现；不要重做整个 quick-create。

## Comments

（执行者）
