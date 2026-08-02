# 切片档案

> **本文件 = 历史切片档案（只读参照）。** 现行「路线 + 目标 + 切片队列」真源是 [roadmap.md](roadmap.md)（§3 目标体系 · §4 队列）。工程模式见 [AGENTS.md](../AGENTS.md) §工程模式。

## 历史阶段总表（全部已关）

| 阶段 | 覆盖 | 状态 |
|---|---|---|
| S01–S02 | 看板 + WS / Issue 详情 + 时间线 + 评论 | ✅ |
| S03–S05 | 真实 agent 执行 / Squad / Skill + MCP | ✅ |
| S06–S08 | Wiki 存储 + ingest + query/health/lint + AGENTS bridge | ✅ |
| S09–S11 | MemoryProvider → pgvector → brain-first UI | ✅ |
| S12 | 产品硬化（Chrome + progress + Squad 只读 + 合成 Inbox） | ✅ |
| 补1–5（bu01–bu05） | 可靠性+真 Inbox / Agent·Squad 运营 / Quick-create / Settings / Automation | ✅（PR #12–#16） |
| Phase A–F（queue 23–73） | 体验加深 23–73 号切片（A–F 波次，含流式/可观测/生命周期等） | ✅（整队 closeout） |
| 优化波 W1–W7 / O1–O7 / P2-1–P2-4 | 附件·乐观更新·a11y·CI·契约测试·自省 skill·invoke gate·改派 lineage 等 | ✅（2026-07-30 ~ 08-01 closeout） |

**历史细节：** 各切片 handoff/impl/closeout 存 `app/.progress/`（约 700 份），命名 `<slice-id>-<role>-<seq>.md`；近期整队 closeout 见 `queue-*.md`、`*-closeout-2026-07-3*.md`、`*-closeout-2026-08-01.md`。

## 切法原则（沿用）

1. 每片端到端可跑——做完浏览器里能看到新东西
2. 不按工作量切，按「做完看到什么」切
3. 当前切片细化到可执行，后续只占位，做到时各自起会话细化
4. 一切片一 feature 分支（日常默认可 main 直推，高风险才 feat 隔离）
